// which formats the browser's own media element can play. anything in this
// set is handed to wavesurfer as-is (the browser decodes it for the waveform
// and streams it for playback); everything else goes through decodeAudio.js.
// the answer differs per browser, so it's probed with canPlayType at startup.
const MIME_CANDIDATES = {
  ".mp3": ["audio/mpeg"],
  ".wav": ["audio/wav", "audio/x-wav"],
  ".flac": ["audio/flac", "audio/x-flac"],
  ".ogg": ['audio/ogg; codecs="vorbis"', "audio/ogg"],
  ".oga": ['audio/ogg; codecs="vorbis"', "audio/ogg"],
  ".opus": ['audio/ogg; codecs="opus"'],
  ".spx": ['audio/ogg; codecs="speex"'],
  ".m4a": ['audio/mp4; codecs="mp4a.40.2"'],
  ".aac": ["audio/aac"],
  ".aiff": ["audio/aiff", "audio/x-aiff"],
  ".aif": ["audio/aiff", "audio/x-aiff"],
};

let cached = null;

export function getNativeExtensions() {
  if (cached) return cached;
  const out = new Set();
  try {
    const probe = document.createElement("audio");
    if (typeof probe.canPlayType === "function") {
      Object.entries(MIME_CANDIDATES).forEach(([ext, mimes]) => {
        // "maybe" is accepted on purpose: a wrong guess just costs one failed
        // native attempt before the decoder fallback kicks in
        if (mimes.some((m) => probe.canPlayType(m) !== "")) out.add(ext);
      });
    }
  } catch (e) {}
  cached = out;
  return out;
}

export function isNativeExtension(ext) {
  return getNativeExtensions().has(String(ext || "").toLowerCase());
}
