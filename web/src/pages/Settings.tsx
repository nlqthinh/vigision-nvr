import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { CameraConfig, VigisionConfig } from "@/types/vigisionConfig";
import useSWR from "swr";
import FilterSwitch from "@/components/filter/FilterSwitch";
import { ZoneMaskFilterButton } from "@/components/filter/ZoneMaskFilter";
import { PolygonType } from "@/types/canvas";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import scrollIntoView from "scroll-into-view-if-needed";
import ObjectSettingsView from "@/views/settings/ObjectSettingsView";
import MotionTunerView from "@/views/settings/MotionTunerView";
import MasksAndZonesView from "@/views/settings/MasksAndZonesView";
import AuthenticationView from "@/views/settings/AuthenticationView";
import { FaTools, FaBug, FaUser } from "react-icons/fa";
import "./SettingStyle.css"
import { PiPolygonFill, PiSecurityCameraFill } from "react-icons/pi";

import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function Settings() {
  const { data: profile } = useSWR("/profile", fetcher);
  const isAdmin = profile?.username === "admin";

  const settingsViews = isAdmin
    ? ["masks / zones", "motion tuner", "debug", "users"]
    : ["users"];

  const settingsIcons = {
    "masks / zones": <PiPolygonFill />,
    "motion tuner": <FaTools />,
    debug: <FaBug />,
    users: <FaUser />,
  };

  const { state } = useLocation();
  const initialPage = state?.view || (isAdmin ? "masks / zones" : "users");
  const [page, setPage] = useState<typeof settingsViews[number]>(initialPage);
  const [pageToggle, setPageToggle] = useState(initialPage);

  const tabsRef = useRef<HTMLDivElement | null>(null);

  const { data: config } = useSWR<VigisionConfig>("config");

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);

  const cameras = useMemo(() => {
    if (!config) {
      return [];
    }

    return Object.values(config.cameras)
      .filter((conf) => conf.ui.dashboard && conf.enabled)
      .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
  }, [config]);

  const [selectedCamera, setSelectedCamera] = useState<string>("");

  const [filterZoneMask, setFilterZoneMask] = useState<PolygonType[]>();

  const handleDialog = useCallback(
    (save: boolean) => {
      if (unsavedChanges && save) {
        // TODO
      }
      setConfirmationDialogOpen(false);
      setUnsavedChanges(false);
    },
    [unsavedChanges],
  );

  useEffect(() => {
    if (cameras.length > 0 && selectedCamera === "") {
      setSelectedCamera(cameras[0].name);
    }
  }, [cameras, selectedCamera]);

  useEffect(() => {
    if (tabsRef.current) {
      const element = tabsRef.current.querySelector(
        `[data-nav-item="${pageToggle}"]`,
      );
      if (element instanceof HTMLElement) {
        scrollIntoView(element, {
          behavior: "smooth",
          inline: "start",
        });
      }
    }
  }, [tabsRef, pageToggle]);

  useEffect(() => {
    document.title = "Settings - Vigision";
  }, []);

  return (
    <div className="flex size-full flex-col p-2">
      <div className="relative flex h-11 w-full items-center justify-between">
        {(page == "debug" ||
          page == "masks / zones" ||
          page == "motion tuner") && (
            <div className="ml-2 flex flex-shrink-0 items-center gap-2">
              <CameraSelectButton
                allCameras={cameras}
                selectedCamera={selectedCamera}
                setSelectedCamera={setSelectedCamera}
              />
              {page == "masks / zones" && (
                <ZoneMaskFilterButton
                  selectedZoneMask={filterZoneMask}
                  updateZoneMaskFilter={setFilterZoneMask}
                />
              )}
              
            </div>
          )}
        <ScrollArea dir="rtl" className="w-full whitespace-nowrap">
          <div ref={tabsRef} className="flex flex-row">
            <ToggleGroup
              className="*:rounded-md *:px-3 *:py-4"
              type="single"
              size="sm"
              value={pageToggle}
              onValueChange={(value) => {
                if (value) {
                  setPageToggle(value);
                  setPage(value);
                }
              }}
            >
              {Object.values(settingsViews).map((item) => (
                <ToggleGroupItem
                  key={item}
                  className={`flex scroll-mx-10 items-center justify-between gap-2 ${page == "masks / zones" ? "last:mr-0" : ""
                    } ${pageToggle == item ? "" : ""}`}
                  value={item}
                  data-nav-item={item}
                  aria-label={`Select ${item}`}
                >
                  <div className="capitalize">{settingsIcons[item]}</div>
                  <div className="capitalize">{item}</div>
                  
                </ToggleGroupItem>
              ))}


            </ToggleGroup>
            <ScrollBar orientation="horizontal" className="h-0" />
          </div>
        </ScrollArea>
        
      </div>
      <div className="mt-2 flex h-full w-full flex-col items-start md:h-dvh md:pb-24">
        {isAdmin && page == "debug" && (
          <ObjectSettingsView selectedCamera={selectedCamera} />
        )}
        {isAdmin && page == "masks / zones" && (
          <MasksAndZonesView
            selectedCamera={selectedCamera}
            selectedZoneMask={filterZoneMask}
            setUnsavedChanges={setUnsavedChanges}
          />
        )}
        {isAdmin && page == "motion tuner" && (
          <MotionTunerView
            selectedCamera={selectedCamera}
            setUnsavedChanges={setUnsavedChanges}
          />
        )}
        {page == "users" && <AuthenticationView />}
      </div>
      {confirmationDialogOpen && (
        <AlertDialog
          open={confirmationDialogOpen}
          onOpenChange={() => setConfirmationDialogOpen(false)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
              <AlertDialogDescription>
                Do you want to save your changes before continuing?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => handleDialog(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDialog(true)}>
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

type CameraSelectButtonProps = {
  allCameras: CameraConfig[];
  selectedCamera: string;
  setSelectedCamera: React.Dispatch<React.SetStateAction<string>>;
};

function CameraSelectButton({
  allCameras,
  selectedCamera,
  setSelectedCamera,
}: CameraSelectButtonProps) {
  const [open, setOpen] = useState(false);

  if (!allCameras.length) {
    return null;
  }

  const trigger = (
    <Button
      className="flex items-center gap-2 bg-selected capitalize hover:bg-selected/80"
      size="sm"
    >
      <PiSecurityCameraFill className="text-background dark:text-primary" />
      <div className="hidden text-background dark:text-primary md:block">
        {selectedCamera == undefined
          ? "No Camera"
          : `${allCameras?.find(s => s.name == selectedCamera)?.display_name.replaceAll("_", " ")}`}
      </div>
    </Button>
  );
  const content = (
    <>
      {isMobile && (
        <>
          <DropdownMenuLabel className="flex justify-center">
            Camera
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      )}
      <div className="scrollbar-container mb-5 h-auto max-h-[80dvh] overflow-y-auto overflow-x-hidden p-4 md:mb-1">
        <div className="flex flex-col gap-2.5">
          {allCameras.map((item) => (
            <FilterSwitch
              key={item.name}
              isChecked={item.name === selectedCamera}
              label={`${item.name.replaceAll("_", " ")} - ${item.display_name.replaceAll("_", " ")}`}
              onCheckedChange={(isChecked) => {
                if (isChecked) {
                  setSelectedCamera(item.name);
                  setOpen(false);
                }
              }}
            />
          ))}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setSelectedCamera(selectedCamera);
          }

          setOpen(open);
        }}
      >
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[75dvh] overflow-hidden">
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(open: boolean) => {
        if (!open) {
          setSelectedCamera(selectedCamera);
        }

        setOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>{content}</DropdownMenuContent>
    </DropdownMenu>
  );
}
