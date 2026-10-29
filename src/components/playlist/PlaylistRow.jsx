import { CircleX } from "lucide-react";
import {
  formatTime,
  formatBytes,
  formatFileType,
  formatDateFromMeta,
} from "../../utils/formatters";

// every row is a fixed slot: a gap above a fixed-height item, so nothing
// overflows into the next slot and the last row is never clipped
export const ROW_GAP = 12;
export const ITEM_HEIGHT = 40;
export const ROW_HEIGHT = ROW_GAP + ITEM_HEIGHT;

function buildMetaLabel(meta, lengthSec) {
  const pieces = [];
  if (lengthSec != null) pieces.push(formatTime(lengthSec));
  if (meta && typeof meta.size === "number") {
    const sizeLabel = formatBytes(meta.size);
    if (sizeLabel) pieces.push(sizeLabel);
  }
  if (meta && meta.type) {
    const typeLabel = formatFileType(meta.type);
    if (typeLabel) pieces.push(typeLabel);
  }
  const mtimeSource =
    meta && meta.mtimeIso != null
      ? meta.mtimeIso
      : meta && meta.mtimeMs != null
        ? meta.mtimeMs
        : null;
  if (mtimeSource != null) {
    const dateLabel = formatDateFromMeta(mtimeSource);
    if (dateLabel) pieces.push(dateLabel);
  }
  return pieces.join("  •  ");
}

function itemClasses(isCurrent, isSelected) {
  if (isCurrent) return "bg-[var(--accent-color)]/10 border-[var(--accent-color)]";
  if (isSelected) return "bg-pure-black border-[var(--accent-color)]";
  return "bg-pure-black border-white/20 hover:border-white";
}

function dotClasses(isCurrent, isPlaying) {
  if (isCurrent && isPlaying) return "bg-[var(--accent-color)] animate-pulse";
  if (isCurrent) return "bg-[var(--accent-color)]";
  return "bg-white/20";
}

// row component for react-window 2.x: receives index/style/ariaAttributes
// from the list and everything else through `rowProps`
export default function PlaylistRow({
  index,
  style,
  ariaAttributes,
  rows,
  currentIndex,
  selectedIndex,
  isPlaying,
  fileMetadata,
  durations,
  getDisplayName,
  currentFolderPath,
  onDeleteTrack,
  loadAtIndex,
}) {
  const { f, idx } = rows[index];
  const isCurrent = idx === currentIndex;
  const name = getDisplayName(f);
  const meta = fileMetadata ? fileMetadata[f] : null;
  const lengthSec =
    durations && typeof durations[f] === "number" ? durations[f] : null;

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        display: "flex",
        alignItems: "stretch",
        paddingTop: `${ROW_GAP}px`,
        paddingLeft: "12px",
        paddingRight: "12px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{ height: `${ITEM_HEIGHT}px` }}
        className={`group flex items-center justify-between pl-8 pr-8 transition-colors duration-200 border flex-1 min-w-0 ${itemClasses(
          isCurrent,
          idx === selectedIndex
        )}`}
      >
        <button
          type="button"
          onClick={() => loadAtIndex(idx)}
          aria-current={isCurrent ? "true" : undefined}
          className="flex items-center gap-8 flex-1 min-w-0 h-full text-left cursor-pointer"
        >
          <span
            className={`w-8 h-8 ${dotClasses(isCurrent, isPlaying)} rounded-full flex-shrink-0`}
          />
          <span className="flex items-center justify-between gap-4 flex-1 min-w-0">
            <span className="truncate text-white text-sm">{name}</span>
            <span className="ml-4 text-[11px] text-white/40 text-right flex-shrink-0 max-w-[50%]">
              {buildMetaLabel(meta, lengthSec)}
            </span>
          </span>
        </button>
        {!currentFolderPath && (
          <button
            type="button"
            className="opacity-0 ml-[0.6rem] group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-pure-black border border-white hover:bg-white hover:text-pure-black text-white p-4 flex-shrink-0"
            onClick={() => onDeleteTrack(idx)}
            aria-label={`Delete ${name}`}
          >
            <CircleX size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
