import TimeAgo from "../dynamic/TimeAgo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { VigisionConfig } from "@/types/vigisionConfig";
import { REVIEW_PADDING, ReviewSegment } from "@/types/review";
import { useNavigate } from "react-router-dom";
import { RecordingStartingPoint } from "@/types/record";
import axios from "axios";
import { VideoPreview } from "../player/PreviewThumbnailPlayer";
import { isCurrentHour } from "@/utils/dateUtil";
import { useCameraPreviews } from "@/hooks/use-camera-previews";
import { baseUrl } from "@/api/baseUrl";

type AnimatedEventCardProps = {
  event: ReviewSegment;
  selectedGroup?: string;
};
export function AnimatedEventCard({
  event,
  selectedGroup,
}: AnimatedEventCardProps) {
  const { data: config } = useSWR<VigisionConfig>("config");

  const currentHour = useMemo(() => isCurrentHour(event.start_time), [event]);

  const initialTimeRange = useMemo(() => {
    return {
      after: Math.round(event.start_time),
      before: Math.round(event.end_time || event.start_time + 20),
    };
  }, [event]);

  // preview

  const previews = useCameraPreviews(initialTimeRange, {
    camera: event.camera,
    fetchPreviews: !currentHour,
  });

  // visibility

  const [windowVisible, setWindowVisible] = useState(true);
  const visibilityListener = useCallback(() => {
    setWindowVisible(document.visibilityState == "visible");
  }, []);

  useEffect(() => {
    addEventListener("visibilitychange", visibilityListener);

    return () => {
      removeEventListener("visibilitychange", visibilityListener);
    };
  }, [visibilityListener]);

  // interaction

  const navigate = useNavigate();
  const onOpenReview = useCallback(() => {
    const url = selectedGroup ? `review?group=${selectedGroup}` : "review";
    navigate(url, {
      state: {
        severity: event.severity,
        recording: {
          camera: event.camera,
          startTime: event.start_time - REVIEW_PADDING,
          severity: event.severity,
        } as RecordingStartingPoint,
      },
    });
    axios.post(`reviews/viewed`, { ids: [event.id] });
  }, [navigate, selectedGroup, event]);

  // image behavior

  const aspectRatio = useMemo(() => {
    if (!config || !Object.keys(config.cameras).includes(event.camera)) {
      return 16 / 9;
    }

    const detect = config.cameras[event.camera].detect;
    return detect.width / detect.height;
  }, [config, event]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative h-24 4k:h-32"
          style={{
            aspectRatio: aspectRatio,
          }}
        >
          <div
            className="size-full cursor-pointer overflow-hidden rounded md:rounded-lg"
            onClick={onOpenReview}
          >
            {previews ? (
              <VideoPreview
                relevantPreview={previews[previews.length - 1]}
                startTime={event.start_time}
                endTime={event.end_time}
                loop
                showProgress={false}
                setReviewed={() => {}}
                setIgnoreClick={() => {}}
                isPlayingBack={() => {}}
                windowVisible={windowVisible}
              />
            ) : (
              <video
                preload="auto"
                autoPlay
                playsInline
                muted
                disableRemotePlayback
                loop
              >
                <source
                  src={`${baseUrl}api/review/${event.id}/preview?format=mp4`}
                  type="video/mp4"
                />
              </video>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-6 rounded bg-gradient-to-t from-slate-900/50 to-transparent">
            <div className="absolute bottom-0 left-1 w-full text-xs text-white">
              <TimeAgo time={event.start_time * 1000} dense />
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {`${[
          ...new Set([
            ...(event.data.objects || []),
            ...(event.data.sub_labels || []),
            ...(event.data.audio || []),
          ]),
        ]
          .filter((item) => item !== undefined && !item.includes("-verified"))
          .map((text) => text.charAt(0).toUpperCase() + text.substring(1))
          .sort()
          .join(", ")
          .replaceAll("-verified", "")} detected`}
      </TooltipContent>
    </Tooltip>
  );
}
