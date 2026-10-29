// filtering + sorting of the playlist, shared by the list itself and by the
// player's next/prev navigation so both always agree on the visible order.
// rows are { f: filePath, idx: indexInFiles }.

function mtimeOf(meta) {
  if (!meta) return 0;
  if (typeof meta.mtimeMs === "number") return meta.mtimeMs;
  if (meta.mtimeIso) return Date.parse(meta.mtimeIso) || 0;
  return 0;
}

function makeComparator(mode, durations, fileMetadata, getDisplayName) {
  const nameOf = (p) => (getDisplayName(p) || "").toLowerCase();
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));

  if (mode === "nameDesc") return (a, b) => byName(b, a);
  if (mode === "none" || mode === "name") return byName;

  if (mode === "length" || mode === "lengthDesc") {
    const lengthOf = (p) =>
      typeof durations[p] === "number" ? durations[p] : Infinity;
    return (a, b) => {
      const la = lengthOf(a);
      const lb = lengthOf(b);
      if (la !== lb) return mode === "lengthDesc" ? lb - la : la - lb;
      return byName(a, b);
    };
  }

  if (mode === "date" || mode === "dateOldest") {
    return (a, b) => {
      const ta = mtimeOf(fileMetadata[a]);
      const tb = mtimeOf(fileMetadata[b]);
      if (ta !== tb) return mode === "date" ? tb - ta : ta - tb;
      return byName(a, b);
    };
  }

  return () => 0;
}

export function getVisibleRows(files, state, getDisplayName) {
  const base = Array.isArray(files) ? files : [];
  const pairs = base.map((f, idx) => ({ f, idx }));
  const q = (state.searchQuery || "").toLowerCase().trim();
  const filtered = q
    ? pairs.filter((p) => (getDisplayName(p.f) || "").toLowerCase().includes(q))
    : pairs;
  if (!state.sortMode) return filtered;
  const cmp = makeComparator(
    state.sortMode,
    state.durations || {},
    state.fileMetadata || {},
    getDisplayName
  );
  return [...filtered].sort((a, b) => cmp(a.f, b.f));
}
