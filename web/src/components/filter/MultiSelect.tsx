import { useState } from "react";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { FiInfo } from "react-icons/fi";
import { Checkbox } from "./CheckBox"; // Assume you have a Checkbox component

type MultiSelectOption = {
  value: any;
  label: any;
};

type MultiSelectProps = {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (selectedValues: string[]) => void;
  tooltipContent: string;
};

export default function MultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  tooltipContent,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleCheckboxChange = (value: string) => {
    const currentIndex = selectedValues.indexOf(value);
    const newSelectedValues = [...selectedValues];

    if (currentIndex === -1) {
      newSelectedValues.push(value); // Add value if not already selected
    } else {
      newSelectedValues.splice(currentIndex, 1); // Remove value if already selected
    }

    onChange(newSelectedValues);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Label className="text-sm font-light mx-2 cursor-pointer capitalize text-primary">
            {label}
          </Label>
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
        </div>
        <div onClick={toggleDropdown} className="flex items-center py-2 px-4 rounded bg-secondary text-sm text-primary hover:bg-secondary/80 cursor-pointer h-8 my-1">
          {selectedValues.length} selected
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-secondary rounded shadow-lg w-full overflow-y-auto">
          <ul className="grid grid-cols-3 auto-cols-auto max-h-60 overflow-y-auto">
            {options.map((option) => (
              <li key={option.value} className="px-4 py-2 bg-secondary text-primary hover:bg-secondary/80">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedValues.includes(option.value)}
                    onChange={() => handleCheckboxChange(option.value)}
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
