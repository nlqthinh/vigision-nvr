import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  useHashState,
  usePersistedOverlayState,
  useSearchEffect,
} from "@/hooks/use-overlay-state";
import { VigisionConfig } from "@/types/vigisionConfig";
import LiveBirdseyeView from "@/views/live/LiveBirdseyeView";
import LiveCameraView from "@/views/live/LiveCameraView";
import LiveDashboardView from "@/views/live/LiveDashboardView";
import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";

function Live() {
  const { data: config } = useSWR<VigisionConfig>("config");

  // selection

  const [selectedCameraName, setSelectedCameraName] = useHashState();

  // usePersistedOverlayState 
  // hook manages the state of the selected camera group. 
  // It allows the camera group state to persist across browser sessions 
  // using some form of local storage or session storage.
  // This hook also synchronizes the state with the URL's query parameters or other mechanisms, 
  // ensuring that the state can be recovered or shared via URL.
  const [cameraGroup, setCameraGroup] = usePersistedOverlayState(
    "cameraGroup",
    "default" as string,
  );

  useSearchEffect("group", (cameraGroup) => {
    if (config && cameraGroup) {
      const group = config.camera_groups[cameraGroup];

      if (group) {
        setCameraGroup(cameraGroup);
      }
    }
  });

  // fullscreen

  const mainRef = useRef<HTMLDivElement | null>(null);

  const { fullscreen, toggleFullscreen } = useFullscreen(mainRef);

  // document title

  useEffect(() => {
    if (selectedCameraName) {
      const capitalized = selectedCameraName
        .split("_")
        .map((text) => text[0].toUpperCase() + text.substring(1));
      document.title = `${capitalized.join(" ")} - Live Dashboard - Vigision`;
    } else if (cameraGroup && cameraGroup != "default") {
      document.title = `${cameraGroup.toUpperCase()} - Live Dashboard - Vigision`;
    } else {
      document.title = "Live Dashboard - Vigision";
    }
  }, [cameraGroup, selectedCameraName]);

  // settings

  const includesBirdseye = useMemo(() => {
    if (
      config &&
      Object.keys(config.camera_groups).length &&
      cameraGroup &&
      config.camera_groups[cameraGroup] &&
      cameraGroup != "default"
    ) {
      return config.camera_groups[cameraGroup].cameras.includes("birdseye");
    } else {
      return false;
    }
  }, [config, cameraGroup]);

  const cameras = useMemo(() => {
    if (!config) {
      return [];
    }

    if (
      Object.keys(config.camera_groups).length &&
      cameraGroup &&
      config.camera_groups[cameraGroup] &&
      cameraGroup != "default"
    ) {
      const group = config.camera_groups[cameraGroup];
      return Object.values(config.cameras)
        .filter((conf) => conf.enabled && group.cameras.includes(conf.name))
        .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
    }

    return Object.values(config.cameras)
      .filter((conf) => conf.ui.dashboard && conf.enabled)
      .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
  }, [config, cameraGroup]);

  const selectedCamera = useMemo(
    () => cameras.find((cam) => cam.name == selectedCameraName),
    [cameras, selectedCameraName],
  );

  return (
    <div className="size-full" ref={mainRef}>
      
      {selectedCameraName === "birdseye" ? (
        <LiveBirdseyeView
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      ) : selectedCamera ? (
        <LiveCameraView
          config={config}
          camera={selectedCamera}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      ) : (
        <LiveDashboardView
          cameras={cameras}
          cameraGroup={cameraGroup}
          includeBirdseye={includesBirdseye}
          onSelectCamera={setSelectedCameraName}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
}

export default Live;
