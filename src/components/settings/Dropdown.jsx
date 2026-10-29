import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

// bordered select-like menu that closes on outside click.
// options: [{ value, label }]
export default function Dropdown({
  value,
  options,
  onChange,
  fallbackLabel,
  labelledBy,
  containerClassName = "relative inline-block",
  buttonClassName,
  menuClassName,
  labelClassName = "",
  chevronClassName = "text-white/70",
  itemLabelClassName = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={containerClassName}>
      <button
        type="button"
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={buttonClassName}
      >
        <span className={labelClassName}>{current?.label || fallbackLabel}</span>
        <ChevronDown size={14} strokeWidth={2} className={chevronClassName} />
      </button>
      {isOpen && (
        <div role="listbox" className={menuClassName}>
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2 py-2 text-xs transition-colors ${isActive
                    ? "bg-[var(--accent-color)] text-white"
                    : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                  }`}
              >
                <span className={itemLabelClassName}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
