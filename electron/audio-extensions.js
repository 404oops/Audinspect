// single source of truth for the audio formats audinspect accepts.
// the renderer imports the same json via src/utils/audioExtensions.js and
// package.json "build.fileAssociations" mirrors it for os-level associations.
const path = require("node:path");
const mimeByExt = require("./audio-extensions.json");

const AUDIO_EXTENSION_LIST = Object.keys(mimeByExt);
const AUDIO_EXTENSIONS = new Set(AUDIO_EXTENSION_LIST.map((ext) => `.${ext}`));

function isAudioPath(p) {
  if (!p || typeof p !== "string") return false;
  return AUDIO_EXTENSIONS.has(path.extname(p).toLowerCase());
}

module.exports = {
  AUDIO_EXTENSION_LIST,
  AUDIO_EXTENSIONS,
  AUDIO_MIME_BY_EXT: mimeByExt,
  isAudioPath,
};
