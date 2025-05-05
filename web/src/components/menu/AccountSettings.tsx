import {
  Tooltip,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isDesktop, isMobile } from "react-device-detect";
import { VscAccount } from "react-icons/vsc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Dialog, DialogClose, DialogContent } from "../ui/dialog";
import { LuLogOut } from "react-icons/lu";
import useSWR from "swr";
import { useNavigate } from "react-router-dom";
import { BsShareFill } from "react-icons/bs";
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
import { Button } from "../ui/button";
import { FaCopy, FaEye, FaLink } from "react-icons/fa";
import { toast } from "sonner";
import { Toaster } from "../ui/sonner";
import axios from "axios";
import { TbEyeClosed } from "react-icons/tb";

type AccountSettingsProps = {
  className?: string;
};
const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function AccountSettings({ className }: AccountSettingsProps) {
  const { data: profile } = useSWR("/profile", fetcher);
  const { data: config } = useSWR("config");
  const logoutUrl = config?.proxy?.logout_url || "/api/logout";

  const navigate = useNavigate();

  const Container = isDesktop ? DropdownMenu : Drawer;
  const Trigger = isDesktop ? DropdownMenuTrigger : DrawerTrigger;
  const MenuContent = isDesktop ? DropdownMenuContent : DrawerContent;
  const MenuItem = isDesktop ? DropdownMenuItem : DialogClose;

  const handleAccountClick = () => {
    navigate("/settings", { state: { view: "users" } });
  };

  const handleLogout = () => {
    window.location.href = logoutUrl; // Redirect to logout URL (cookie will be cleared server-side)
  };

  const username = profile?.username || "anonymous";
  const isAdmin = username === "admin"; // Check if the user is admin

  const Overlay = isDesktop ? Dialog : Drawer;

  const [getLinkDialogOpen, setGetLinkDialogOpen] = useState(false);
  const [isLinkRevealed, setIsLinkRevealed] = useState(false);
  const ShareLinkContent = isDesktop ? DialogContent : DrawerContent;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Link copied to clipboard!");
      toast.success("Link copied to clipboard!");
    });
  };
  const [sharableLink, setSharableLink] = useState("");

  useEffect(() => {
    if (getLinkDialogOpen && !sharableLink) {
      axios.get('/tunnel_url')
        .then(response => {
          const tunnelUrl = response.data.tunnel_url;
          setSharableLink(tunnelUrl);
        })
        .catch(error => {
          console.error("Error fetching sharable link:", error);
        });
    }
  }, [getLinkDialogOpen, sharableLink]);

  const handleRevealClick = () => {
    setIsLinkRevealed(!isLinkRevealed);
  };

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
            <VscAccount className="size-18 md:m-[6px]" />
            <div className="text-xs mb-1">
              Account
            </div>
          </div>
        </TooltipTrigger>
          </Tooltip>
        </Trigger>
        <MenuContent
          className={
            isDesktop ? "mr-5 w-72" : "max-h-[75dvh] overflow-hidden p-2"
          }
        >
          <div className="scrollbar-container w-full flex-col overflow-y-auto overflow-x-hidden">
            <DropdownMenuLabel>
              Current User: {username}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className={isDesktop ? "mt-1" : "mt-1"} />

            <MenuItem onClick={handleAccountClick}>
              <div className="flex items-center">
                <VscAccount className="mr-2 size-4" />
                <span>Account Settings</span>
              </div>
            </MenuItem>
            {isAdmin && (
              <MenuItem
                className={
                  isDesktop ? "cursor-pointer" : "flex items-center p-2 text-sm"
                }
                onClick={() => {
                  setGetLinkDialogOpen(true);
                }}
              >
                <BsShareFill className="mr-2 size-4" />
                <span>Get Shareable Link</span>
              </MenuItem>
            )}
            <MenuItem
              className={
                isDesktop ? "cursor-pointer" : "flex items-center p-2 text-sm"
              }
              onClick={handleLogout}
            >
                <LuLogOut className="mr-2 size-4" />
                <span>Logout</span>
            </MenuItem>
          </div>
        </MenuContent>
      </Container>
      <Overlay
        open={getLinkDialogOpen}
        onOpenChange={(open) => {
          setGetLinkDialogOpen(open);
          setIsLinkRevealed(false); // Reset link visibility when dialog opens/closes
        }}
      >
        <ShareLinkContent
          className={`min-w-0 ${isMobile ? "max-h-[90%] w-full rounded-t-2xl p-3" : "max-h-dvh w-6/12 overflow-y-auto"}`}
        >
          <div className="scrollbar-container my-4 flex flex-col overflow-y-auto">
            <div className="text-lg font-semibold mb-4">Share Vigision Access Link</div>
            <div className="flex flex-row w-full">
              <div className="bg-secondary pl-4 pr-1 rounded-lg mb-4 flex items-center justify-between w-full">
                <span className="mr-2">{isLinkRevealed ? sharableLink : "************"}</span>
                <Button
                  className="flex items-center justify-center ml-2"
                  onClick={handleRevealClick}
                >
                  {isLinkRevealed ? <FaEye/> : <TbEyeClosed />}
                </Button>
              </div>
              <Button
                className={`flex items-center justify-center ml-2 disabled:opacity-50`}
                onClick={() => copyToClipboard(sharableLink)}
                disabled={!isLinkRevealed}
              >
                <FaLink className="mr-2" />
                Copy
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                variant="select"
                className="flex items-center justify-center"
                onClick={() => setGetLinkDialogOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </ShareLinkContent>
      </Overlay>
    </>    
  );
}
