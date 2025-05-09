import { CameraGroupConfig, VigisionConfig } from "@/types/vigisionConfig";
import { isDesktop, isMobile } from "react-device-detect";
import useSWR from "swr";
import { usePersistedOverlayState } from "@/hooks/use-overlay-state";
import { Button } from "../ui/button";
import { useCallback, useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LuPencil, LuPlus } from "react-icons/lu";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Drawer, DrawerContent } from "../ui/drawer";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import axios from "axios";
import FilterSwitch from "./FilterSwitch";
import { HiOutlineDotsVertical, HiTrash } from "react-icons/hi";
import IconWrapper from "../ui/icon-wrapper";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import ActivityIndicator from "../indicators/activity-indicator";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { usePersistence } from "@/hooks/use-persistence";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import ScrollableTabs from "./ScrollableTabs";

type CameraGroupSelectorProps = {
  className?: string;
  setAddCamera?: (value: boolean) => void;
};

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export function CameraGroupSelector({ className, setAddCamera }: CameraGroupSelectorProps) {
  const { data: config } = useSWR<VigisionConfig>("config");
  const { data: profile } = useSWR("/profile", fetcher);
  const isAdmin = profile?.username === "admin"; // Check if the user is an admin

  // tooltip

  const [tooltip, setTooltip] = useState<string>();
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout>();
  const showTooltip = useCallback(
    (newTooltip: string | undefined) => {
      if (!newTooltip) {
        setTooltip(newTooltip);

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      } else {
        setTimeoutId(setTimeout(() => setTooltip(newTooltip), 500));
      }
    },
    [timeoutId],
  );

  // groups

  const [group, setGroup, deleteGroup] = usePersistedOverlayState(
    "cameraGroup",
    "default" as string,
  );

  const groups = useMemo(() => {
    if (!config) {
      return [];
    }

    return Object.entries(config.camera_groups).sort(
      (a, b) => a[1].order - b[1].order,
    );
  }, [config]);

  // add group

  const [addGroup, setAddGroup] = useState(false);

  const Scroller = isMobile ? ScrollArea : "div";

  return (
    <>
      <NewGroupDialog
        open={addGroup}
        setOpen={setAddGroup}
        currentGroups={groups}
        activeGroup={group}
        setGroup={setGroup}
        deleteGroup={deleteGroup}
      />
      <Scroller className={`${isMobile ? "whitespace-nowrap" : "size-full"}`}>
        <div
          className={cn(
            "flex items-center justify-start gap-2 size-full",
            className,
            isDesktop ? "flex-row" : "whitespace-nowrap",
          )}
        >
          {isAdmin && ( // Render the "Manage Cameras" button only if the user is an admin
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="bg-secondary text-muted-foreground hover:text-foreground h-8 w-auto px-2"
                  size="xs"
                  onClick={() => setAddCamera && setAddCamera(true)}
                >
                  <LuPlus className="size-4 mr-2" /> Camera
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="capitalize" side="right">
                  Manage Cameras
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
          {isAdmin && ( // Render the "Manage Camera Groups" button only if the user is an admin
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="bg-secondary text-muted-foreground hover:text-foreground h-8 w-auto px-2"
                  size="xs"
                  onClick={() => setAddGroup(true)}
                >
                  <LuPlus className="size-4 mr-2" /> Group
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="capitalize" side="right">
                  Manage Camera Groups
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="h-8 bg-secondary" />

          <ScrollableTabs group={group} setGroup={setGroup} tabs={groups}/>
          {isMobile && <ScrollBar orientation="horizontal" className="h-0" />}
        </div>
      </Scroller>
    </>
  );
}

type NewGroupDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentGroups: [string, CameraGroupConfig][];
  activeGroup?: string;
  setGroup: (value: string | undefined, replace?: boolean | undefined) => void;
  deleteGroup: () => void;
};
function NewGroupDialog({
  open,
  setOpen,
  currentGroups,
  activeGroup,
  setGroup,
  deleteGroup,
}: NewGroupDialogProps) {
  const { mutate: updateConfig } = useSWR<VigisionConfig>("config");

  // editing group and state

  const [editingGroupName, setEditingGroupName] = useState("");

  const editingGroup = useMemo(() => {
    if (currentGroups && editingGroupName !== undefined) {
      return currentGroups.find(
        ([groupName]) => groupName === editingGroupName,
      );
    } else {
      return undefined;
    }
  }, [currentGroups, editingGroupName]);

  const [editState, setEditState] = useState<"none" | "add" | "edit">("none");
  const [isLoading, setIsLoading] = useState(false);

  const [, , , deleteGridLayout] = usePersistence(
    `${activeGroup}-draggable-layout`,
  );

  // callbacks

  const onDeleteGroup = useCallback(
    async (name: string) => {
      deleteGridLayout();
      deleteGroup();

      await axios
        .put(`config/set?camera_groups.${name}`, { requires_restart: 0 })
        .then((res) => {
          if (res.status === 200) {
            if (activeGroup == name) {
              // deleting current group
              setGroup("default");
            }
            updateConfig();
            toast.success(`Camera group (${name}) has been deleted.`, {
              position: "top-center",
            });
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
      updateConfig,
      activeGroup,
      setGroup,
      setOpen,
      deleteGroup,
      deleteGridLayout,
    ],
  );

  const onSave = () => {
    setOpen(false);
    setEditState("none");
  };

  const onCancel = () => {
    setEditingGroupName("");
    setEditState("none");
  };

  const onEditGroup = useCallback((group: [string, CameraGroupConfig]) => {
    setEditingGroupName(group[0]);
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
          setEditingGroupName("");
          setEditState("none");
          setOpen(open);
        }}
      >
        <Content
          className={`min-w-0 ${isMobile ? "max-h-[90%] w-full rounded-t-2xl p-3" : "max-h-dvh w-6/12 overflow-y-hidden"}`}
        >
          <div className="scrollbar-container my-4 flex flex-col overflow-y-auto">
            {editState === "none" && (
              <>
                <div className="flex flex-row items-center justify-between py-2">
                  <DialogTitle>Camera Groups</DialogTitle>
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
                        <TooltipPortal>
                          <TooltipContent className="capitalize" side="right">
                            Add Camera Group
                          </TooltipContent>
                        </TooltipPortal>
                  </Tooltip> */}
                  
                </div>
                {currentGroups.map((group) => (
                  <CameraGroupRow
                    key={group[0]}
                    group={group}
                    onDeleteGroup={() => onDeleteGroup(group[0])}
                    onEditGroup={() => onEditGroup(group)}
                  />
                ))}
              </>
            )}

            {editState != "none" && (
              <>
                <div className="mb-3 flex flex-row items-center justify-between">
                  <DialogTitle>
                    {editState == "add" ? "Add" : "Edit"} Camera Group
                  </DialogTitle>
                </div>
                <CameraGroupEdit
                  currentGroups={currentGroups}
                  editingGroup={editingGroup}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  onSave={onSave}
                  onCancel={onCancel}
                />
              </>
            )}
          </div>
        </Content>
      </Overlay>
    </>
  );
}

type EditGroupDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentGroups: [string, CameraGroupConfig][];
  activeGroup?: string;
};
export function EditGroupDialog({
  open,
  setOpen,
  currentGroups,
  activeGroup,
}: EditGroupDialogProps) {
  // editing group and state

  const editingGroup = useMemo(() => {
    if (currentGroups && activeGroup) {
      return currentGroups.find(([groupName]) => groupName === activeGroup);
    } else {
      return undefined;
    }
  }, [currentGroups, activeGroup]);

  const [isLoading, setIsLoading] = useState(false);

  return (
    <>
      <Toaster
        className="toaster group z-[100]"
        position="top-center"
        closeButton={true}
      />
      <Dialog
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
        }}
      >
        <DialogContent
          className={`min-w-0 ${isMobile ? "max-h-[90%] w-full rounded-t-2xl p-3" : "max-h-dvh w-6/12 overflow-y-hidden"}`}
        >
          <div className="scrollbar-container my-4 flex flex-col overflow-y-auto">
            <div className="mb-3 flex flex-row items-center justify-between">
              <DialogTitle>Edit Camera Group</DialogTitle>
            </div>
            <CameraGroupEdit
              currentGroups={currentGroups}
              editingGroup={editingGroup}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              onSave={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type CameraGroupRowProps = {
  group: [string, CameraGroupConfig];
  onDeleteGroup: () => void;
  onEditGroup: () => void;
};

export function CameraGroupRow({
  group,
  onDeleteGroup,
  onEditGroup,
}: CameraGroupRowProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (!group) {
    return;
  }

  return (
    <>
      <div
        key={group[0]}
        className="transition-background my-1.5 flex flex-row items-center justify-between rounded-lg duration-100 md:p-1"
      >
        <div className={`flex items-center`}>
          <p className="cursor-default">{group[0]} - {group[1].display_name}</p>
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
              Are you sure you want to delete the camera group{" "}
              <em>{group[0]}</em>?
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDeleteGroup}>
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
                <DropdownMenuItem onClick={onEditGroup}>Edit</DropdownMenuItem>
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
                  onClick={onEditGroup}
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

type CameraGroupEditProps = {
  currentGroups: [string, CameraGroupConfig][];
  editingGroup?: [string, CameraGroupConfig];
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onSave?: () => void;
  onCancel?: () => void;
};

export function CameraGroupEdit({
  currentGroups,
  editingGroup,
  isLoading,
  setIsLoading,
  onSave,
  onCancel,
}: CameraGroupEditProps) {
  const { data: config, mutate: updateConfig } =
    useSWR<VigisionConfig>("config");

  const birdseyeConfig = useMemo(() => config?.birdseye, [config]);

  const formSchema = z.object({
    name: z
      .string()
      .min(2, {
        message: "Camera group ID must be at least 2 characters.",
      })
      .max(30, {
        message: "Camera group ID must be at most 30 characters.",
      })
      .transform((val: string) => val.trim().replace(/\s+/g, "_"))
      .refine(
        (value: string) => {
          return (
            editingGroup !== undefined ||
            !currentGroups.map((group) => group[0].toLowerCase()).includes(value.toLowerCase())
          );
        },
        {
          message: "Camera group ID already exists.",
        },
      )
      .refine((value: string) => value.toLowerCase() !== "default", {
        message: "Invalid camera group ID.",
      }),
    
    display_name: z
      .string()
      .min(2, {
        message: "Camera group name must be at least 2 characters.",
      })
      .max(30, {
        message: "Camera group name must be at most 30 characters.",
      })
      .transform((val: string) => val.trim().replace(/\s+/g, "_"))
      .refine(
        (value: string) => {
          return (
            editingGroup !== undefined ||
            !currentGroups.map((group) => group[1].display_name.toLowerCase()).includes(value.toLowerCase())
          );
        },
        {
          message: "Camera group name already exists.",
        },
      )
      .refine((value: string) => value.toLowerCase() !== "default", {
        message: "Invalid camera group name.",
      }),

    cameras: z.array(z.string()),
    // icon: z
    //   .string()
    //   .min(1, { message: "You must select an icon." })
    //   .refine((value) => Object.keys(LuIcons).includes(value), {
    //     message: "Invalid icon",
    //   }),
  });

  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {
      if (!values) {
        return;
      }

      setIsLoading(true);

      const order =
        editingGroup === undefined
          ? currentGroups.length + 1
          : editingGroup[1].order;

      const orderQuery = `camera_groups.${values.name}.order=${+order}`;
      const nameQuery = `camera_groups.${values.name}.display_name=${values.display_name}`;
      // const iconQuery = `camera_groups.${values.name}.icon=${values.icon}`;
      const iconQuery = "";

      var cameraQueries = "";
      // if length of cameras is 0
      if (values.cameras.length === 0) {
        cameraQueries = `&camera_groups.${values.name}.cameras=[]`;
      } else {
        cameraQueries = values.cameras
        .map((cam) => `&camera_groups.${values.name}.cameras=${cam}`)
        .join("");
      }
      
      
      axios
        .put(`config/set?${orderQuery}&${iconQuery}&${nameQuery}${cameraQueries}`, {
          requires_restart: 0,
        })
        .then((res) => {
          if (res.status === 200) {
            toast.success(`Camera group (${values.name}) has been saved.`, {
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
    [currentGroups, setIsLoading, onSave, updateConfig, editingGroup],
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
    defaultValues: {
      name: (editingGroup && editingGroup[0]) ?? "",
      // icon: editingGroup && (editingGroup[1].icon as IconName),
      display_name: editingGroup && editingGroup[1].display_name,
      cameras: editingGroup && editingGroup[1].cameras,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-2 space-y-6 overflow-y-hidden"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group ID</FormLabel>
              <FormControl>
                <Input
                  className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                  placeholder="Enter an ID..."
                  disabled={editingGroup !== undefined}
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                  placeholder="Enter a name..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="scrollbar-container max-h-[25dvh] overflow-y-auto md:max-h-[40dvh]">
          <FormField
            control={form.control}
            name="cameras"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cameras</FormLabel>
                <FormDescription>
                {/* if no cameras */}
                {config && (
                  Object.keys(config.cameras).length ? (
                    // Render something when cameras are available
                    <span>Select cameras for this group.</span>
                  ) : (
                    <span className="text-muted-foreground">No cameras available. Please add one.</span>
                  )
                )}


                </FormDescription>
                <FormMessage />
                {[
                  // ...(birdseyeConfig?.enabled ? ["birdseye"] : []),
                  ...Object.keys(config?.cameras ?? {}),
                ].map((camera) => (
                  <FormControl key={camera}>
                    <FilterSwitch
                      isChecked={field.value && field.value.includes(camera)}
                      label={`${camera.replaceAll("_", " ")} - ${config?.cameras[camera].display_name.replaceAll("_", " ")}`}
                      onCheckedChange={(checked) => {
                        const updatedCameras = checked
                          ? [...(field.value || []), camera]
                          : (field.value || []).filter((c) => c !== camera);
                        form.setValue("cameras", updatedCameras);
                      }}
                    />
                  </FormControl>
                ))}
              </FormItem>
            )}
          />
        </div>

        {/* <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem className="flex flex-col space-y-2">
              <FormLabel>Icon</FormLabel>
              <FormControl>
                <IconPicker
                  selectedIcon={{
                    name: field.value,
                    Icon: field.value
                      ? LuIcons[field.value as IconName]
                      : undefined,
                  }}
                  setSelectedIcon={(newIcon) => {
                    field.onChange(newIcon?.name ?? undefined);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}

        <Separator className="my-2 flex bg-secondary" />

        <div className="flex flex-row gap-2 py-5 md:pb-0">
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
