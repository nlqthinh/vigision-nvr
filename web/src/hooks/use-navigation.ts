import { VigisionConfig } from "@/types/vigisionConfig";
import { NavData } from "@/types/navigation";
import { useMemo } from "react";
import { BiSolidCctv } from "react-icons/bi";
import { IoPlayBackCircle } from "react-icons/io5";
import { RiExportFill } from "react-icons/ri";
import useSWR from "swr";
import axios from "axios";

// Fetch user profile to check if the user is an admin
const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function useNavigation(
  variant: "primary" | "secondary" = "primary",
) {
  const { data: config } = useSWR<VigisionConfig>("config");
  const { data: profile } = useSWR("/profile", fetcher);
  const isAdmin = profile?.username === "admin"; // Check if the user is an admin

  return useMemo(
    () =>
      [
        {
          id: 1,
          variant,
          icon: BiSolidCctv,
          title: "Live",
          url: "/",
        },
        isAdmin && {
          id: 2,
          variant,
          icon: IoPlayBackCircle,
          title: "Review",
          url: "/review",
        },
        isAdmin && {
          id: 3,
          variant,
          icon: RiExportFill,
          title: "Export",
          url: "/export",
        },
        
      ].filter(Boolean) as NavData[], // Filter out any falsey values (i.e., undefined if not admin)
    [isAdmin, config?.plus.enabled, variant],
  );
}
