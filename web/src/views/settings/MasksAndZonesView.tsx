import { VigisionConfig } from "@/types/vigisionConfig";
import useSWR from "swr";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PolygonCanvas } from "@/components/settings/PolygonCanvas";
import { Polygon, PolygonType } from "@/types/canvas";
import { interpolatePoints, parseCoordinates } from "@/utils/canvasUtil";
import { Skeleton } from "@/components/ui/skeleton";
import { useResizeObserver } from "@/hooks/resize-observer";
import { LuPlus } from "react-icons/lu";
import copy from "copy-to-clipboard";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Heading from "@/components/ui/heading";
import ZoneEditPane from "@/components/settings/ZoneEditPane";
import MotionMaskEditPane from "@/components/settings/MotionMaskEditPane";
import ObjectMaskEditPane from "@/components/settings/ObjectMaskEditPane";
import PolygonItem from "@/components/settings/PolygonItem";
import { isDesktop } from "react-device-detect";
import { StatusBarMessagesContext } from "@/context/statusbar-provider";
import { FiInfo } from "react-icons/fi";
import { baseUrl } from "@/api/baseUrl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MasksAndZoneViewProps = {
  selectedCamera: string;
  selectedZoneMask?: PolygonType[];
  setUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function MasksAndZonesView({
  selectedCamera,
  selectedZoneMask,
  setUnsavedChanges,
}: MasksAndZoneViewProps) {
  const { data: config } = useSWR<VigisionConfig>("config");
  const [restartingSheetOpen, setRestartingSheetOpen] = useState(false);
  const [countdown, setCountdown] = useState(20);

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
  
  const [allPolygons, setAllPolygons] = useState<Polygon[]>([]);
  const [editingPolygons, setEditingPolygons] = useState<Polygon[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePolygonIndex, setActivePolygonIndex] = useState<
    number | undefined
  >(undefined);
  const [hoveredPolygonIndex, setHoveredPolygonIndex] = useState<number | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editPane, setEditPane] = useState<PolygonType | undefined>(undefined);

  const { addMessage } = useContext(StatusBarMessagesContext)!;

  const cameraConfig = useMemo(() => {
    if (config && selectedCamera) {
      return config.cameras[selectedCamera];
    }
  }, [config, selectedCamera]);

  const [{ width: containerWidth, height: containerHeight }] =
    useResizeObserver(containerRef);

  const aspectRatio = useMemo(() => {
    if (!config) {
      return undefined;
    }

    const camera = config.cameras[selectedCamera];

    if (!camera) {
      return undefined;
    }

    return camera.detect.width / camera.detect.height;
  }, [config, selectedCamera]);

  const detectHeight = useMemo(() => {
    if (!config) {
      return undefined;
    }

    const camera = config.cameras[selectedCamera];

    if (!camera) {
      return undefined;
    }

    return camera.detect.height;
  }, [config, selectedCamera]);

  const stretch = true;

  const fitAspect = useMemo(
    () => (isDesktop ? containerWidth / containerHeight : 3 / 4),
    [containerWidth, containerHeight],
  );

  const scaledHeight = useMemo(() => {
    if (containerRef.current && aspectRatio && detectHeight) {
      const scaledHeight =
        aspectRatio < (fitAspect ?? 0)
          ? Math.floor(
              Math.min(containerHeight, containerRef.current?.clientHeight),
            )
          : isDesktop || aspectRatio > fitAspect
            ? Math.floor(containerWidth / aspectRatio)
            : Math.floor(containerWidth / aspectRatio) / 1.5;
      const finalHeight = stretch
        ? scaledHeight
        : Math.min(scaledHeight, detectHeight);

      if (finalHeight > 0) {
        return finalHeight;
      }
    }
  }, [
    aspectRatio,
    containerWidth,
    containerHeight,
    fitAspect,
    detectHeight,
    stretch,
  ]);

  const scaledWidth = useMemo(() => {
    if (aspectRatio && scaledHeight) {
      return Math.ceil(scaledHeight * aspectRatio);
    }
  }, [scaledHeight, aspectRatio]);

  const handleNewPolygon = (type: PolygonType) => {
    if (!cameraConfig) {
      return;
    }

    setActivePolygonIndex(allPolygons.length);

    let polygonColor = [128, 128, 0];

    if (type == "motion_mask") {
      polygonColor = [0, 0, 220];
    }
    if (type == "object_mask") {
      polygonColor = [128, 128, 128];
    }

    setEditingPolygons([
      ...(allPolygons || []),
      {
        points: [],
        isFinished: false,
        type,
        typeIndex: 9999,
        name: "",
        objects: [],
        camera: selectedCamera,
        color: polygonColor,
      },
    ]);
  };

  const handleCancel = useCallback(() => {
    setEditPane(undefined);
    setEditingPolygons([...allPolygons]);
    setActivePolygonIndex(undefined);
    setHoveredPolygonIndex(null);
    setUnsavedChanges(false);
    document.title = "Mask and Zone Editor - Vigision";
  }, [allPolygons, setUnsavedChanges]);

  const handleSave = useCallback(() => {
    setAllPolygons([...(editingPolygons ?? [])]);
    setHoveredPolygonIndex(null);
    setUnsavedChanges(false);
    addMessage(
      "masks_zones",
      "Restart required (masks/zones changed)",
      undefined,
      "masks_zones",
    );
  }, [editingPolygons, setUnsavedChanges, addMessage]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!isLoading && editPane !== undefined) {
      setActivePolygonIndex(undefined);
      setEditPane(undefined);
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleCopyCoordinates = useCallback(
    (index: number) => {
      if (allPolygons && scaledWidth && scaledHeight) {
        const poly = allPolygons[index];
        copy(
          interpolatePoints(poly.points, scaledWidth, scaledHeight, 1, 1)
            .map((point) => `${point[0]},${point[1]}`)
            .join(","),
        );
        toast.success(`Copied coordinates for ${poly.name} to clipboard.`);
      } else {
        toast.error("Could not copy coordinates to clipboard.");
      }
    },
    [allPolygons, scaledHeight, scaledWidth],
  );

  useEffect(() => {
    if (cameraConfig && containerRef.current && scaledWidth && scaledHeight) {
      const zones = Object.entries(cameraConfig.zones).map(
        ([name, zoneData], index) => ({
          type: "zone" as PolygonType,
          typeIndex: index,
          camera: cameraConfig.name,
          name,
          objects: zoneData.objects,
          points: interpolatePoints(
            parseCoordinates(zoneData.coordinates),
            1,
            1,
            scaledWidth,
            scaledHeight,
          ),
          isFinished: true,
          color: zoneData.color,
        }),
      );

      let motionMasks: Polygon[] = [];
      let globalObjectMasks: Polygon[] = [];
      let objectMasks: Polygon[] = [];

      // this can be an array or a string
      motionMasks = (
        Array.isArray(cameraConfig.motion.mask)
          ? cameraConfig.motion.mask
          : cameraConfig.motion.mask
            ? [cameraConfig.motion.mask]
            : []
      ).map((maskData, index) => ({
        type: "motion_mask" as PolygonType,
        typeIndex: index,
        camera: cameraConfig.name,
        name: `Motion Mask ${index + 1}`,
        objects: [],
        points: interpolatePoints(
          parseCoordinates(maskData),
          1,
          1,
          scaledWidth,
          scaledHeight,
        ),
        isFinished: true,
        color: [0, 0, 255],
      }));

      const globalObjectMasksArray = Array.isArray(cameraConfig.objects.mask)
        ? cameraConfig.objects.mask
        : cameraConfig.objects.mask
          ? [cameraConfig.objects.mask]
          : [];

      globalObjectMasks = globalObjectMasksArray.map((maskData, index) => ({
        type: "object_mask" as PolygonType,
        typeIndex: index,
        camera: cameraConfig.name,
        name: `Object Mask ${index + 1} (all objects)`,
        objects: [],
        points: interpolatePoints(
          parseCoordinates(maskData),
          1,
          1,
          scaledWidth,
          scaledHeight,
        ),
        isFinished: true,
        color: [128, 128, 128],
      }));

      const globalObjectMasksCount = globalObjectMasks.length;
      let index = 0;

      objectMasks = Object.entries(cameraConfig.objects.filters)
        .filter(([, { mask }]) => mask || Array.isArray(mask))
        .flatMap(([objectName, { mask }]): Polygon[] => {
          const maskArray = Array.isArray(mask) ? mask : mask ? [mask] : [];
          return maskArray.flatMap((maskItem, subIndex) => {
            const maskItemString = maskItem;
            const newMask = {
              type: "object_mask" as PolygonType,
              typeIndex: subIndex,
              camera: cameraConfig.name,
              name: `Object Mask ${globalObjectMasksCount + index + 1} (${objectName})`,
              objects: [objectName],
              points: interpolatePoints(
                parseCoordinates(maskItem),
                1,
                1,
                scaledWidth,
                scaledHeight,
              ),
              isFinished: true,
              color: [128, 128, 128],
            };
            index++;

            if (
              globalObjectMasksArray.some(
                (globalMask) => globalMask === maskItemString,
              )
            ) {
              index--;
              return [];
            } else {
              return [newMask];
            }
          });
        });

      setAllPolygons([
        ...zones,
        ...motionMasks,
        ...globalObjectMasks,
        ...objectMasks,
      ]);
      setEditingPolygons([
        ...zones,
        ...motionMasks,
        ...globalObjectMasks,
        ...objectMasks,
      ]);
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraConfig, containerRef, scaledHeight, scaledWidth]);

  useEffect(() => {
    if (editPane === undefined) {
      setEditingPolygons([...allPolygons]);
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setEditingPolygons, allPolygons]);

  useEffect(() => {
    if (selectedCamera) {
      setActivePolygonIndex(undefined);
      setEditPane(undefined);
    }
  }, [selectedCamera]);

  useEffect(() => {
    document.title = "Mask and Zone Editor - Vigision";
  }, []);

  if (!cameraConfig && !selectedCamera) {
    return <ActivityIndicator />;
  }

  return (
    <>
      {cameraConfig && editingPolygons && (
        <div className="flex size-full flex-col md:flex-row">
          <Toaster position="top-center" closeButton={true} />
          <div
            ref={containerRef}
            className="flex max-h-[50%] md:h-dvh md:max-h-full md:w-7/12 md:grow"
          >
            <div className="mx-auto flex size-full flex-row justify-center">
              {cameraConfig &&
              scaledWidth &&
              scaledHeight &&
              editingPolygons ? (
                <PolygonCanvas
                  containerRef={containerRef}
                  camera={cameraConfig.name}
                  width={scaledWidth}
                  height={scaledHeight}
                  polygons={editingPolygons}
                  setPolygons={setEditingPolygons}
                  activePolygonIndex={activePolygonIndex}
                  hoveredPolygonIndex={hoveredPolygonIndex}
                  selectedZoneMask={selectedZoneMask}
                />
              ) : (
                <Skeleton className="size-full" />
              )}
            </div>
          </div>
          <div className="scrollbar-container order-last mb-10 mt-2 flex h-full w-full flex-col overflow-y-auto rounded-2xl bg-background_alt px-4 py-2 md:order-none md:mb-0 md:ml-2 md:mr-2 md:mt-0 md:w-3/12">
            {editPane == "zone" && (
              <ZoneEditPane
                polygons={editingPolygons}
                setPolygons={setEditingPolygons}
                activePolygonIndex={activePolygonIndex}
                scaledWidth={scaledWidth}
                scaledHeight={scaledHeight}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                onCancel={handleCancel}
                onSave={handleSave}
                setRestartingSheetOpen={setRestartingSheetOpen}
              />
            )}
            {editPane == "motion_mask" && (
              <MotionMaskEditPane
                polygons={editingPolygons}
                setPolygons={setEditingPolygons}
                activePolygonIndex={activePolygonIndex}
                scaledWidth={scaledWidth}
                scaledHeight={scaledHeight}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                onCancel={handleCancel}
                onSave={handleSave}
                setRestartingSheetOpen={setRestartingSheetOpen}
              />
            )}
            {editPane == "object_mask" && (
              <ObjectMaskEditPane
                polygons={editingPolygons}
                setPolygons={setEditingPolygons}
                activePolygonIndex={activePolygonIndex}
                scaledWidth={scaledWidth}
                scaledHeight={scaledHeight}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                onCancel={handleCancel}
                onSave={handleSave}
                setRestartingSheetOpen={setRestartingSheetOpen}
              />
            )}
            {editPane === undefined && (
              <>
                <Heading as="h3" className="my-2">
                  Masks / Zones
                </Heading>
                <div className="flex w-full flex-col">
                  {(selectedZoneMask === undefined ||
                    selectedZoneMask.includes("zone" as PolygonType)) && (
                    <div className="mt-0 pt-0 last:border-b-[1px] last:border-secondary last:pb-3">
                      <div className="my-3 flex flex-row items-center justify-between">
                        <div className="flex flex-row items-center">
                          Zones
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <FiInfo size={16} className="text-gray-400 ml-2" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="absolute w-52">
                              <div className="my-2 flex flex-col gap-2 text-sm text-primary-variant">
                              <p>
                                Zones allow you to define a specific area of the
                                frame so you can determine whether or not an
                                object is within a particular area.
                              </p> 
                            </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                          
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              className="size-6 rounded-md bg-secondary-foreground p-1 text-background"
                              onClick={() => {
                                setEditPane("zone");
                                handleNewPolygon("zone");
                              }}
                            >
                              <LuPlus />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add Zone</TooltipContent>
                        </Tooltip>
                      </div>
                      {allPolygons
                        .flatMap((polygon, index) =>
                          polygon.type === "zone" ? [{ polygon, index }] : [],
                        )
                        .map(({ polygon, index }) => (
                          <PolygonItem
                            key={index}
                            polygon={polygon}
                            index={index}
                            hoveredPolygonIndex={hoveredPolygonIndex}
                            setHoveredPolygonIndex={setHoveredPolygonIndex}
                            setActivePolygonIndex={setActivePolygonIndex}
                            setEditPane={setEditPane}
                            handleCopyCoordinates={handleCopyCoordinates}
                            setRestartingSheetOpen={setRestartingSheetOpen}
                          />
                        ))}
                    </div>
                  )}
                  {(selectedZoneMask === undefined ||
                    selectedZoneMask.includes(
                      "motion_mask" as PolygonType,
                    )) && (
                    <div className="mt-3 border-t-[1px] border-secondary pt-3 first:mt-0 first:border-transparent first:pt-0 last:border-b-[1px] last:pb-3">
                      <div className="my-3 flex flex-row items-center justify-between">
                        <div className="flex flex-row items-center">
                          Motion Masks
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <FiInfo size={16} className="text-gray-400 ml-2" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="absolute w-52">
                              <div className="my-2 flex flex-col gap-2 text-sm text-primary-variant">
                              <p>
                                Motion masks are used to prevent unwanted types
                                of motion from triggering detection. Over
                                masking will make it more difficult for objects
                                to be tracked.
                              </p> 
                            </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              className="size-6 rounded-md bg-secondary-foreground p-1 text-background"
                              onClick={() => {
                                setEditPane("motion_mask");
                                handleNewPolygon("motion_mask");
                              }}
                            >
                              <LuPlus />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add Motion Mask</TooltipContent>
                        </Tooltip>
                      </div>
                      {allPolygons
                        .flatMap((polygon, index) =>
                          polygon.type === "motion_mask"
                            ? [{ polygon, index }]
                            : [],
                        )
                        .map(({ polygon, index }) => (
                          <PolygonItem
                            key={index}
                            polygon={polygon}
                            index={index}
                            hoveredPolygonIndex={hoveredPolygonIndex}
                            setHoveredPolygonIndex={setHoveredPolygonIndex}
                            setActivePolygonIndex={setActivePolygonIndex}
                            setEditPane={setEditPane}
                            handleCopyCoordinates={handleCopyCoordinates}
                            setRestartingSheetOpen={setRestartingSheetOpen}
                          />
                        ))}
                    </div>
                  )}
                  {(selectedZoneMask === undefined ||
                    selectedZoneMask.includes(
                      "object_mask" as PolygonType,
                    )) && (
                    <div className="mt-3 border-t-[1px] border-secondary pt-3 first:mt-0 first:border-transparent first:pt-0 last:border-b-[1px] last:pb-3">
                      <div className="my-3 flex flex-row items-center justify-between">
                      <div className="flex flex-row items-center">
                          Object Masks
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <FiInfo size={16} className="text-gray-400 ml-2" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="absolute w-52">
                              <div className="my-2 flex flex-col gap-2 text-sm text-primary-variant">
                              <p>
                                Object filter masks are used to filter out false
                                positives for a given object type based on
                                location.
                              </p> 
                            </div>
                            </TooltipContent>
                          </Tooltip>
                        </div> 
                       
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              className="size-6 rounded-md bg-secondary-foreground p-1 text-background"
                              onClick={() => {
                                setEditPane("object_mask");
                                handleNewPolygon("object_mask");
                              }}
                            >
                              <LuPlus />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add Object Mask</TooltipContent>
                        </Tooltip>
                      </div>
                      {allPolygons
                        .flatMap((polygon, index) =>
                          polygon.type === "object_mask"
                            ? [{ polygon, index }]
                            : [],
                        )
                        .map(({ polygon, index }) => (
                          <PolygonItem
                            key={index}
                            polygon={polygon}
                            index={index}
                            hoveredPolygonIndex={hoveredPolygonIndex}
                            setHoveredPolygonIndex={setHoveredPolygonIndex}
                            setActivePolygonIndex={setActivePolygonIndex}
                            setEditPane={setEditPane}
                            handleCopyCoordinates={handleCopyCoordinates}
                            setRestartingSheetOpen={setRestartingSheetOpen}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
