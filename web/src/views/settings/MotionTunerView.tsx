import Heading from "@/components/ui/heading";
import { VigisionConfig } from "@/types/vigisionConfig";
import useSWR from "swr";
import axios from "axios";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import AutoUpdatingCameraImage from "@/components/camera/AutoUpdatingCameraImage";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  useImproveContrast,
  useMotionContourArea,
  useMotionThreshold,
} from "@/api/ws";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { StatusBarMessagesContext } from "@/context/statusbar-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FaQuestionCircle } from "react-icons/fa";

type MotionTunerViewProps = {
  selectedCamera: string;
  setUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
};

type MotionSettings = {
  threshold?: number;
  contour_area?: number;
  improve_contrast?: boolean;
};

export default function MotionTunerView({
  selectedCamera,
  setUnsavedChanges,
}: MotionTunerViewProps) {
  const { data: config, mutate: updateConfig } =
    useSWR<VigisionConfig>("config");
  const [changedValue, setChangedValue] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { addMessage, removeMessage } = useContext(StatusBarMessagesContext)!;

  const { send: sendMotionThreshold } = useMotionThreshold(selectedCamera);
  const { send: sendMotionContourArea } = useMotionContourArea(selectedCamera);
  const { send: sendImproveContrast } = useImproveContrast(selectedCamera);

  const [motionSettings, setMotionSettings] = useState<MotionSettings>({
    threshold: undefined,
    contour_area: undefined,
    improve_contrast: undefined,
  });

  const [origMotionSettings, setOrigMotionSettings] = useState<MotionSettings>({
    threshold: undefined,
    contour_area: undefined,
    improve_contrast: undefined,
  });

  const cameraConfig = useMemo(() => {
    if (config && selectedCamera) {
      return config.cameras[selectedCamera];
    }
  }, [config, selectedCamera]);

  useEffect(() => {
    if (cameraConfig) {
      setMotionSettings({
        threshold: cameraConfig.motion.threshold,
        contour_area: cameraConfig.motion.contour_area,
        improve_contrast: cameraConfig.motion.improve_contrast,
      });
      setOrigMotionSettings({
        threshold: cameraConfig.motion.threshold,
        contour_area: cameraConfig.motion.contour_area,
        improve_contrast: cameraConfig.motion.improve_contrast,
      });
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCamera]);

  useEffect(() => {
    if (!motionSettings.threshold) return;

    sendMotionThreshold(motionSettings.threshold);
  }, [motionSettings.threshold, sendMotionThreshold]);

  useEffect(() => {
    if (!motionSettings.contour_area) return;

    sendMotionContourArea(motionSettings.contour_area);
  }, [motionSettings.contour_area, sendMotionContourArea]);

  useEffect(() => {
    if (motionSettings.improve_contrast === undefined) return;

    sendImproveContrast(motionSettings.improve_contrast ? "ON" : "OFF");
  }, [motionSettings.improve_contrast, sendImproveContrast]);

  const handleMotionConfigChange = (newConfig: Partial<MotionSettings>) => {
    setMotionSettings((prevConfig) => ({ ...prevConfig, ...newConfig }));
    setUnsavedChanges(true);
    setChangedValue(true);
  };

  const saveToConfig = useCallback(async () => {
    setIsLoading(true);

    axios
      .put(
        `config/set?cameras.${selectedCamera}.motion.threshold=${motionSettings.threshold}&cameras.${selectedCamera}.motion.contour_area=${motionSettings.contour_area}&cameras.${selectedCamera}.motion.improve_contrast=${motionSettings.improve_contrast}`,
        { requires_restart: 0 },
      )
      .then((res) => {
        if (res.status === 200) {
          toast.success("Motion settings have been saved.", {
            position: "top-center",
          });
          setChangedValue(false);
          updateConfig();
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
  }, [
    updateConfig,
    motionSettings.threshold,
    motionSettings.contour_area,
    motionSettings.improve_contrast,
    selectedCamera,
  ]);

  const onCancel = useCallback(() => {
    setMotionSettings(origMotionSettings);
    setChangedValue(false);
    removeMessage("motion_tuner", `motion_tuner_${selectedCamera}`);
  }, [origMotionSettings, removeMessage, selectedCamera]);

  useEffect(() => {
    if (changedValue) {
      addMessage(
        "motion_tuner",
        `Unsaved motion tuner changes (${selectedCamera})`,
        undefined,
        `motion_tuner_${selectedCamera}`,
      );
    } else {
      removeMessage("motion_tuner", `motion_tuner_${selectedCamera}`);
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedValue, selectedCamera]);

  useEffect(() => {
    document.title = "Motion Tuner - Vigision";
  }, []);

  if (!cameraConfig && !selectedCamera) {
    return <ActivityIndicator />;
  }

  return (
    <div className="flex size-full flex-col md:flex-row">
      <Toaster position="top-center" closeButton={true} />
      {cameraConfig ? (
        <div className="flex md:h-dvh md:max-h-full md:w-7/12 md:grow">
          <div className="size-full min-h-10">
            <AutoUpdatingCameraImage
              camera={cameraConfig.name}
              searchParams={new URLSearchParams([["motion", "1"]])}
              showFps={false}
              className="size-full"
              cameraClasses="relative w-full h-full flex flex-col justify-start"
              fps={cameraConfig.detect.fps}
            />
          </div>
        </div>
      ) : (
        <Skeleton className="size-full rounded-lg md:rounded-2xl" />
      )}
      
      <div className="scrollbar-container order-last mb-10 mt-2 flex h-full w-full flex-col overflow-y-auto rounded-2xl bg-background_alt px-4 py-2 md:order-none md:mb-0 md:ml-2 md:mr-2 md:mt-0 md:w-3/12">
        <Heading as="h3" className="my-2">
          Motion Detection Tuner
          <Tooltip>
            <TooltipTrigger>
              <FaQuestionCircle style={{ marginLeft: '8px', cursor: 'pointer' }} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="my-2 flex flex-col gap-2 text-sm text-primary-variant max-w-xs">
                <p>
                  Vigision uses motion detection as a first line check to see if there
                  is anything happening in the frame worth checking with object
                  detection.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </Heading>
      
        <Separator className="my-2 flex bg-secondary" />
        <div className="flex w-full flex-col space-y-6">
          <div className="mt-2 space-y-6">
            <div className="space-y-0.5">
              <Label htmlFor="motion-threshold" className="text-md">
                Threshold
              </Label>
              <div className="my-2 text-sm text-muted-foreground">
                <p>
                    This value determines the minimum change in a pixel's brightness that must occur for it to be recognized as motion.{" "}
                  <em>Default: 30</em>
                </p>
              </div>
            </div>
            <div className="flex flex-row justify-between">
              <Slider
                id="motion-threshold"
                className="w-full"
                disabled={motionSettings.threshold === undefined}
                value={[motionSettings.threshold ?? 0]}
                min={5}
                max={80}
                step={1}
                onValueChange={(value) => {
                  handleMotionConfigChange({ threshold: value[0] });
                }}
              />
              <div className="align-center ml-6 mr-2 flex text-lg">
                {motionSettings.threshold}
              </div>
            </div>
          </div>
          <div className="mt-2 space-y-6">
            <div className="space-y-0.5">
              <Label htmlFor="motion-threshold" className="text-md">
                Contour Area
              </Label>
              <div className="my-2 text-sm text-muted-foreground">
                <p>
                  This value specifies the minimum size of a group of altered pixels for it to be identified as motion. <em>Default: 10</em>
                </p>
              </div>
            </div>
            <div className="flex flex-row justify-between">
              <Slider
                id="motion-contour-area"
                className="w-full"
                disabled={motionSettings.contour_area === undefined}
                value={[motionSettings.contour_area ?? 0]}
                min={5}
                max={100}
                step={1}
                onValueChange={(value) => {
                  handleMotionConfigChange({ contour_area: value[0] });
                }}
              />
              <div className="align-center ml-6 mr-2 flex text-lg">
                {motionSettings.contour_area}
              </div>
            </div>
          </div>
          <Separator className="my-2 flex bg-secondary" />
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="improve-contrast">Improve Contrast</Label>
              <div className="text-sm text-muted-foreground">
                Enhance the contrast to better detect motion in darker scenes. <em>Default: ON</em>
              </div>
            </div>
            <Switch
              id="improve-contrast"
              className="ml-3"
              disabled={motionSettings.improve_contrast === undefined}
              checked={motionSettings.improve_contrast === true}
              onCheckedChange={(isChecked) => {
                handleMotionConfigChange({ improve_contrast: isChecked });
              }}
            />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end">
          <div className="flex flex-row gap-2 pt-5">
            <Button className="flex flex-1" onClick={onCancel}>
              Reset
            </Button>
            <Button
              variant="select"
              disabled={!changedValue || isLoading}
              className="flex flex-1"
              onClick={saveToConfig}
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
        </div>
      </div>

      
    </div>
  );
}
