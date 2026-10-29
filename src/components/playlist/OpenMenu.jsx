import { useState } from "react";
import { ChevronDown, File, Folder } from "lucide-react";

export default function OpenMenu({ onOpenFile, onOpenFolder }) {
  const [isOpen, setIsOpen] = useState(false);

  const itemClass =
    "w-full flex items-center gap-4 px-8 py-8 text-sm text-white hover:bg-white hover:text-pure-black";

  return (
    <div
      className="relative"
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (!next || !e.currentTarget.contains(next)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        title="Open files or folder"
        className="w-[110px] bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-8 h-[40px] transition-colors duration-200 flex items-center justify-between gap-4"
        aria-label="Open files or folder"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="playlist-open-menu"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="text-sm font-medium">Open</span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {isOpen && (
        <div
          id="playlist-open-menu"
          className="absolute right-0 mt-2 w-[180px] bg-pure-black border-2 border-white shadow-lg z-50"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setIsOpen(false);
            }
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenFile && onOpenFile();
            }}
            title="Open file"
            className={itemClass}
            aria-label="Open file"
            role="menuitem"
          >
            <File size={16} strokeWidth={2} />
            <span>Open file</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenFolder && onOpenFolder();
            }}
            title="Open folder"
            className={itemClass}
            aria-label="Open folder"
            role="menuitem"
          >
            <Folder size={16} strokeWidth={2} />
            <span>Open folder</span>
          </button>
        </div>
      )}
    </div>
  );
}
