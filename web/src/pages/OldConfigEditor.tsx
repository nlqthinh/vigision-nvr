import axios from 'axios';
import { useCallback, useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import { Button } from "@/components/ui/button";
import * as yaml from 'js-yaml';
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { LuSave } from "react-icons/lu";
import Heading from "@/components/ui/heading";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { MdOutlineRestartAlt } from "react-icons/md";
import "./ConfigStyle.css";


type SaveOptions = "saveonly" | "restart";

function ConfigEditor() {
  const { data: config } = useSWR<string>("config/raw");
  console.log("Load ConfigEditor");
  const [formValues, setFormValues] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    document.title = "Config Editor - Vigision";
    if (config) {
      setFormValues(config);
    }
  }, [config]);

  const onHandleSaveConfig = useCallback(
    async (save_option: SaveOptions) => {
      console.log("this is onHandleSaveConfig");
      if (!formValues) {
        return;
      }

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
          }
        })
        .catch((error) => {
          toast.error("Error saving config", { position: "top-center" });

          if (error.response) {
            setError(error.response.data.message);
          } else {
            setError(error.message);
          }
        });
    },
    [formValues],
  );

  const addCamera = useCallback((cameraName: string, cameraConfig: any) => {
    console.log("This is addCamera!!!!!!!! useCallback help it not re-render when page ConfigEditor renders (too many times). It will render only button Add New is clicked!");
    const temp = yaml.load(formValues);
    if (!temp.cameras) {
      temp.cameras = {};
    }
    temp.cameras[cameraName] = cameraConfig;
    setFormValues(yaml.dump(temp));
  }, [formValues]);

  const handleAddCamera = useCallback((data) => {
    const { cameraName, enabled, ffmpegPath, roles, detectEnabled, width, height } = data;
    const cameraConfig = {
      enabled,
      ffmpeg: {
        inputs: [{ path: ffmpegPath, roles }]
      },
      detect: { enabled: detectEnabled, width, height }
    };
    addCamera(cameraName, cameraConfig);
    setShowAddNewCamera(false);
  }, [addCamera]);

  const extractCameras = useCallback((config: string) => {
    const parsedConfig = yaml.load(config);
    return parsedConfig?.cameras || {};
  }, []);

  const updateCamera = useCallback((cameraName: string, updatedConfig: any) => {
    const temp = yaml.load(formValues);
    temp.cameras[cameraName] = updatedConfig;
    setFormValues(yaml.dump(temp));
  }, [formValues]);

  const deleteCamera = useCallback((cameraName: string) => {
    const temp = yaml.load(formValues);
    delete temp.cameras[cameraName];
    setFormValues(yaml.dump(temp));
  }, [formValues]);

  const cameras = useMemo(() => {
    if (!formValues) return {};
    return extractCameras(formValues);
  }, [formValues, extractCameras]);

  if (!formValues) {
    return <ActivityIndicator />;
  }

  return (
    <div className="absolute bottom-2 left-0 right-0 top-2 md:left-2">
      <div className="relative h-full overflow-auto">
        <div className="mr-1 flex items-center justify-between fixed-header">
          <Heading as="h2" className="mb-0 ml-1 md:ml-0">
            Config Editor
          </Heading>
          <Heading as="h4" className="mb-0 ml-1 md:ml-0">
            Please save before leaving. Thank you!
          </Heading>
          <div className="flex flex-row gap-1">
            <Button
              size="sm"
              className="flex items-center gap-2"
              onClick={() => onHandleSaveConfig("restart")}
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
            >
              <LuSave className="text-secondary-foreground" />
              <span className="hidden md:block">Save Only</span>
            </Button>
          </div>
        </div>

        <Heading as="h3" className="mb-0 ml-1 md:ml-0">
          Global Config
        </Heading>
        <form className="config-form">
          <div className='container'>
            <h2 className='heading2'>Record Config </h2>
            <div className='container2'>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={yaml.load(formValues).record.enabled}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.record.enabled = e.target.checked;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div className="form-row">
                <span>Retain days: </span>
                <input
                  type="number"
                  value={yaml.load(formValues).record.retain.days}
                  onChange={(e) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.record.retain.days = parseInt(e.target.value, 10);
                    setFormValues(yaml.dump(newConfig));
                  }}
                />
              </div>
              <div className="form-row">
                <span>Events retain default: </span>
                <input
                  type="number"
                  value={yaml.load(formValues).record.events.retain.default}
                  onChange={(e) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.record.events.retain.default = parseFloat(e.target.value);
                    setFormValues(yaml.dump(newConfig));
                  }}
                />
              </div>
            </div>
          </div>
          <div className='container'>
            <h2 className='heading2'>Snapshots </h2>
            <div className='container2'>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={yaml.load(formValues).snapshots.enabled}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.snapshots.enabled = e.target.checked;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={yaml.load(formValues).snapshots.timestamp}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.snapshots.timestamp = e.target.checked;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  />
                  <span>Timestamp</span>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    value={yaml.load(formValues).snapshots.bounding_box}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.snapshots.bounding_box = e.target.checked;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  />
                  <span>Bounding box</span>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    value={yaml.load(formValues).snapshots.crop}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.snapshots.crop = e.target.checked;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  />
                  <span>Crop</span>
                </label>
              </div>
              <div className="form-row">
                <span>Quality:</span>
                <input
                  type="number"
                  value={yaml.load(formValues).snapshots.quality}
                  onChange={(e) => {
                    const newConfig = yaml.load(formValues);
                    newConfig.snapshots.quality = parseInt(e.target.value, 10);
                    setFormValues(yaml.dump(newConfig));
                  }}
                />
              </div>
            </div>
          </div>

          <div className='container'>
            <h2 className='heading2'>Objects </h2>
            <div className='form-row'>
              <span>Track: </span>
              {['person', 'car', 'motorcycle', 'bicycle', 'cat', 'dog'].map((object) => (
                <div key={object} style={{ marginLeft: '4rem' }}>
                  <label>
                    <input
                      className='mb-2'
                      type="checkbox"
                      id={object}
                      value={object}
                      checked={yaml.load(formValues).objects.track.includes(object)}
                      onChange={(e) => {
                        const currentValues = yaml.load(formValues);
                        const updatedTrack = e.target.checked
                          ? [...currentValues.objects.track, object]
                          : currentValues.objects.track.filter((o) => o !== object);

                        setFormValues(yaml.dump({
                          ...currentValues,
                          objects: {
                            ...currentValues.objects,
                            track: updatedTrack
                          }
                        }));
                      }}
                    />
                    <span id={object} style={{ marginLeft: '0.5rem', fontWeight: 'normal' }}>
                      {object}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className='container'>
            <h2 className='heading2'>Detector type </h2>
            <div className='container2'>
              <div className="form-row">
                <div className='select-dropdown'>
                  <select
                    value={yaml.load(formValues).detectors.detector_name.type}
                    onChange={(e) => {
                      const newConfig = yaml.load(formValues);
                      newConfig.detectors.detector_name.type = e.target.value;
                      setFormValues(yaml.dump(newConfig));
                    }}
                  >
                    <option value="gpu">GPU</option>
                    <option value="cpu">CPU</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </form>
        {
          error && (
            <div className="mt-2 max-h-[30%] overflow-auto whitespace-pre-wrap border-2 border-muted bg-background_alt p-4 text-sm text-danger md:max-h-full">
              {error}
            </div>
          )
        }
      </div >
      <Toaster closeButton={true} />
    </div >
  );
}

export default ConfigEditor;


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
    <div className="rounded-lg bg-card p-4 md:rounded-2xl">
      <div className="mb-2">Select Objects for Detection</div>
      {AVAILABLE_OBJECTS.map((object) => (
        <div key={object} style={{ marginLeft: '1rem' }}>
          <label>
            <input
              className='mb-2'
              type="checkbox"
              id={object}
              value={object}
              checked={config.objects.track.includes(object)}
              onChange={(e) => handleCheckboxChange(object, e.target.checked)}
            />
            <span id={object} style={{ marginLeft: '0.5rem', fontWeight: 'normal' }}>
              {object}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}
