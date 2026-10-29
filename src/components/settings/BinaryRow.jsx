const BINARY_SOURCE_LABEL = {
  custom: "custom path",
  system: "system install",
  bundled: "bundled (dev)",
  downloaded: "downloaded",
};

export default function BinaryRow({ kind, entry, required }) {
  const found = !!(entry && entry.path);
  const badge = found
    ? BINARY_SOURCE_LABEL[entry.source] || entry.source
    : required
      ? "missing"
      : "optional";
  const badgeClass = found
    ? "border-[var(--accent-color)] text-white"
    : required
      ? "border-red-500/60 text-red-400"
      : "border-white/30 text-white/50";
  return (
    <div className="flex items-center justify-between gap-16">
      <div className="min-w-0">
        <div className="text-white font-medium">{kind}</div>
        <div
          className="text-xs font-mono text-white/50 truncate"
          title={found ? entry.path : ""}
        >
          {found ? entry.path : "not found"}
        </div>
      </div>
      <div className={`text-xs px-8 py-4 border whitespace-nowrap ${badgeClass}`}>
        {badge}
      </div>
    </div>
  );
}
