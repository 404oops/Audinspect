import { Check } from "lucide-react";

// the app's square checkbox: a visually hidden native input wrapped in a label
export default function CheckboxRow({ id, checked, onChange, label, description }) {
  return (
    <>
      <label className="flex items-center gap-5 cursor-pointer group">
        <div className="relative">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only"
          />
          <div
            className={`size-6 border-2 transition-colors duration-200 ${checked
                ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                : "bg-pure-black border-white/40 group-hover:border-white"
              }`}
          >
            {checked && <Check size={20} strokeWidth={2} />}
          </div>
        </div>
        <span className="text-white">{label}</span>
      </label>
      {description && (
        <p className="mt-[1rem] text-sm text-white/40">{description}</p>
      )}
    </>
  );
}
