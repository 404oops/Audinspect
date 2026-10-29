// what settings > audio shows: for every accepted extension, which engine
// will handle it in this browser. the real pipeline (loadTrack.js) still
// falls through engine by engine on failure; this is the expected route.
import { AUDIO_EXTENSION_LIST } from "../utils/audioExtensions";
import { isNativeExtension } from "./nativeSupport";
import {
  MEDIABUNNY_EXTENSIONS,
  AUDIO_DECODE_EXTENSIONS,
  loadMediabunny,
} from "./decodeAudio";

// the codec usually found inside each mediabunny container
const TYPICAL_CODEC = {
  ".mp3": "mp3",
  ".wav": "pcm-s16",
  ".flac": "flac",
  ".ogg": "vorbis",
  ".oga": "vorbis",
  ".opus": "opus",
  ".m4a": "aac",
  ".mp4": "aac",
  ".aac": "aac",
  ".webm": "opus",
  ".mkv": "aac",
  ".mov": "aac",
};

export const ENGINE_LABELS = {
  native: "browser",
  mediabunny: "mediabunny (WebCodecs)",
  "audio-decode": "@audio/decode (wasm)",
  none: "not supported in this browser",
};

export async function describeDecoderSupport() {
  let decodable = new Set();
  try {
    const { getDecodableAudioCodecs } = await loadMediabunny();
    decodable = new Set(await getDecodableAudioCodecs());
  } catch (e) {}

  return AUDIO_EXTENSION_LIST.map((bare) => {
    const ext = `.${bare}`;
    let engine = "none";
    if (isNativeExtension(ext)) {
      engine = "native";
    } else if (MEDIABUNNY_EXTENSIONS.has(ext) && decodable.has(TYPICAL_CODEC[ext])) {
      engine = "mediabunny";
    } else if (AUDIO_DECODE_EXTENSIONS.has(ext)) {
      engine = "audio-decode";
    }
    return { ext: bare, engine };
  });
}
