// files dropped in from outside puter (the host os, a browser tab) have no
// puter path. the desktop app copied them into a capped on-disk cache; here
// the browser keeps the File objects in memory for the session and nothing
// is written anywhere. they get a synthetic `dropped://` path so the rest of
// the player can treat them like any other track.
import { getExtension, isAudioName } from "../utils/audioExtensions";

const SCHEME = "dropped://";
const files = new Map(); // path -> File
let nextId = 1;

export function isVirtualPath(p) {
  return typeof p === "string" && p.startsWith(SCHEME);
}

export function registerVirtualFile(file, relativePath) {
  const name = relativePath || file.name || `file-${nextId}`;
  const path = `${SCHEME}${nextId}/${name}`;
  nextId += 1;
  files.set(path, file);
  return { path, name: file.name || name };
}

export function getVirtualFile(path) {
  return files.get(path) || null;
}

export function virtualFileMetadata(path) {
  const file = files.get(path);
  if (!file) return null;
  const mtimeMs =
    typeof file.lastModified === "number" ? file.lastModified : null;
  return {
    path,
    size: typeof file.size === "number" ? file.size : null,
    mtimeMs,
    mtimeIso: mtimeMs != null ? new Date(mtimeMs).toISOString() : null,
    type: getExtension(file.name) || null,
  };
}

const fileOfEntry = (entry) =>
  new Promise((resolve) => entry.file(resolve, () => resolve(null)));

// readEntries hands out a directory in batches until it yields an empty one
function readAllEntries(reader, collected = []) {
  return new Promise((resolve) => {
    reader.readEntries(
      (batch) => {
        if (!batch.length) {
          resolve(collected);
          return;
        }
        resolve(readAllEntries(reader, collected.concat(Array.from(batch))));
      },
      () => resolve(collected)
    );
  });
}

// walks a dropped directory through the file system entry api
async function filesFromEntry(entry, prefix) {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await fileOfEntry(entry);
    return file && isAudioName(file.name) ? [{ file, rel: prefix + file.name }] : [];
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries(entry.createReader());
    const parts = await Promise.all(
      entries.map((child) => filesFromEntry(child, `${prefix}${entry.name}/`))
    );
    return parts.flat();
  }
  return [];
}

// turns the DataTransfer of a drop from outside puter into playlist entries.
// `unsupported` counts top-level files that aren't audio.
export async function collectDroppedFiles(dataTransfer) {
  const entries = [];
  let unsupported = 0;
  let folders = 0;

  const items = Array.from(dataTransfer?.items || []);
  const fileList = Array.from(dataTransfer?.files || []);
  const canWalk = items.length && items.every((i) => typeof i.webkitGetAsEntry === "function");

  if (canWalk) {
    // entries must be grabbed synchronously, before the first await
    const fileItems = items.filter((i) => i.kind === "file");
    const fsEntries = fileItems.map((i) => i.webkitGetAsEntry());
    const plainFiles = fileItems.map((i) => i.getAsFile());
    const resolved = await Promise.all(
      fsEntries.map(async (entry, i) => {
        if (entry && entry.isDirectory) {
          return { folder: true, found: await filesFromEntry(entry, "") };
        }
        const file =
          plainFiles[i] || (entry && entry.isFile ? await fileOfEntry(entry) : null);
        return { file };
      })
    );
    resolved.forEach(({ folder, found, file }) => {
      if (folder) {
        folders += 1;
        found.forEach(({ file: f, rel }) => entries.push(registerVirtualFile(f, rel)));
      } else if (file) {
        if (isAudioName(file.name)) entries.push(registerVirtualFile(file));
        else unsupported += 1;
      }
    });
  } else {
    fileList.forEach((file) => {
      if (isAudioName(file.name)) entries.push(registerVirtualFile(file));
      else unsupported += 1;
    });
  }

  return { entries, unsupported, folders };
}
