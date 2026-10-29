// float channels -> 16-bit pcm wav blob, the same shape ffmpeg's `-f wav -`
// produced for the desktop app. the media element can always play this.
export function encodeWav(channelData, sampleRate) {
  const channels = channelData.length;
  const frames = channels ? channelData[0].length : 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // pcm
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  const out = new Int16Array(buffer, 44, frames * channels);
  for (let ch = 0; ch < channels; ch += 1) {
    const src = channelData[ch];
    for (let i = 0, j = ch; i < frames; i += 1, j += channels) {
      const s = src[i];
      const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
      out[j] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
