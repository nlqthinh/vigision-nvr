import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { FiInfo } from "react-icons/fi";

type FilterSwitchProps = {
  label: string;
  disabled?: boolean;
  isChecked: boolean;
  onCheckedChange: (checked: boolean) => void;
  tooltipContent?: string;
};
export default function FilterSwitch({
  label,
  disabled = false,
  isChecked,
  onCheckedChange,
  tooltipContent
}: FilterSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex items-center">
        <Label
          className={`text-sm	font-light mx-2 w-full cursor-pointer capitalize text-primary ${disabled ? "text-secondary-foreground" : ""}`}
          htmlFor={label}
        >
          {label}
        </Label>
        
        {tooltipContent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <FiInfo size={16} className="text-gray-400" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="absolute w-52">
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Switch
        id={label}
        disabled={disabled}
        checked={isChecked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
