// mirrors electron/audio-extensions.json so the renderer and main process
// never disagree about what counts as an audio file.
import mimeByExt from "../../electron/audio-extensions.json";

export const AUDIO_EXTENSION_LIST = Object.keys(mimeByExt);
export const AUDIO_EXTENSIONS = new Set(
  AUDIO_EXTENSION_LIST.map((ext) => `.${ext}`)
);

export function getExtension(nameOrPath) {
  const s = String(nameOrPath || "").toLowerCase();
  const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  const base = slash >= 0 ? s.slice(slash + 1) : s;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

export function isAudioName(nameOrPath) {
  return AUDIO_EXTENSIONS.has(getExtension(nameOrPath));
}
