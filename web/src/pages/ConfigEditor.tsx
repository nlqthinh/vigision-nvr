import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from "@/components/ui/button";
import * as yaml from 'js-yaml';
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { LuSave } from "react-icons/lu";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { MdOutlineRestartAlt } from "react-icons/md";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { FiInfo } from 'react-icons/fi';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { baseUrl } from "@/api/baseUrl";
import { FaUndo } from 'react-icons/fa';

const FPS_MIN = 1;  // Minimum allowed FPS value
const FPS_MAX = 30; // Maximum allowed FPS value
const AVAILABLE_OBJECTS = ['person', 'car', 'motorcycle', 'bicycle', 'cat', 'dog'];

type SaveOptions = "saveonly" | "restart";

function ConfigEditor() {
  const { data: config } = useSWR<string>("config/raw");
  const [formValues, setFormValues] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isChanged, setIsChanged] = useState(false); // New state to track changes

  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restartingSheetOpen, setRestartingSheetOpen] = useState(false);
  const [countdown, setCountdown] = useState(20);

  const [originalConfig, setOriginalConfig] = useState<string | null>(null);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);


  const { data: gpuAvailable } = useSWR<{ gpu_available: boolean }>("/gpu_available");


  // Load initial config
  useEffect(() => {
    if (!originalConfig && formValues) {
      setOriginalConfig(formValues);
    }
  }, [formValues, originalConfig]);
  
  // Track changes
  useEffect(() => {
    if (formValues !== originalConfig) {
      setIsChanged(true);
    } else {
      setIsChanged(false);
    }
  }, [formValues, originalConfig]);

  const handleUndoChanges = useCallback(() => {
    if (originalConfig) {
      setFormValues(originalConfig); 
      toast.success("Configuration has been reverted to the original values.", { position: "top-center" });
    } else {
      toast.error("No configuration available to undo.", { position: "top-center" });
    }
  }, [originalConfig]);

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

  
  useEffect(() => {
    document.title = "Config Editor - Vigision";
    if (config) {
      setFormValues(config);
      setIsChanged(false); 
    }
  }, [config]);

  const onHandleSaveConfig = useCallback(
    async (save_option: SaveOptions) => {
      if (!formValues) {
        return;
      }
      const config = yaml.load(formValues);
      const fps = config.detect?.fps;
  
      if (fps < FPS_MIN || fps > FPS_MAX) {
        toast.error(`FPS value must be between ${FPS_MIN} and ${FPS_MAX}`, { position: "top-center" });
        return;
      }
      // console.log(formValues);
      axios
        .post(
          `config/save?save_option=${save_option}`,
          formValues,
          {
            headers: { "Content-Type": "text/plain" },
          },
        )
        .then((response) => {
          if (response.status === 200) {
            setError("");
            toast.success(response.data.message, { position: "top-center" });
            setIsChanged(false);
            setOriginalConfig(formValues);
          }
        })
        .catch((error) => {
          if (save_option !== "restart") {
            toast.error("Error saving config", { position: "top-center" });

            if (error.response) {
              setError(error.response.data.message);
            } else {
              setError(error.message);
            }
          }
        });
    },
    [formValues],
  );

  const handleSwitchChange = (section: string, field: string, checked: boolean) => {
    const newConfig = yaml.load(formValues);
    newConfig[section][field] = checked;
    setFormValues(yaml.dump(newConfig));
  };

  const handleNumberChange = (section: string, field: string, value: number) => {
    const newConfig = yaml.load(formValues);
    newConfig[section][field] = value;
    setFormValues(yaml.dump(newConfig));
  };

  if (!formValues) {
    return <ActivityIndicator />;
  }



  return (
  
    <>
      <Toaster
        className="toaster group z-[100]"
        position="top-center"
        closeButton={true}
      />
      <div className="flex size-full flex-col p-2">
        <div className="mt-4 flex items-end gap-2">
          <div className="h-full content-center font-semibold text-xl">Configuration</div>
          <div className="absolute right-3 flex flex-row gap-1">
              <Button
                size="sm"
                className="flex items-center gap-2"
                onClick={() => setRestartDialogOpen(true)}
                disabled={!isChanged}
              >
                <div className="relative size-5">
                  <LuSave className="absolute left-0 top-0 size-3 text-secondary-foreground" />
                  <MdOutlineRestartAlt className="absolute size-4 translate-x-1 translate-y-1/2 text-secondary-foreground" />
                </div>
                <span className="hidden md:block">Save & Restart</span>
              </Button>
              <Button
                size="sm"
                className="flex items-center gap-2"
                onClick={() => onHandleSaveConfig("saveonly")}
                disabled={!isChanged}
              >
                <LuSave className="text-secondary-foreground" />
                <span className="hidden md:block">Save Only</span>
              </Button>
              <Button
                size="sm"
                className="flex items-center gap-2"
                onClick={() => setUndoDialogOpen(true)}
                disabled={!isChanged}
              >
                <FaUndo className="text-secondary-foreground scale-90" />
                <span className="hidden md:block">Revert Changes</span>
              </Button>
            </div>
        </div>

        <div className="scrollbar-container mt-4 flex flex-col overflow-y-auto">
          <div className="text-sm font-medium text-muted-foreground"> Detection </div>
        </div>

        <div className={`mt-4 grid w-full grid-cols-1 gap-2 ${false ? "sm:grid-cols-3" : "sm:grid-cols-4" }`}>
          <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Detector Type</div>
            <InputRow
                label="Select the detector type"
                // tooltipContent="Select the detector type"
              >
                <SelectionField
                  value={yaml.load(formValues).detectors.detector_name.type}
                  onChange={(value) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.detectors.detector_name.type = value;
                      setFormValues(yaml.dump(newConfig));
                  }}
                  options={[
                    { value: 'gpu', label: 'GPU' },
                    { value: 'cpu', label: 'CPU' },
                  ]}
                  gpuAvailable={gpuAvailable?.gpu_available} // Pass the GPU availability

                />
              </InputRow>
          </div>

          <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Detection</div>
              <div className="text-xs	text-secondary-foreground italic ml-1">This will be overidden at camera level</div>
              <InputRow
                label={yaml.load(formValues).detect.enabled? "Enable" : "Disable"}
                tooltipContent="Enables detection for the camera."
              >
                <SwitchField
                  id = "detect"
                  checked={yaml.load(formValues).detect.enabled}
                  onChange={(checked) => handleSwitchChange('detect', 'enabled', checked)}
                />
              </InputRow>
              <InputRow
                label="FPS"
                tooltipContent="Set the frames per second."
              >
                <NumberInputField
                  value={yaml.load(formValues).detect.fps}
                  onChange={(value) => handleNumberChange('detect', 'fps', value)}
                  min={1}
                  max={60}
                  step={1}
                  placeholder="Enter FPS"
                />
              </InputRow>
              <InputRow
                label={yaml.load(formValues).fall_detect.enabled? "Fall detection: Enable" : "Fall detection: Disable"}
                tooltipContent="Enables human fall detection for the camera."
              >
                <SwitchField
                  id = "fall_detect"
                  checked={yaml.load(formValues).fall_detect.enabled}
                  onChange={(checked) => handleSwitchChange('fall_detect', 'enabled', checked)}
                />
              </InputRow>

          </div>
          <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Objects for Detection</div>
              <div className="text-xs	text-secondary-foreground italic ml-1">This will be overidden at camera level</div>
              <ObjectSelection formValues={formValues} setFormValues={setFormValues} />


          </div>

        </div>

        <div className="scrollbar-container mt-4 flex flex-col overflow-y-auto">
            <div className="text-sm font-medium text-muted-foreground"> Recording & Snapshots </div>
        </div>

        <div className={`mt-4 grid w-full grid-cols-1 gap-2 ${false ? "sm:grid-cols-3" : "sm:grid-cols-4" }`}>
          {/* <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Email for Notifications</div>
              <InputRow
              label="Your email"
              tooltipContent="Enter the email address to receive notifications."
              >
                <Input
                  type="email"
                  value={yaml.load(formValues).email}
                  onChange={(e) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.email = e.target.value;
                    console.log(newConfig);
                    setFormValues(yaml.dump(newConfig));
                  }}
                  placeholder="Enter your email"
                  className="w-full px-2 py-1 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </InputRow>

          </div> */}
          <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Recording</div>
              <div className="text-xs	text-secondary-foreground italic ml-1">This will be overidden at camera level</div>
              <InputRow
                label={yaml.load(formValues).record.enabled ? "Enable" : "Disable"}
                tooltipContent="Enables recording for the camera."
              >
                <SwitchField
                  id="record"
                  checked={yaml.load(formValues).record.enabled}
                  onChange={(checked) => handleSwitchChange('record', 'enabled', checked)}
                />
              </InputRow>
              <InputRow
                label={yaml.load(formValues).record.sync_recordings ? "Sync Recordings: Enable" : "Sync Recordings: Disable"}
                tooltipContent="Enables synchronization of recordings."
              >
                <SwitchField
                  id="sync_recordings"
                  checked={yaml.load(formValues).record.sync_recordings}
                  onChange={(checked) => handleSwitchChange('record', 'sync_recordings', checked)}
                />
              </InputRow>
              <InputRow
                label="Expire Interval (minutes)"
                tooltipContent="Set the expiration interval for recordings."
              >
                <NumberInputField
                  value={yaml.load(formValues).record.expire_interval}
                  onChange={(value) => handleNumberChange('record', 'expire_interval', value)}
                  min={1}
                  step={1}
                  placeholder="Enter expiration interval"
                />
              </InputRow>
              <InputRow
                label="Retain Days"
                tooltipContent="Set the number of days to retain recordings."
              >
                <NumberInputField
                  value={yaml.load(formValues).record.retain.days}
                  onChange={(value) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.record.retain.days = value;
                    setFormValues(yaml.dump(newConfig));
                }}
                  min={0}
                  step={1}
                  placeholder="Enter days to retain"
                />
              </InputRow>
              <InputRow
                label="Retain Mode"
                tooltipContent="Select the retention mode."
              >
                <SelectionField
                  value={yaml.load(formValues).record.retain.mode}
                  onChange={(value) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.record.retain.mode = value;
                      setFormValues(yaml.dump(newConfig));
                  }}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'motion', label: 'Motion' },
                    { value: 'active_objects', label: "Active Objects"}
                  ]}
                  gpuAvailable={gpuAvailable?.gpu_available} // Pass the GPU availability
                />
              </InputRow>
          </div>
          <div className="rounded-lg bg-card p-4 md:rounded-2xl">
            <div className="mb-2">Snapshots</div>
              <div className="text-xs	text-secondary-foreground italic ml-1">This will be overidden at camera level</div>
              <InputRow
                label={yaml.load(formValues).snapshots.enabled ? "Enable" : "Disable"}
                tooltipContent="Enables snapshot for the camera."
              >
                <SwitchField
                  id="snapshot"
                  checked={yaml.load(formValues).snapshots.enabled}
                  onChange={(checked) => handleSwitchChange('snapshots', 'enabled', checked)}
                />
              </InputRow>
              <InputRow
                label={yaml.load(formValues).snapshots.timestamp ? "Timestamp: Enable" : "Timestamp: Disable"}
                tooltipContent="Enables timestamp on snapshots."
              >
                <SwitchField
                  id="timestamp"
                  checked={yaml.load(formValues).snapshots.timestamp}
                  onChange={(checked) => handleSwitchChange('snapshots', 'timestamp', checked)}
                />
              </InputRow>
              <InputRow
                label={yaml.load(formValues).snapshots.bounding_box ? "Bounding Box: Enable" : "Bounding Box: Disable"}
                tooltipContent="Enables bounding box on snapshots."
              >
                <SwitchField
                  id="bounding_box"
                  checked={yaml.load(formValues).snapshots.bounding_box}
                  onChange={(checked) => handleSwitchChange('snapshots', 'bounding_box', checked)}
                />
              </InputRow>
              <InputRow
                label="Retain Days"
                tooltipContent="Set the number of days to retain snapshots."
              >
                <NumberInputField
                  value={yaml.load(formValues).snapshots.retain.default}
                  onChange={(value) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.snapshots.retain.default = value;
                    setFormValues(yaml.dump(newConfig));
                }}
                  min={0}
                  step={1}
                  placeholder="Enter days to retain"
                />
              </InputRow>             
          </div>
        </div>
      </div>

      {restartDialogOpen && (
        <AlertDialog
          open={restartDialogOpen}
          onOpenChange={() => setRestartDialogOpen(false)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you sure you want to restart Vigision?
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setRestartingSheetOpen(true);
                  onHandleSaveConfig("restart");
                }}
              >
                Restart
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
       {undoDialogOpen && (
        <>
          <AlertDialog
            open={undoDialogOpen}
            onOpenChange={setUndoDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to revert configuration changes?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setUndoDialogOpen(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => {
                  handleUndoChanges();
                  setUndoDialogOpen(false);
                }}>
                  Revert
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
    
  );
}

export default ConfigEditor;


type InputRowProps = {
  label: string;
  tooltipContent?: string;
  children: React.ReactNode;
};

export function InputRow({ label, tooltipContent, children }: InputRowProps) {
  return (
    <div className="flex items-center justify-between gap-1 h-10">
      <div className="flex items-center">
        <Label className="text-sm font-light mx-2 w-full text-primary text-secondary-foreground">
          {label}
        </Label>
        {tooltipContent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <FiInfo size={16} className="text-gray-400" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="absolute w-max">
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

type SelectionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  gpuAvailable: boolean | undefined; // Add this prop
};

export function SelectionField({ value, onChange, options, gpuAvailable  }: SelectionFieldProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="detector_type" className="border border-input rounded text-right w-auto px-2">
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {options
            .filter(option => gpuAvailable || option.value !== 'gpu') // Filter based on GPU availability
            .map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}


type SwitchFieldProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SwitchField({ id, checked, onChange }: SwitchFieldProps) {
  return (
    <Switch
      id={id}
      disabled={false}
      checked={checked}
      onCheckedChange={onChange}
    />
  );
}

type NumberInputFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export function NumberInputField({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: NumberInputFieldProps) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className="w-20"
    />
  );
}

type ObjectSelectionProps = {
  formValues: string;
  setFormValues: (values: string) => void;
};

function ObjectSelection({ formValues, setFormValues }: ObjectSelectionProps) {
  const config = yaml.load(formValues);

  const handleCheckboxChange = (object: string, checked: boolean) => {
    const updatedTrack = checked
      ? [...config.objects.track, object]
      : config.objects.track.filter((o) => o !== object);

    const updatedConfig = {
      ...config,
      objects: {
        ...config.objects,
        track: updatedTrack
      }
    };

    setFormValues(yaml.dump(updatedConfig));
  };

  return (
    <div className="mt-2 space-y-2">
      {AVAILABLE_OBJECTS.map((object) => (
        <div key={object} className="flex items-center ml-4">
          <input
            type="checkbox"
            id={object}
            value={object}
            checked={config.objects.track.includes(object)}
            onChange={(e) => handleCheckboxChange(object, e.target.checked)}
            className="mr-2 h-4 w-4 text-primary border-gray-300 rounded accent-selected"
          />
          <label htmlFor={object} className="text-xs">
            {object}
          </label>
        </div>
      ))}
    </div>
  );
}
