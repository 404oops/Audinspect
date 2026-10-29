import { Search } from "lucide-react";

export default function SearchField({ value, onChange }) {
  return (
    <div className="flex items-center gap-8 bg-pure-black border-2 border-white focus-within:border-[var(--accent-color)] transition-colors px-3 h-[40px]">
      <Search size={16} strokeWidth={2} className="text-white/60" />
      <label htmlFor="playlist-search" className="sr-only">
        Search playlist
      </label>
      <input
        id="playlist-search"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search..."
        className="flex-1 bg-transparent text-sm text-white focus:outline-none"
      />
    </div>
  );
}
