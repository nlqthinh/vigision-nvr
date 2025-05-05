import {
  LuActivity,
  LuList,
  LuMoon,
  LuPenSquare,
  LuRotateCw,
  LuSettings,
  LuSun,
  LuSunMoon,
} from "react-icons/lu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Link } from "react-router-dom";
import { CgDarkMode } from "react-icons/cg";
import {
  useTheme,
} from "@/context/theme-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { useEffect, useState } from "react";
import { useRestart } from "@/api/ws";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import {
  Tooltip,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ActivityIndicator from "../indicators/activity-indicator";
import { isDesktop } from "react-device-detect";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogTrigger,
} from "../ui/dialog";
import { cn } from "@/lib/utils";
import { baseUrl } from "@/api/baseUrl";
import useSWR from "swr";
import axios from "axios";

type GeneralSettingsProps = {
  className?: string;
};

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function GeneralSettings({ className }: GeneralSettingsProps) {
  const { theme, setTheme } = useTheme();
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restartingSheetOpen, setRestartingSheetOpen] = useState(false);
  const [countdown, setCountdown] = useState(20);

  const { send: sendRestart } = useRestart();
  const { data: profile } = useSWR("/profile", fetcher); // Fetch profile
  const isAdmin = profile?.username === "admin"; // Check if the user is admin

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

  const Container = isDesktop ? DropdownMenu : Drawer;
  const Trigger = isDesktop ? DropdownMenuTrigger : DrawerTrigger;
  const Content = isDesktop ? DropdownMenuContent : DrawerContent;
  const MenuItem = isDesktop ? DropdownMenuItem : DialogClose;
  const SubItem = isDesktop ? DropdownMenuSub : Dialog;
  const SubItemTrigger = isDesktop ? DropdownMenuSubTrigger : DialogTrigger;
  const SubItemContent = isDesktop ? DropdownMenuSubContent : DialogContent;
  const Portal = isDesktop ? DropdownMenuPortal : DialogPortal;

  return (
    <>
      <Container modal={!isDesktop}>
        <Trigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg p-4 py-2",
                  isDesktop
                    ? "cursor-pointer rounded-lg text-secondary-foreground hover:bg-muted"
                    : "text-secondary-foreground",
                  className,
                )}
              >
                <LuSettings className="size-18 md:m-[6px]" />
                <div className="text-xs mb-1">
                  Settings
                </div>
              </div>
            </TooltipTrigger>
          </Tooltip>
        </Trigger>
        <Content
          className={
            isDesktop ? "mr-5 w-72" : "max-h-[75dvh] overflow-hidden p-2"
          }
        >
          <div className="scrollbar-container w-full flex-col overflow-y-auto overflow-x-hidden">
            <DropdownMenuLabel>System</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup className={isDesktop ? "" : "flex flex-col"}>
              <Link to="/system#general">
                <MenuItem
                  className={
                    isDesktop
                      ? "cursor-pointer"
                      : "flex w-full items-center p-2 text-sm"
                  }
                >
                  <LuActivity className="mr-2 size-4" />
                  <span>System metrics</span>
                </MenuItem>
              </Link>
            </DropdownMenuGroup>
            {isAdmin && (
              <>
                <DropdownMenuLabel className={isDesktop ? "mt-3" : "mt-1"}>
                  Configuration
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <Link to="/settings">
                    <MenuItem
                      className={
                        isDesktop
                          ? "cursor-pointer"
                          : "flex w-full items-center p-2 text-sm"
                      }
                    >
                      <LuSettings className="mr-2 size-4" />
                      <span>Settings</span>
                    </MenuItem>
                  </Link>
                  <Link to="/config">
                    <MenuItem
                      className={
                        isDesktop
                          ? "cursor-pointer"
                          : "flex w-full items-center p-2 text-sm"
                      }
                    >
                      <LuPenSquare className="mr-2 size-4" />
                      <span>Configuration</span>
                    </MenuItem>
                  </Link>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuLabel className={isDesktop ? "mt-3" : "mt-1"}>
              Appearance
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <SubItem>
              <SubItemTrigger
                className={
                  isDesktop
                    ? "cursor-pointer"
                    : "flex items-center p-2 text-sm"
                }
              >
                <LuSunMoon className="mr-2 size-4" />
                <span>Theme</span>
              </SubItemTrigger>
              <Portal>
                <SubItemContent
                  className={
                    isDesktop ? "" : "w-[92%] rounded-lg md:rounded-2xl"
                  }
                >
                  <span tabIndex={0} className="sr-only" />
                  <MenuItem
                    className={
                      isDesktop
                        ? "cursor-pointer"
                        : "flex items-center p-2 text-sm"
                    }
                    onClick={() => setTheme("light")}
                  >
                    {theme === "light" ? (
                      <>
                        <LuSun className="mr-2 size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        Light
                      </>
                    ) : (
                      <span className="ml-6 mr-2">Light</span>
                    )}
                  </MenuItem>
                  <MenuItem
                    className={
                      isDesktop
                        ? "cursor-pointer"
                        : "flex items-center p-2 text-sm"
                    }
                    onClick={() => setTheme("dark")}
                  >
                    {theme === "dark" ? (
                      <>
                        <LuMoon className="mr-2 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                        Dark
                      </>
                    ) : (
                      <span className="ml-6 mr-2">Dark</span>
                    )}
                  </MenuItem>
                  <MenuItem
                    className={
                      isDesktop
                        ? "cursor-pointer"
                        : "flex items-center p-2 text-sm"
                    }
                    onClick={() => setTheme("system")}
                  >
                    {theme === "system" ? (
                      <>
                        <CgDarkMode className="mr-2 size-4 scale-100 transition-all" />
                        System
                      </>
                    ) : (
                      <span className="ml-6 mr-2">System</span>
                    )}
                  </MenuItem>
                </SubItemContent>
              </Portal>
            </SubItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator className={isDesktop ? "mt-3" : "mt-1"} />
                <MenuItem
                  className={
                    isDesktop ? "cursor-pointer" : "flex items-center p-2 text-sm"
                  }
                  onClick={() => setRestartDialogOpen(true)}
                >
                  <LuRotateCw className="mr-2 size-4" />
                  <span>Restart Vigision</span>
                </MenuItem>
              </>
            )}
          </div>
        </Content>
      </Container>
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
                  sendRestart("restart");
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
    </>
  );
}
