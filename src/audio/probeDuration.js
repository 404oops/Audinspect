// track lengths for the playlist without decoding (ffprobe's job on the
// desktop). mediabunny reads just the container headers through ranged
// reads; aiff has a tiny header parser; anything else gets its length the
// first time it is played.
import { MEDIABUNNY_EXTENSIONS, loadMediabunny } from "./decodeAudio";

// files without a duration in their metadata (cbr mp3 without a xing header)
// need a full scan; skip that when it would mean downloading a lot
const MAX_FULL_SCAN_BYTES = 40 * 1024 * 1024;

// 80-bit ieee 754 extended, big endian; aiff stores the sample rate this way
function readExtended(view, offset) {
  const sign = view.getUint8(offset) & 0x80 ? -1 : 1;
  const exponent = ((view.getUint8(offset) & 0x7f) << 8) | view.getUint8(offset + 1);
  const hi = view.getUint32(offset + 2);
  const lo = view.getUint32(offset + 6);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  const mantissa = hi * 2 ** 32 + lo;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

export function parseAiffDuration(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(0) !== "FORM") return null;
  const form = tag(8);
  if (form !== "AIFF" && form !== "AIFC") return null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = view.getUint32(pos + 4);
    if (id === "COMM" && pos + 8 + 18 <= bytes.length) {
      const frames = view.getUint32(pos + 10);
      const rate = readExtended(view, pos + 16);
      return rate > 0 ? frames / rate : null;
    }
    pos += 8 + size + (size & 1);
  }
  return null;
}

// `read(start, end)` must resolve to the bytes in [start, end)
export async function probeDuration({ ext, size, read }) {
  if (!ext) return null;

  if (ext === ".aiff" || ext === ".aif") {
    const head = await read(0, Math.min(size || 65536, 65536));
    return parseAiffDuration(head);
  }

  if (!MEDIABUNNY_EXTENSIONS.has(ext)) return null;
  if (!size) return null;

  const { Input, ALL_FORMATS, CustomSource } = await loadMediabunny();
  const source = new CustomSource({
    getSize: () => size,
    read: (start, end) => read(start, end),
    prefetchProfile: "network",
  });
  const input = new Input({ formats: ALL_FORMATS, source });
  try {
    const fromMetadata = await input.getDurationFromMetadata();
    if (typeof fromMetadata === "number" && fromMetadata > 0) return fromMetadata;
    if (size > MAX_FULL_SCAN_BYTES) return null;
    const computed = await input.computeDuration();
    return typeof computed === "number" && computed > 0 ? computed : null;
  } finally {
    try {
      input.dispose();
    } catch (e) {}
  }
}
