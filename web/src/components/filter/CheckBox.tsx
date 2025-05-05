// Checkbox.tsx - Simple Checkbox component
type CheckboxProps = {
    checked: boolean;
    onChange: () => void;
    label?: string; // Optional label for the checkbox
  };
  
  export const Checkbox = ({ checked, onChange, label }: CheckboxProps) => {
    return (
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="accent-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 accent-selected"
        />
        {label && <span className="ml-2 text-sm">{label}</span>}
      </label>
    );
  };
  