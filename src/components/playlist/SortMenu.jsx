import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const SORT_OPTIONS = [
  { value: "none", label: "name (A-Z)" },
  { value: "nameDesc", label: "name (Z-A)" },
  { value: "length", label: "length (short - long)" },
  { value: "lengthDesc", label: "length (long - short)" },
  { value: "date", label: "last modified (newest)" },
  { value: "dateOldest", label: "last modified (oldest)" },
];

export default function SortMenu({ sortMode, setSortMode }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const currentLabel =
    SORT_OPTIONS.find((o) => o.value === sortMode)?.label || "name (A-Z)";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Sort order: ${currentLabel}`}
        className="bg-pure-black text-white border-2 border-white text-sm w-[185px] px-8 h-[40px] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-colors text-left flex items-center justify-between"
      >
        <span>{currentLabel}</span>
        <ChevronDown size={14} strokeWidth={2} className="text-white/70" />
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="Sort order"
          className="absolute right-0 mt-2 w-[185px] bg-pure-black border-2 border-white shadow-lg z-50"
        >
          {SORT_OPTIONS.map((option) => {
            const isActive = option.value === sortMode;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setSortMode(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-8 py-8 text-sm no-drag transition-colors ${
                  isActive
                    ? "bg-[var(--accent-color)] text-white"
                    : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                }`}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
