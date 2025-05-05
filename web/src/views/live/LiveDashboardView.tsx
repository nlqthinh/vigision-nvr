// TODO: events (in record), snapshot, timestamp 

import { useRestart, useVigisionReviews } from "@/api/ws";
import Logo from "@/components/Logo";
import { CameraGroupSelector } from "@/components/filter/CameraGroupSelector";
import { LiveGridIcon, LiveListIcon } from "@/components/icons/LiveIcons";
import { AnimatedEventCard } from "@/components/card/AnimatedEventCard";
import BirdseyeLivePlayer from "@/components/player/BirdseyeLivePlayer";
import LivePlayer from "@/components/player/LivePlayer";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePersistence } from "@/hooks/use-persistence";
import { CameraConfig, VigisionConfig } from "@/types/vigisionConfig";
import { ReviewSegment } from "@/types/review";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isDesktop,
  isMobile,
  isMobileOnly,
  isTablet,
} from "react-device-detect";
import useSWR from "swr";
import DraggableGridLayout from "./DraggableGridLayout";
import { IoClose } from "react-icons/io5";
import { LuLayoutDashboard, LuPencil, LuPlus } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { LivePlayerError, LivePlayerMode } from "@/types/live";
import { FaCompress, FaExpand } from "react-icons/fa";
import { useResizeObserver } from "@/hooks/resize-observer";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Drawer, DrawerContent } from "../../components/ui/drawer";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { HiOutlineDotsVertical, HiTrash } from "react-icons/hi";
import IconWrapper from "../../components/ui/icon-wrapper";
import { z } from "zod";
import { useForm } from "react-hook-form";
import axios from "axios";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "../../components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import FilterSwitch from "../../components/filter/FilterSwitch";
import { Separator } from "../../components/ui/separator";
import ActivityIndicator from "../../components/indicators/activity-indicator";
import FilterInput from "@/components/filter/FilterInput";
import FilterSelect from "@/components/filter/FilterSelect";
import { FiInfo } from "react-icons/fi";
import MultiSelect from "@/components/filter/MultiSelect";
import { BsCameraVideoOffFill  } from "react-icons/bs";
import { baseUrl } from "@/api/baseUrl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type LiveDashboardViewProps = {
  cameras: CameraConfig[];
  cameraGroup?: string;
  includeBirdseye: boolean;
  onSelectCamera: (camera: string) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
};
export default function LiveDashboardView({
  cameras,
  cameraGroup,
  includeBirdseye,
  onSelectCamera,
  fullscreen,
  toggleFullscreen,
}: LiveDashboardViewProps) {
  const { data: config } = useSWR<VigisionConfig>("config");
  
  const [restartingSheetOpen, setRestartingSheetOpen] = useState(false);
  const [countdown, setCountdown] = useState(20);

  const { send: sendRestart } = useRestart();

  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;

    if (restartingSheetOpen && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown((prevCountdown) => prevCountdown - 1);
      }, 1000);
    }

    return () => {
      clearInterval(countdownInterval);
    };
  }, [restartingSheetOpen, countdown]);

  useEffect(() => {
    if (countdown === 0) {
      window.location.href = baseUrl;
    }
  }, [countdown]);

  const handleForceReload = () => {
    window.location.href = baseUrl;
  };
  // layout

  const [mobileLayout, setMobileLayout] = usePersistence<"grid" | "list">(
    "live-layout",
    isDesktop ? "grid" : "list",
  );

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const birdseyeContainerRef = useRef<HTMLDivElement>(null);

  // recent events

  const { payload: eventUpdate } = useVigisionReviews();
  const { data: allEvents, mutate: updateEvents } = useSWR<ReviewSegment[]>([
    "review",
    { limit: 10, severity: "alert" },
  ]);

  const [addCamera, setAddCamera] = useState(false);

  useEffect(() => {
    if (!eventUpdate) {
      return;
    }

    // if event is ended and was saved, update events list
    if (eventUpdate.after.severity == "alert") {
      if (eventUpdate.type == "end" || eventUpdate.type == "new") {
        setTimeout(
          () => updateEvents(),
          eventUpdate.type == "end" ? 1000 : 6000,
        );
      } else if (
        eventUpdate.before.data.objects.length <
        eventUpdate.after.data.objects.length
      ) {
        setTimeout(() => updateEvents(), 5000);
      }

      return;
    }
  }, [eventUpdate, updateEvents]);

  const events = useMemo(() => {
    if (!allEvents) {
      return [];
    }

    const date = new Date();
    date.setHours(date.getHours() - 1);
    const cutoff = date.getTime() / 1000;
    return allEvents.filter((event) => event.start_time > cutoff);
  }, [allEvents]);

  // camera live views

  const [autoLiveView] = usePersistence("autoLiveView", true);
  const [preferredLiveModes, setPreferredLiveModes] = useState<{
    [key: string]: LivePlayerMode;
  }>({});

  useEffect(() => {
    if (!cameras) return;

    const mseSupported =
      "MediaSource" in window || "ManagedMediaSource" in window;

    const newPreferredLiveModes = cameras.reduce(
      (acc, camera) => {
        const isRestreamed =
          config &&
          Object.keys(config.go2rtc.streams || {}).includes(
            camera.live.stream_name,
          );

        if (!mseSupported) {
          acc[camera.name] = isRestreamed ? "webrtc" : "jsmpeg";
        } else {
          acc[camera.name] = isRestreamed ? "mse" : "jsmpeg";
        }
        return acc;
      },
      {} as { [key: string]: LivePlayerMode },
    );

    setPreferredLiveModes(newPreferredLiveModes);
  }, [cameras, config]);

  const [{ height: containerHeight }] = useResizeObserver(containerRef);

  const hasScrollbar = useMemo(() => {
    if (containerHeight && containerRef.current) {
      return (
        containerRef.current.offsetHeight < containerRef.current.scrollHeight
      );
    }
  }, [containerRef, containerHeight]);

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

  const [visibleCameras, setVisibleCameras] = useState<string[]>([]);
  const visibleCameraObserver = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const visibleCameras = new Set<string>();
    visibleCameraObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const camera = (entry.target as HTMLElement).dataset.camera;

          if (!camera) {
            return;
          }

          if (entry.isIntersecting) {
            visibleCameras.add(camera);
          } else {
            visibleCameras.delete(camera);
          }

          setVisibleCameras([...visibleCameras]);
        });
      },
      { threshold: 0.5 },
    );

    return () => {
      visibleCameraObserver.current?.disconnect();
    };
  }, []);

  const cameraRef = useCallback(
    (node: HTMLElement | null) => {
      if (!visibleCameraObserver.current) {
        return;
      }

      try {
        if (node) visibleCameraObserver.current.observe(node);
      } catch (e) {
        // no op
      }
    },
    // we need to listen on the value of the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleCameraObserver.current],
  );

  const birdseyeConfig = useMemo(() => config?.birdseye, [config]);

  const handleError = useCallback(
    (cameraName: string, error: LivePlayerError) => {
      setPreferredLiveModes((prevModes) => {
        const newModes = { ...prevModes };
        if (error === "mse-decode") {
          newModes[cameraName] = "webrtc";
        } else {
          newModes[cameraName] = "jsmpeg";
        }
        return newModes;
      });
    },
    [setPreferredLiveModes],
  );

  return (
    <>
      <NewCameraDialog
        open={addCamera}
        setOpen={setAddCamera}
        currentCameras={cameras}
        defaultConfig={config}
        setRestartingSheetOpen={setRestartingSheetOpen}
      />
       {cameras?.length === 0 && (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
            <BsCameraVideoOffFill   className="size-16" />
            There are no cameras in this group.
          </div>
        )}
      <div
        className="scrollbar-container size-full overflow-y-auto px-1 pt-2 md:p-2"
        ref={containerRef}
      >
        {!fullscreen && (
          <div className="relative flex h-11 w-full items-center justify-between">
            <CameraGroupSelector className="mb-4" setAddCamera={setAddCamera}/>
          </div>
        )}
        {isMobile && (
          <div className="relative flex h-11 items-center justify-between">
            <Logo className="absolute inset-x-1/2 h-8 -translate-x-1/2" />
            <div className="max-w-[45%]">
              <CameraGroupSelector setAddCamera={setAddCamera}/>
            </div>
            {(!cameraGroup || cameraGroup == "default" || isMobileOnly) && (
              <div className="flex items-center gap-1">
                <Button
                  className={`p-1 ${
                    mobileLayout == "grid"
                      ? "bg-blue-900 bg-opacity-60 focus:bg-blue-900 focus:bg-opacity-60"
                      : "bg-secondary"
                  }`}
                  size="xs"
                  onClick={() => setMobileLayout("grid")}
                >
                  <LiveGridIcon layout={mobileLayout} />
                </Button>
                <Button
                  className={`p-1 ${
                    mobileLayout == "list"
                      ? "bg-blue-900 bg-opacity-60 focus:bg-blue-900 focus:bg-opacity-60"
                      : "bg-secondary"
                  }`}
                  size="xs"
                  onClick={() => setMobileLayout("list")}
                >
                  <LiveListIcon layout={mobileLayout} />
                </Button>
              </div>
            )}
            {cameraGroup && cameraGroup !== "default" && isTablet && (
              <div className="flex items-center gap-1">
                <Button
                  className={cn(
                    "p-1",
                    isEditMode
                      ? "bg-green-400 text-primary"
                      : "bg-secondary text-secondary-foreground",
                  )}
                  size="xs"
                  onClick={() =>
                    setIsEditMode((prevIsEditMode) => !prevIsEditMode)
                  }
                >
                  {isEditMode ? <IoClose /> : <LuLayoutDashboard />}
                </Button>
              </div>
            )}
          </div>
        )}

        {!fullscreen && events && events.length > 0 && (
          <ScrollArea>
            <TooltipProvider>
              <div className="flex items-center gap-2 px-1">
                {events.map((event) => {
                  return (
                    <AnimatedEventCard
                      key={event.id}
                      event={event}
                      selectedGroup={cameraGroup}
                    />
                  );
                })}
              </div>
            </TooltipProvider>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {!cameraGroup || cameraGroup == "default" || isMobileOnly ? (
          <>
            <div
              className={cn(
                "mt-2 grid grid-cols-1 gap-2 px-2 md:gap-4",
                mobileLayout == "grid" &&
                  "grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4",
                isMobile && "px-0",
              )}
            >
              {includeBirdseye && birdseyeConfig?.enabled && (
                <div
                  className={(() => {
                    const aspectRatio =
                      birdseyeConfig.width / birdseyeConfig.height;
                    if (aspectRatio > 2) {
                      return `${mobileLayout == "grid" && "col-span-2"} aspect-wide`;
                    } else if (aspectRatio < 1) {
                      return `${mobileLayout == "grid" && "row-span-2 h-full"} aspect-tall`;
                    } else {
                      return "aspect-video";
                    }
                  })()}
                  ref={birdseyeContainerRef}
                >
                  <BirdseyeLivePlayer
                    birdseyeConfig={birdseyeConfig}
                    liveMode={birdseyeConfig.restream ? "mse" : "jsmpeg"}
                    onClick={() => onSelectCamera("birdseye")}
                    containerRef={birdseyeContainerRef}
                  />
                </div>
              )}
              {cameras.map((camera) => {
                let grow;
                const aspectRatio = camera.detect.width / camera.detect.height;
                if (aspectRatio > 2) {
                  grow = `${mobileLayout == "grid" && "col-span-2"} aspect-wide`;
                } else if (aspectRatio < 1) {
                  grow = `${mobileLayout == "grid" && "row-span-2 h-full"} aspect-tall`;
                } else {
                  grow = "aspect-video";
                }
                return (
                  <LivePlayer
                    cameraRef={cameraRef}
                    key={camera.name}
                    className={`${grow} rounded-lg bg-black md:rounded-2xl`}
                    windowVisible={
                      windowVisible && visibleCameras.includes(camera.name)
                    }
                    cameraConfig={camera}
                    preferredLiveMode={preferredLiveModes[camera.name] ?? "mse"}
                    autoLive={autoLiveView}
                    onClick={() => onSelectCamera(camera.name)}
                    onError={(e) => handleError(camera.name, e)}
                  />
                );
              })}
              
            </div>
            {isDesktop && (
              <div
                className={cn(
                  "fixed",
                  isDesktop && "bottom-12 lg:bottom-9",
                  isMobile && "bottom-12 lg:bottom-16",
                  hasScrollbar && isDesktop ? "right-6" : "right-3",
                  "z-50 flex flex-row gap-2",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="cursor-pointer rounded-lg bg-secondary text-secondary-foreground opacity-60 transition-all duration-300 hover:bg-muted hover:opacity-100"
                      onClick={toggleFullscreen}
                    >
                      {fullscreen ? (
                        <FaCompress className="size-5 md:m-[6px]" />
                      ) : (
                        <FaExpand className="size-5 md:m-[6px]" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </>
        ) : (
          <DraggableGridLayout
            cameras={cameras}
            cameraGroup={cameraGroup}
            containerRef={containerRef}
            cameraRef={cameraRef}
            includeBirdseye={includeBirdseye}
            onSelectCamera={onSelectCamera}
            windowVisible={windowVisible}
            visibleCameras={visibleCameras}
            isEditMode={isEditMode}
            setIsEditMode={setIsEditMode}
            fullscreen={fullscreen}
            toggleFullscreen={toggleFullscreen}
          />
        )}
      </div>
      {restartingSheetOpen && (
        <>
          <Sheet
            open={restartingSheetOpen}
            onOpenChange={() => setRestartingSheetOpen(false)}
          >
            <SheetContent
              side="top"
              onInteractOutside={(e) => e.preventDefault()}
            >
              <div className="flex flex-col items-center">
                <ActivityIndicator />
                <SheetHeader className="mt-5 text-center">
                  <SheetTitle className="text-center">
                    Vigision is Restarting
                  </SheetTitle>
                  <SheetDescription className="text-center">
                    <p>This page will reload in {countdown} seconds.</p>
                  </SheetDescription>
                </SheetHeader>
                <Button size="lg" className="mt-5" onClick={handleForceReload}>
                  Force Reload Now
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </>
  );
}

type NewCameraDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentCameras: CameraConfig[];
  defaultConfig: VigisionConfig;
  setRestartingSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

function NewCameraDialog({
  open,
  setOpen,
  currentCameras,
  defaultConfig,
  setRestartingSheetOpen,
}: NewCameraDialogProps) {
  const { data: config, mutate: updateConfig } = useSWR<VigisionConfig>("config");
  const { send: sendRestart } = useRestart();
  
  // editing group and state

  const [editingCameraName, setEditingCameraName] = useState("");

  const editingCamera = useMemo(() => {
    if (currentCameras && editingCameraName !== undefined) {
      const camera = currentCameras.find(
        (camera) => camera.name === editingCameraName,
      );
      return camera;
    } else {
      return undefined;
    }
  }, [currentCameras, editingCameraName]);

  const [editState, setEditState] = useState<"none" | "add" | "edit">("none");
  const [isLoading, setIsLoading] = useState(false);

  // const [, , , deleteGridLayout] = usePersistence(
  //   `${activeGroup}-draggable-layout`,
  // );

  const onDeleteCamera = useCallback(
    async (name: string) => {
      // deleteGridLayout();
      // deleteGroup();

      await axios
        .put(`config/set?cameras.${name}`, { requires_restart: 0 })
        .then((res) => {
          if (res.status === 200) {
            toast.success(
              <div className="flex flex-row space-x-2 justify-center justify-items-center items-center">
              <p>{`Camera (${name}) has been deleted. Restart is require for changes to take effect.`}</p>
              <Button
                size="sm"
                onClick={() => {
                  setRestartingSheetOpen(true);
                  sendRestart("restart")
                }}
              >
                Restart Now
              </Button>
            </div>
              , {
              position: "top-center",
            });
            updateConfig();
          } else {
            setOpen(false);
            setEditState("none");
            toast.error(`Failed to save config changes: ${res.statusText}`, {
              position: "top-center",
            });
          }
        })
        .catch((error) => {
          setOpen(false);
          setEditState("none");
          toast.error(
            `Failed to save config changes: ${error.response.data.message}`,
            { position: "top-center" },
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [
      config,
      updateConfig,
      // activeGroup,
      // setGroup,
      // setOpen,
      // deleteGroup,
      // deleteGridLayout,
    ],
  );

  
  const onSave = () => {
    setOpen(false);
    setEditState("none");
  };

  const onCancel = () => {
    setEditingCameraName("");
    setEditState("none");
  };

  const onEditCamera = useCallback((camera: CameraConfig) => {
    setEditingCameraName(camera.name);
    setEditState("edit");
  }, []);

  const Overlay = isDesktop ? Dialog : Drawer;
  const Content = isDesktop ? DialogContent : DrawerContent;

  return (
    <>
      <Toaster
        className="toaster group z-[100]"
        position="top-center"
        closeButton={true}
      />
      <Overlay
        open={open}
        onOpenChange={(open) => {
          setEditingCameraName("");
          setEditState("none");
          setOpen(open);
        }}
      >
        <Content
          className={`min-w-0 ${isMobile ? "max-h-[90%] w-full rounded-t-2xl p-3" : "max-h-dvh w-6/12 overflow-y-auto"}`}
        >
          <div className="scrollbar-container my-4 flex flex-col overflow-y-auto">
            {editState === "none" && (
              <>
                <div className="flex flex-row items-center justify-between py-2">
                  <DialogTitle>Camera List</DialogTitle>
                  {/* <Tooltip>
                    <TooltipTrigger asChild> */}
                      <Button
                        variant="secondary"
                        className="size-6 rounded-md bg-secondary-foreground p-1 text-background"
                        onClick={() => {
                          setEditState("add");
                        }}
                      >
                        <LuPlus />
                      </Button>
                    {/* </TooltipTrigger>
                    <TooltipContent>Add</TooltipContent>
                </Tooltip> */}
                </div>
                {/* {currentCameras} */}
                {currentCameras.map((camera) => (
                  <CameraRow
                    key={camera.name}
                    camera={camera}
                    onDeleteCamera={() => onDeleteCamera(camera.name)}
                    onEditCamera={() => onEditCamera(camera)}
                  />
                ))}
              </>
            )}

            {editState != "none" && (
              <div>
                <div className="mb-3 flex flex-row items-center justify-center">
                  <DialogTitle>
                    {editState == "add" ? "Add" : "Edit"} Camera
                  </DialogTitle>
                </div>
                <CameraEdit
                  currentCameras={currentCameras}
                  editingCamera={editingCamera}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  onSave={onSave}
                  onCancel={onCancel}
                  defaultConfig={defaultConfig}
                  setRestartingSheetOpen={setRestartingSheetOpen}
                  editState={editState}
                />
              </div>
            )}
          </div>
        </Content>
      </Overlay>
    </>
  );
}



type CameraRowProps = {
  camera: CameraConfig;
  onDeleteCamera: () => void;
  onEditCamera: () => void;
};

export function CameraRow({
  camera,
  onDeleteCamera,
  onEditCamera,
}: CameraRowProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (!camera) {
    return;
  }

  return (
    <>
      <div
        key={camera.name}
        className="transition-background my-1.5 flex flex-row items-center justify-between rounded-lg duration-100 md:p-1"
      >
        <div className={`flex items-center`}>
          <p className="cursor-default">{camera.name} - {camera.display_name}</p>
        </div>
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={() => setDeleteDialogOpen(!deleteDialogOpen)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              Are you sure you want to delete the camera {" "}
              <em>{camera.name}</em>?
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDeleteCamera}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isMobile && (
          <>
            <DropdownMenu modal={!isDesktop}>
              <DropdownMenuTrigger>
                <HiOutlineDotsVertical className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={onEditCamera}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {!isMobile && (
          <div className="flex flex-row items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconWrapper
                  icon={LuPencil}
                  className={`size-[15px] cursor-pointer`}
                  onClick={onEditCamera}
                />
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconWrapper
                  icon={HiTrash}
                  className={`size-[15px] cursor-pointer`}
                  onClick={() => setDeleteDialogOpen(true)}
                />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </>
  );
}


type CameraEditProps = {
  currentCameras: CameraConfig[];
  editingCamera?: CameraConfig;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onSave?: () => void;
  onCancel?: () => void;
  defaultConfig: VigisionConfig;
  setRestartingSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editState: "add" | "edit" | "none";
};

export function CameraEdit({
  currentCameras,
  editingCamera,
  isLoading,
  setIsLoading,
  onSave,
  onCancel,
  defaultConfig,
  setRestartingSheetOpen,
  editState
}: CameraEditProps) {
  const { data: config, mutate: updateConfig } =
    useSWR<VigisionConfig>("config");
  const { send: sendRestart } = useRestart();

  // Example labelmap: 
  // {
  //   "0": "person",
  //   "1": "bicycle",
  //   "2": "car",
  //   "3": "motorcycle",
  //   "4": "unknown",
  //   "5": "unknown",
  //   "6": "unknown",
  //   "7": "truck",
  // }
  const labelmap = config?.detectors["detector_name"].model.labelmap
  const labelmapFiltered = Object.values(labelmap).filter((value, index, self) => self.indexOf(value) === index && value !== "unknown")
 
  const formSchema = z.object({
    
    name: z.string()
    .min(2, {
      message: "Camera ID must be at least 2 characters.",
    })
    .max(30, {
      message: "Camera ID must not exceed 30 characters.",
    })
    .transform((val: string) => val.trim().replace(/\s+/g, "_"))
    .refine(
      (value: string) => {
        return (
          editingCamera !== undefined ||
          !currentCameras.map((camera) => camera.name).includes(value)
        );
      },
      {
        message: "Camera ID already exists.",
      }
    )
    .refine((value: string) => value.toLowerCase() !== "default", {
      message: "Invalid camera ID.",
    })
    .refine((value: string) => /^[a-zA-Z0-9_]+$/.test(value), {
      message: "Camera ID can only contain alphanumeric characters and underscores.",
    })
    .refine((value: string) => !/^_/.test(value) && !/_$/.test(value), {
      message: "Camera ID cannot start or end with an underscore.",
    })
    .refine((value: string) => !/__/.test(value), {
      message: "Camera ID cannot contain consecutive underscores.",
    })
    .refine((value: string) => {
      const reservedKeywords = ["admin", "camera", "system"]; // Add any reserved keywords here
      return !reservedKeywords.includes(value.toLowerCase());
    }, {
      message: "Camera ID cannot be a reserved keyword.",
    })
    .refine((value: string) => {
      const lowerCaseNames = currentCameras.map(camera => camera.name.toLowerCase());
      return editingCamera !== undefined || !lowerCaseNames.includes(value.toLowerCase());
    }, {
      message: "Camera ID already exists.",
    }),


    display_name: z.string()
    .min(2, {
      message: "Camera name must be at least 2 characters.",
    })
    .max(30, {
      message: "Camera name must not exceed 30 characters.",
    })
    .transform((val: string) => val.trim().replace(/\s+/g, "_"))
    .refine(
      (value: string) => {
        return (
          editingCamera !== undefined ||
          !currentCameras.map((camera) => camera.display_name).includes(value)
        );
      },
      {
        message: "Camera name already exists.",
      }
    )
    .refine((value: string) => value.toLowerCase() !== "default", {
      message: "Invalid camera name.",
    })
    .refine((value: string) => /^[a-zA-Z0-9_]+$/.test(value), {
      message: "Camera name can only contain alphanumeric characters and underscores.",
    })
    .refine((value: string) => !/^_/.test(value) && !/_$/.test(value), {
      message: "Camera name cannot start or end with an underscore.",
    })
    .refine((value: string) => !/__/.test(value), {
      message: "Camera name cannot contain consecutive underscores.",
    })
    .refine((value: string) => {
      const reservedKeywords = ["admin", "camera", "system"]; // Add any reserved keywords here
      return !reservedKeywords.includes(value.toLowerCase());
    }, {
      message: "Camera name cannot be a reserved keyword.",
    })
    .refine((value: string) => {
      const lowerCaseNames = currentCameras.map(camera => camera.display_name.toLowerCase());
      return editingCamera !== undefined || !lowerCaseNames.includes(value.toLowerCase());
    }, {
      message: "Camera name already exists.",
    }),

    inputSource: z
      .string()
      .url({ message: "Invalid URL. Please enter a valid RTSP link or file path." })
      .or(z.string().regex(/^.*\.(avi|mp4|mkv|mov|MOV)$/, { message: "Please enter a valid video file path with .avi, .mp4, or .mkv extension." })),

    detectEnabled: z
    .boolean()
    .optional().default(defaultConfig.detect.enabled),
    
    fps: z.number()
      .optional().default(defaultConfig.detect.fps)
      .refine((value) => value >= 1, { message: "FPS must be at least 1." })
      .refine((value) => value <= 30, { message: "FPS must not exceed 30." })
      .transform((value) => {
        return isNaN(value) ? 5 : value;
      }),
      
    
    detectObjects: z.array(z.string()).optional().default(
      defaultConfig.objects.track
    ), // Array of strings to store selected objects
    
    fallDetect: z
    .boolean()
    .optional().default(defaultConfig.fall_detect.enabled),

    recordEnabled: z
    .boolean()
    .optional().default(defaultConfig.record.enabled),

    recordExpiredInterval: z.number()
    .optional().default(60)
    .refine((value) => value >= 1, { message: "Expired interval must be at least 1." })
    .refine((value) => value <= 720, { message: "Expired interval must not exceed 720." })
    .transform((value) => {
      return isNaN(value) ? defaultConfig.record.expire_interval : value;
    }),
    
    
    recordSync: z
    .boolean()
    .optional().default(defaultConfig.record.sync_recordings),

    recordRetainDays: z.number()
    .optional().default(0)
    .refine((value) => value >= 0, { message: "Retain days must be at least 0." })
    .refine((value) => value <= 4000, { message: "Retain days must not exceed 4000." })
    .transform((value) => {
      return isNaN(value) ? defaultConfig.record.retain.days : value;
    }),
      

    recordRetainMode: z.string().default(defaultConfig.record.retain.mode),

    snapshotEnabled: z
    .boolean()
    .optional().default(defaultConfig.snapshots.enabled),


    snapshotTimestamp: z
    .boolean()
    .optional().default(defaultConfig.snapshots.timestamp),
    
    snapshotBbox: z
    .boolean()
    .optional().default(defaultConfig.snapshots.bounding_box),

    snapshotRetainDays: z.number()
    .optional().default(0)
    .refine((value) => value >= 0, { message: "Retain days must be at least 0." })
    .refine((value) => value <= 4000, { message: "Retain days must not exceed 4000." })
    .transform((value) => {
      return isNaN(value) ? defaultConfig.snapshots.retain.default : value;
    }),
  });

  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {

      if (!values) {
        return;
      }
    
      // create a list of query strings
      var query = [
        `cameras.${values.name}.enabled=true`,
        `cameras.${values.name}.display_name=${values.display_name}`,
        `cameras.${values.name}.ffmpeg.inputs.0.path=${values.inputSource}`,
        `cameras.${values.name}.ffmpeg.inputs.0.roles.0=detect`,
        `cameras.${values.name}.ffmpeg.inputs.0.roles.1=record`,
        `cameras.${values.name}.detect.enabled=${values.detectEnabled}`,
        `cameras.${values.name}.detect.fps=${values.fps}`,
        `cameras.${values.name}.detect.height=720`,
        `cameras.${values.name}.detect.width=1280`,
        `cameras.${values.name}.fall_detect.enabled=${values.fallDetect}`,
        `cameras.${values.name}.record.enabled=${values.recordEnabled}`,
        `cameras.${values.name}.record.expire_interval=${values.recordExpiredInterval}`,
        `cameras.${values.name}.record.sync_recordings=${values.recordSync}`,
        `cameras.${values.name}.record.retain.days=${values.recordRetainDays}`,
        `cameras.${values.name}.record.retain.mode=${values.recordRetainMode.toLowerCase()}`,
        `cameras.${values.name}.snapshots.enabled=${values.snapshotEnabled}`,
        `cameras.${values.name}.snapshots.timestamp=${values.snapshotTimestamp}`,
        `cameras.${values.name}.snapshots.bounding_box=${values.snapshotBbox}`,
        `cameras.${values.name}.snapshots.retain.default=${values.snapshotRetainDays}`,
      ].join("&");
      
      if (editState === "edit") {
        if (values.inputSource.endsWith(".avi") 
          || values.inputSource.endsWith(".mp4") 
          || values.inputSource.endsWith(".mkv")
          || values.inputSource.endsWith(".MOV")
          || values.inputSource.endsWith(".mov")) {
          query += `&cameras.${values.name}.ffmpeg.inputs.0.input_args=${"-re -stream_loop -1 -fflags +genpts"}`;
        } 
        else if (!values.inputSource.startsWith("rtsp") && !values.inputSource.startsWith("https")) {
          query += `&cameras.${values.name}.ffmpeg.inputs.0.input_args`;
        }
      } else {
        if (values.inputSource.endsWith(".avi") 
          || values.inputSource.endsWith(".mp4") 
          || values.inputSource.endsWith(".mkv")
          || values.inputSource.endsWith(".MOV")
          || values.inputSource.endsWith(".mov")) {
          query += `&cameras.${values.name}.ffmpeg.inputs.0.input_args=${"-re -stream_loop -1 -fflags +genpts"}`;
        } 
      }
      // }
      // else {
        
      // }
      
      
      // loop detect Object
      values.detectObjects.forEach((object, index) => {
        query += `&cameras.${values.name}.objects.track.${index}=${object}`;
      });

      axios
        .put(`config/set?${query}`, {
          requires_restart: 0,
        })
        .then((res) => {
          if (res.status === 200) {
            toast.success(
              <div className="flex flex-row space-x-2 justify-center justify-items-center items-center">
              <p>{`Camera (${values.name}) has been saved. Restart is require for changes to take effect.`}</p>
              <Button
                size="sm"
                onClick={() => {
                  setRestartingSheetOpen(true);
                  sendRestart("restart")
                }}
              >
                Restart Now
              </Button>
            </div>
              , {
              position: "top-center",
            });
            updateConfig();
            if (onSave) {
              onSave();
            }
          } else {
            toast.error(`Failed to save config changes: ${res.statusText}`, {
              position: "top-center",
            });
          }
        })
        .catch((error) => {
          toast.error(
            `Failed to save config changes: ${error.response.data.message}`,
            { position: "top-center" },
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [currentCameras, setIsLoading, onSave, updateConfig, editingCamera],
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
    defaultValues: {
      name: (editingCamera && editingCamera.name) ?? "",
      display_name: (editingCamera && editingCamera.display_name) ?? "",
      inputSource: (editingCamera && editingCamera.ffmpeg.inputs[0].path) ?? "",
      detectEnabled: (editingCamera && editingCamera.detect.enabled) ?? defaultConfig.detect.enabled,
      fps: (editingCamera && editingCamera.detect.fps) ?? defaultConfig.detect.fps,
      detectObjects: (editingCamera && editingCamera.objects.track) ?? defaultConfig.objects.track,
      fallDetect: (editingCamera && editingCamera.fall_detect.enabled) ?? defaultConfig.fall_detect.enabled,
      recordEnabled: (editingCamera && editingCamera.record.enabled) ?? defaultConfig.record.enabled,
      recordExpiredInterval: (editingCamera && editingCamera.record.expire_interval) ?? defaultConfig.record.expire_interval,
      recordSync: (editingCamera && editingCamera.record.sync_recordings) ?? defaultConfig.record.sync_recordings,
      recordRetainDays: (editingCamera && editingCamera.record.retain.days) ?? defaultConfig.record.retain.days,
      recordRetainMode: (editingCamera && editingCamera.record.retain.mode) ?? defaultConfig.record.retain.mode,
      snapshotEnabled: (editingCamera && editingCamera.snapshots.enabled) ?? defaultConfig.snapshots.enabled,
      snapshotTimestamp: (editingCamera && editingCamera.snapshots.timestamp) ?? defaultConfig.snapshots.timestamp,
      snapshotBbox: (editingCamera && editingCamera.snapshots.bounding_box) ?? defaultConfig.snapshots.bounding_box,
      snapshotRetainDays: (editingCamera && editingCamera.snapshots.retain.default) ?? defaultConfig.snapshots.retain.default,
    },
  });

  // const { handleSubmit, watch } = form;
  // const detectEnabled = watch("detectEnabled");
  // const recordEnabled = watch("recordEnabled");
  // const [selectedValues, setSelectedValues] = useState<string[]>([]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3 overflow-y-hidden"
      >
        <div className="flex flex-row space-x-5">
          <div className="mt-2 w-1/2 space-y-4 overflow-y-hidden">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID</FormLabel>
                  <FormControl>
                    <Input
                      className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                      placeholder="Enter a ID for your camera..."
                      disabled={editingCamera !== undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input
                      className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                      placeholder="Enter a name for your camera..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* <Separator className="flex bg-secondary" /> */}
            <FormField name="inputSource" control={form.control} render={({ field }) => (
              <FormItem>
                <div className="flex flex-row">
                  <FormLabel>Input</FormLabel>
                  <Tooltip>
                  <TooltipTrigger className="ml-2" asChild>
                    <div className="cursor-help">
                      <FiInfo size={16} className="text-gray-400" />
                    </div>
                    </TooltipTrigger>
                    <TooltipContent className ="absolute w-72">
                      The path to the stream (RTSP). If the path is video file (e.g. .avi, .mp4, .mkv), the stream will be the loop of the video.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <Input {...field}
                    className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                    placeholder="Enter a link..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField name="recordEnabled" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Record</FormLabel>

                  <FormControl key="record">
                    <FilterSwitch
                        isChecked={field.value?.valueOf() ?? false}
                        label={field.value?.valueOf() ? "Enabled" : "Disabled"}
                        onCheckedChange={field.onChange}
                      />            
                  </FormControl>
                  <div className={`transition-opacity duration-300 ${field.value?.valueOf() ? "opacity-100" : "opacity-0"}`}>
                    {field.value?.valueOf() && (
                      <>
                      <FormField name="recordSync" control={form.control} render={({ field }) => (
                        <FormItem>
                          
                          <FormControl>
                            <FilterSwitch
                              isChecked={field.value?.valueOf() ?? false}
                              label="- Sync Recording"
                              onCheckedChange={field.onChange}
                              tooltipContent="Sync recordings with disk on startup and once a day."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField name="recordRetainDays" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <FilterInput
                              label="- Retain Days"
                              value={field.value ?? 0}
                              onChange={field.onChange}
                              tooltipContent="Number of days to retain recordings regardless of events."
                              min_value={0}
                              max_value={4000}
                              />
                          </FormControl>
                      
                          <FormMessage />
                        </FormItem>
                      )} />
                      
                      <FormField name="recordRetainMode" control={form.control} render={({ field }) => (
                        <FormItem>
                            <FormControl>
                              <FilterSelect
                                label="- Retain Mode"
                                value={field.value ?? "all"}
                                options={[
                                  { value: "all", label: "All" },
                                  { value: "motion", label: "Motion" },
                                  { value: "active_objects", label: "Active Objects" },
                                ]}
                                onChange={field.onChange}
                                tooltipContent={
                                  <>
                                    Select the mode for retention.<br />
                                    - all: save all recording segments regardless of activity<br />
                                    - motion: save all recordings segments with any detected motion<br />
                                    - active_objects: save all recording segments with active/moving objects
                                  </>
                                }
                              />
                            </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                        <FormField name="recordExpiredInterval" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <FilterInput
                                label="- Expired Interval (minutes)"
                                value={field.value ?? 60}
                                onChange={field.onChange}
                                tooltipContent="Number of minutes to wait between cleanup runs"
                                min_value={1}
                                max_value={720}
                                />
                              {/* <Input {...field} type="number" placeholder="Frames per second" min="1" max="60" /> */}
                            </FormControl>
                        
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                      
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

            </div>
            <Separator orientation="vertical" className="h-100 bg-secondary" />

            <div className="mt-2 w-1/2 space-y-4 overflow-y-hidden">
              <FormField name="detectEnabled" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Detection</FormLabel>

                  <FormControl key="detect">
                    <FilterSwitch
                        isChecked={field.value?.valueOf() ?? false}
                        label={field.value?.valueOf() ? "Enabled" : "Disabled"}
                        onCheckedChange={field.onChange}
                      />            
                  </FormControl>
                  <div className={`transition-opacity duration-300 ${field.value?.valueOf() ? "opacity-100" : "opacity-0"}`}>
                    {field.value?.valueOf() && (
                      <>
                      <FormField name="fps" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <FilterInput
                              label="- FPS"
                              value={field.value ?? 5}
                              onChange={field.onChange}
                              tooltipContent="Frames per second, recommended value of 5."
                              min_value={1}
                              max_value={60}
                              />
                            {/* <Input {...field} type="number" placeholder="Frames per second" min="1" max="60" /> */}
                          </FormControl>
                      
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="detectObjects" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormControl> 
                            <MultiSelect
                              label="- Objects to track"
                              options={labelmapFiltered.map((label) => ({ value: label, label: label }))}
                              selectedValues={field.value?? []}
                              onChange={(change)=>{
                                // setSelectedValues(change);
                                form.setValue("detectObjects", change);
                              }}
                              tooltipContent="Select multiple options by checking the boxes."
                            />
                            
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField name="fallDetect" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <FilterSwitch
                              isChecked={field.value?.valueOf() ?? false}
                              label="- Fall Detection"
                              disabled={!form.getValues("detectObjects").includes("person")}
                              onCheckedChange={field.onChange}
                              tooltipContent="Enable human fall detection. This requires 'person' to be selected."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      </>
                    )}

                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField name="snapshotEnabled" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Snapshot</FormLabel>

                  <FormControl key="snapshot">
                    <FilterSwitch
                        // not Checked when record is enabled
                        isChecked={field.value?.valueOf() && form.getValues("recordEnabled")}
                        label={field.value?.valueOf() ? "Enabled" : "Disabled"}
                           // disabled when record is disabled
                        disabled={!form.getValues("recordEnabled")}
                        onCheckedChange={field.onChange}
                      />            
                  </FormControl>
                  <div className={`transition-opacity duration-300 ${field.value?.valueOf() ? "opacity-100" : "opacity-0"}`}>
                    {field.value?.valueOf() && form.getValues("recordEnabled") && (
                      <>
                        <FormField name="snapshotTimestamp" control={form.control} render={({ field }) => (
                          <FormItem>
                            
                            <FormControl>
                              <FilterSwitch
                                isChecked={field.value?.valueOf() ?? false}
                                label="- Timestamp"
                                onCheckedChange={field.onChange}
                                tooltipContent="Print a timestamp on the snapshot.s"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField name="snapshotBbox" control={form.control} render={({ field }) => (
                          <FormItem>
                            
                            <FormControl>
                              <FilterSwitch
                                isChecked={field.value?.valueOf() ?? false}
                                label="- Bounding Box"
                                onCheckedChange={field.onChange}
                                tooltipContent="Draw bounding box on the snapshots."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField name="snapshotRetainDays" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <FilterInput
                                label="- Retain Days"
                                value={field.value ?? 0}
                                onChange={field.onChange}
                                tooltipContent="Number of days to retain snapshots."
                                min_value={0}
                                max_value={4000}
                                />
                            </FormControl>
                        
                            <FormMessage />
                          </FormItem>
                        )} />

                      </>
                    )}

                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            
        </div>

      
        <Separator className="my-2 flex bg-secondary" />

        <div id="button_container" className="flex flex-row gap-2 py-5 md:pb-0 w-full px-20">
          <Button type="button" className="flex flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="select"
            disabled={isLoading}
            className="flex flex-1"
            type="submit"
          >
            {isLoading ? (
              <div className="flex flex-row items-center gap-2">
                <ActivityIndicator />
                <span>Saving...</span>
              </div>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

