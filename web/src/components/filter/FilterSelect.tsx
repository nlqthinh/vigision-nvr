import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

import { FiInfo } from "react-icons/fi"; // Import an info icon from 'react-icons'

type FilterSelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
  tooltipContent: React.ReactNode; // Tooltip text content
};

export default function FilterSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
  tooltipContent,
}: FilterSelectProps) {
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
          <TooltipContent className="absolute w-max max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </div>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={label} className="border border-input rounded text-right w-auto px-2">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
