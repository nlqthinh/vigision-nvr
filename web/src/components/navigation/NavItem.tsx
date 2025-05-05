import { NavLink } from "react-router-dom";
import { NavData } from "@/types/navigation";
import { IconType } from "react-icons";
import { cn } from "@/lib/utils";

const variants = {
  primary: {
    active: "font-bold text-foreground bg-selected hover:bg-selected/80",
    inactive: "text-secondary-foreground hover:bg-muted",
  },
  secondary: {
    active: "",
    inactive: "",
  },
};

type NavItemProps = {
  className?: string;
  item: NavData;
  Icon: IconType;
  onClick?: () => void;
};

export default function NavItem({
  className,
  item,
  Icon,
  onClick,
}: NavItemProps) {
  if (item.enabled == false) {
    return;
  }

  const content = (
    <NavLink
      to={item.url}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center rounded-lg p-4 py-2",
          className,
          variants[item.variant ?? "primary"][isActive ? "active" : "inactive"],
        )
      }
    >
      <Icon className="size-18 md:m-[6px]" />
      <div className="text-xs mb-1">
        {item.title}

      </div>

    </NavLink>
  );

  return content;
}
