export default function DropConfirmModal({ dropConfirm, onReplace, onAdd, onCancel }) {
  if (!dropConfirm) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pure-black/70">
      <div className="bg-pure-black border-2 border-white max-w-lg w-full mx-24 p-24 space-y-16">
        <div className="text-lg font-semibold text-white">how do you want to load these files</div>
        <div className="text-sm text-white/70">
          {dropConfirm.files && dropConfirm.files.length === 1
            ? "replace the current track or add this file to the playlist"
            : "replace the current track with the first file or add all to the playlist"}
        </div>
        <div className="flex items-center justify-start gap-8 mt-8">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-row items-center gap-8 bg-pure-black border-2 border-white/40 hover:border-white text-white px-16 py-8 no-drag whitespace-nowrap"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-row items-center gap-8 bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white px-16 py-8 no-drag whitespace-nowrap"
          >
            add to playlist
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="flex flex-row items-center gap-8 bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-16 py-8 no-drag whitespace-nowrap"
          >
            replace current track
          </button>
        </div>
      </div>
    </div>
  );
}
