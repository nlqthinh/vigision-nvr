import { LuPlus } from "react-icons/lu";
import Logo from "../Logo";
import { cn } from "@/lib/utils";

type VigisionPlusIconProps = {
  className?: string;
  onClick?: () => void;
};
export default function VigisionPlusIcon({
  className,
  onClick,
}: VigisionPlusIconProps) {
  return (
    <div
      className={cn("relative flex items-center", className)}
      onClick={onClick}
    >
      <Logo className="size-full" />
      <LuPlus className="absolute size-2 translate-x-3 translate-y-3/4" />
    </div>
  );
}
