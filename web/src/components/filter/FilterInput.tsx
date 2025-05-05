import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

import { FiInfo } from "react-icons/fi"; // Import an info icon from 'react-icons'

type FPSInputProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  tooltipContent: string; // Tooltip text content
  min_value: number;
  max_value: number;
};

export default function FPSInput({
  label,
  value,
  disabled = false,
  onChange,
  tooltipContent,
  min_value,
  max_value,
}: FPSInputProps) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex items-center">
        <Label
          className={`text-sm font-light mx-2 w-full cursor-pointer capitalize text-primary ${disabled ? "text-secondary-foreground" : ""}`}
          htmlFor={label}
        >
          {label}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              <FiInfo size={16} className="text-gray-400" />
            </div>
          </TooltipTrigger>
          <TooltipContent className ="absolute w-52">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </div>
      <Input
        id={label}
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="border border-input rounded px-1 text-right w-12"
        min={min_value}
        max={max_value}
        step="1"
      />
    </div>
  );
}
