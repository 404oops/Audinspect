// the replacement for ffmpeg: decodes a whole file to float pcm in the
// browser. mediabunny demuxes the mainstream containers and decodes through
// WebCodecs (hardware-backed where available); @audio/decode's wasm codecs
// cover everything else (aiff, wma, ac3, dts, amr, ape, wavpack, dsd, ...).
import { getExtension } from "../utils/audioExtensions";

// loaded on first use so the player's first paint doesn't wait for it
export const loadMediabunny = () => import("mediabunny");

// containers mediabunny can open; the codec inside still has to be decodable
export const MEDIABUNNY_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".spx",
  ".m4a",
  ".mp4",
  ".aac",
  ".webm",
  ".mkv",
  ".mov",
]);

// what @audio/decode ships a decoder for (see audio-type for detection)
export const AUDIO_DECODE_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".m4a",
  ".mp4",
  ".aac",
  ".aiff",
  ".aif",
  ".wma",
  ".ac3",
  ".dts",
  ".amr",
  ".ape",
  ".wv",
  ".dsf",
  ".dff",
  ".webm",
]);

function concatChunks(chunks, total) {
  const out = new Float32Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

export async function decodeWithMediabunny(blob, { isStale } = {}) {
  const { Input, ALL_FORMATS, BlobSource, AudioBufferSink } = await loadMediabunny();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("no audio track");
    if (!(await track.canDecode())) {
      const codec = (await track.getCodec()) || "unknown codec";
      throw new Error(`${codec} is not decodable by this browser`);
    }

    const sink = new AudioBufferSink(track);
    let sampleRate = 0;
    let channels = 0;
    const perChannel = [];
    let frames = 0;

    for await (const { buffer } of sink.buffers()) {
      if (isStale && isStale()) throw new Error("superseded");
      if (!sampleRate) {
        sampleRate = buffer.sampleRate;
        channels = buffer.numberOfChannels;
        for (let ch = 0; ch < channels; ch += 1) perChannel.push([]);
      }
      for (let ch = 0; ch < channels; ch += 1) {
        const src = ch < buffer.numberOfChannels ? buffer.getChannelData(ch) : new Float32Array(buffer.length);
        perChannel[ch].push(src);
      }
      frames += buffer.length;
    }
    if (!frames) throw new Error("decoder produced no audio");

    return {
      channelData: perChannel.map((chunks) => concatChunks(chunks, frames)),
      sampleRate,
      duration: frames / sampleRate,
      engine: "mediabunny",
    };
  } finally {
    try {
      input.dispose();
    } catch (e) {}
  }
}

export async function decodeWithAudioDecode(blob) {
  const { default: decode } = await import("@audio/decode");
  const { channelData, sampleRate } = await decode(blob);
  if (!channelData || !channelData.length || !sampleRate) {
    throw new Error("decoder produced no audio");
  }
  return {
    channelData,
    sampleRate,
    duration: channelData[0].length / sampleRate,
    engine: "@audio/decode",
  };
}

// tries the engines that can plausibly open `name`, in order. throws with
// every engine's complaint when all of them fail.
export async function decodeToPcm(blob, name, { isStale } = {}) {
  const ext = getExtension(name);
  const errors = [];

  if (!ext || MEDIABUNNY_EXTENSIONS.has(ext)) {
    try {
      return await decodeWithMediabunny(blob, { isStale });
    } catch (e) {
      if (e && e.message === "superseded") throw e;
      errors.push(`mediabunny: ${e && e.message ? e.message : e}`);
    }
  }
  if (isStale && isStale()) throw new Error("superseded");

  if (!ext || AUDIO_DECODE_EXTENSIONS.has(ext)) {
    try {
      return await decodeWithAudioDecode(blob);
    } catch (e) {
      errors.push(`@audio/decode: ${e && e.message ? e.message : e}`);
    }
  }

  if (!errors.length) errors.push(`no browser decoder for ${ext || "this file"}`);
  throw new Error(errors.join("; "));
}
