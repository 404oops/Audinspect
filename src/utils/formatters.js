export function formatTime(sec) {
  if (!isFinite(sec) || sec === null) return "0:00";
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fixed =
    unitIndex === 0
      ? value.toFixed(0)
      : value >= 10
      ? value.toFixed(0)
      : value.toFixed(1);
  return `${fixed} ${units[unitIndex]}`;
}

export function formatDateFromMeta(meta) {
  if (meta == null) return "";
  let date;
  if (typeof meta === "number") {
    date = new Date(meta);
  } else if (typeof meta === "string") {
    date = new Date(meta);
  } else {
    return "";
  }
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatFileType(ext) {
  if (!ext || typeof ext !== "string") return "";
  const trimmed = ext.startsWith(".") ? ext.slice(1) : ext;
  if (!trimmed) return "";
  return trimmed.toUpperCase();
}
