import WebRtcPlayer from "./WebRTCPlayer";
import { CameraConfig } from "@/types/vigisionConfig";
import AutoUpdatingCameraImage from "../camera/AutoUpdatingCameraImage";
import ActivityIndicator from "../indicators/activity-indicator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MSEPlayer from "./MsePlayer";
import JSMpegPlayer from "./JSMpegPlayer";
import { MdCircle } from "react-icons/md";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useCameraActivity } from "@/hooks/use-camera-activity";
import {
  LivePlayerError,
  LivePlayerMode,
  VideoResolutionType,
} from "@/types/live";
import useCameraLiveMode from "@/hooks/use-camera-live-mode";
import { getIconForLabel } from "@/utils/iconUtil";
import Chip from "../indicators/Chip";
import { capitalizeFirstLetter } from "@/utils/stringUtil";
import { cn } from "@/lib/utils";
import { TbExclamationCircle } from "react-icons/tb";

type LivePlayerProps = {
  cameraRef?: (ref: HTMLDivElement | null) => void;
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
  className?: string;
  cameraConfig: CameraConfig;
  preferredLiveMode?: LivePlayerMode;
  showStillWithoutActivity?: boolean;
  windowVisible?: boolean;
  playAudio?: boolean;
  micEnabled?: boolean; // only webrtc supports mic
  iOSCompatFullScreen?: boolean;
  pip?: boolean;
  autoLive?: boolean;
  onClick?: () => void;
  setFullResolution?: React.Dispatch<React.SetStateAction<VideoResolutionType>>;
  onError?: (error: LivePlayerError) => void;
};

export default function LivePlayer({
  cameraRef = undefined,
  containerRef,
  className,
  cameraConfig,
  preferredLiveMode,
  showStillWithoutActivity = true,
  windowVisible = true,
  playAudio = false,
  micEnabled = false,
  iOSCompatFullScreen = false,
  pip,
  autoLive = true,
  onClick,
  setFullResolution,
  onError,
}: LivePlayerProps) {
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  // camera activity

  const { activeMotion, activeTracking, objects, offline } =
    useCameraActivity(cameraConfig);

  const cameraActive = useMemo(
    () =>
      !showStillWithoutActivity ||
      (windowVisible && (activeMotion || activeTracking)),
    [activeMotion, activeTracking, showStillWithoutActivity, windowVisible],
  );

  // camera live state

  const liveMode = useCameraLiveMode(cameraConfig, preferredLiveMode);

  const [liveReady, setLiveReady] = useState(false);
  useEffect(() => {
    if (!autoLive || !liveReady) {
      return;
    }

    if (!cameraActive) {
      setLiveReady(false);
    }
    // live mode won't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLive, cameraActive, liveReady]);

  // camera still state

  // const stillReloadInterval = useMemo(() => {
  //   if (!windowVisible || offline || !showStillWithoutActivity) {
  //     return -1; // no reason to update the image when the window is not visible
  //   }

  //   if (liveReady) {
  //     return 60000;
  //   }

  //   if (activeMotion || activeTracking) {
  //     if (autoLive) {
  //       return 200;
  //     } else {
  //       return 59000;
  //     }
  //   }

  //   return 30000;
  // }, [
  //   autoLive,
  //   showStillWithoutActivity,
  //   liveReady,
  //   activeMotion,
  //   activeTracking,
  //   offline,
  //   windowVisible,
  // ]);

  useEffect(() => {
    setLiveReady(false);
  }, [preferredLiveMode]);

  const playerIsPlaying = useCallback(() => {
    setLiveReady(true);
  }, []);

  if (!cameraConfig) {
    return <ActivityIndicator />;
  }

  let player;
  if (!autoLive) {
    player = null;
  } else if (liveMode == "webrtc") {
    player = (
      <WebRtcPlayer
        className={`size-full rounded-lg md:rounded-2xl ${liveReady ? "" : "hidden"}`}
        camera={cameraConfig.live.stream_name}
        playbackEnabled={cameraActive}
        audioEnabled={playAudio}
        microphoneEnabled={micEnabled}
        iOSCompatFullScreen={iOSCompatFullScreen}
        onPlaying={playerIsPlaying}
        pip={pip}
        onError={onError}
      />
    );
  } else if (liveMode == "mse") {
    if ("MediaSource" in window || "ManagedMediaSource" in window) {
      player = (
        <MSEPlayer
          className={`size-full rounded-lg md:rounded-2xl ${liveReady ? "" : "hidden"}`}
          camera={cameraConfig.live.stream_name}
          playbackEnabled={cameraActive}
          audioEnabled={playAudio}
          onPlaying={playerIsPlaying}
          pip={pip}
          setFullResolution={setFullResolution}
          onError={onError}
        />
      );
    } else {
      player = (
        <div className="w-5xl text-center text-sm">
          iOS 17.1 or greater is required for this live stream type.
        </div>
      );
    }
  } else if (liveMode == "jsmpeg") {
    if (cameraActive || !showStillWithoutActivity) {
      player = (
        <JSMpegPlayer
          className="flex justify-center overflow-hidden rounded-lg md:rounded-2xl"
          camera={cameraConfig.name}
          width={cameraConfig.detect.width}
          height={cameraConfig.detect.height}
          playbackEnabled={cameraActive || !showStillWithoutActivity}
          containerRef={containerRef ?? internalContainerRef}
          onPlaying={playerIsPlaying}
        />
      );
    } else {
      player = null;
    }
  } else {
    player = <ActivityIndicator />;
  }

  return (
    <div
      ref={cameraRef ?? internalContainerRef}
      data-camera={cameraConfig.name}
      className={cn(
        "relative flex w-full cursor-pointer justify-center outline",
        activeTracking &&
          ((showStillWithoutActivity && !liveReady) || liveReady)
          ? "outline-3 rounded-lg shadow-severity_alert outline-severity_alert md:rounded-2xl"
          : "outline-0 outline-background",
        "transition-all duration-500",
        className,
      )}
      onClick={onClick}
    >
      {((showStillWithoutActivity && !liveReady) || liveReady) && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%] w-full rounded-lg bg-gradient-to-b from-black/20 to-transparent md:rounded-2xl"></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[10%] w-full rounded-lg bg-gradient-to-t from-black/20 to-transparent md:rounded-2xl"></div>
        </>
      )}
      {player}
      {!offline && !showStillWithoutActivity && !liveReady && (
        <ActivityIndicator />
      )}

      {((showStillWithoutActivity && !liveReady) || liveReady) &&
        objects.length > 0 && (
          <div className="absolute left-0 top-2 z-40">
            <Tooltip>
              <div className="flex">
                <TooltipTrigger asChild>
                  <div className="mx-3 pb-1 text-sm text-white">
                    <Chip
                      className={`z-0 flex items-start justify-between space-x-1 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500`}
                    >
                      {[
                        ...new Set([
                          ...(objects || []).map(({ label }) => label),
                        ]),
                      ]
                        .map((label) => {
                          return getIconForLabel(label, "size-3 text-white");
                        })
                        .sort()}
                    </Chip>
                  </div>
                </TooltipTrigger>
              </div>
              <TooltipContent className="capitalize">
                {[
                  ...new Set([
                    ...(objects || []).map(({ label, sub_label }) =>
                      label.endsWith("verified") ? sub_label : label,
                    ),
                  ]),
                ]
                  .filter(
                    (label) =>
                      label !== undefined && !label.includes("-verified"),
                  )
                  .map((label) => capitalizeFirstLetter(label))
                  .sort()
                  .join(", ")
                  .replaceAll("-verified", "")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

      <div
        className={`absolute inset-0 w-full ${
          showStillWithoutActivity && !liveReady ? "visible" : "invisible"
        }`}
      >
        <AutoUpdatingCameraImage
          className="size-full"
          camera={cameraConfig.name}
          showFps={false}
          cameraClasses="relative size-full flex justify-center"
          fps={cameraConfig.detect.fps}
        />
      </div>

      {offline && !showStillWithoutActivity && (
        <div className="flex size-full flex-col items-center">
          <p className="mb-5">
            {capitalizeFirstLetter(cameraConfig.name)} is offline
          </p>
          <TbExclamationCircle className="mb-3 size-10" />
          <p>No frames have been received, check error logs</p>
        </div>
      )}

      <div className="absolute right-2 top-2">
        {autoLive &&
          !offline &&
          activeMotion &&
          ((showStillWithoutActivity && !liveReady) || liveReady) && (
            <MdCircle className="mr-2 size-2 animate-pulse text-danger shadow-danger drop-shadow-md" />
          )}
      </div>
      <div className="absolute right-2 bottom-2">
        {/* {offline && showStillWithoutActivity && ( */}
          <Chip
            className={`z-0 flex items-start justify-between space-x-1 bg-background/60 text-xs capitalize`}
          >
            {cameraConfig.display_name.replaceAll("_", " ")}
          </Chip>
        {/* )} */}
      </div>
    </div>
  );
}
