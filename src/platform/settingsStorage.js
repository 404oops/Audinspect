// settings live in localStorage so the store can read them synchronously at
// startup, exactly like the desktop app did. every write is mirrored into
// puter.kv so they follow the user to any device, and hydrateSettings()
// pulls the kv copy back into localStorage before the ui boots.
import { puterReady, getPuter, isSignedIn } from "./puterClient";

const KV_PREFIX = "audinspect:settings:";

// only our own keys are synced; puter.js keeps its own state in localStorage
const SETTING_KEYS = new Set([
  "accentColor",
  "nudgeAmount",
  "wavesurferTheme",
  "wavesurferShowHover",
  "audioOutputDevice",
  "preservePitch",
  "playOnSeekWhenPaused",
  "rememberLastFolder",
  "lastOpenedFolder",
  "rememberLastSortMode",
  "sortModeScope",
  "lastSortMode",
]);

export function isSettingKey(key) {
  return SETTING_KEYS.has(key) || key.startsWith("lastSortMode:");
}

let kvEnabled = false;

const local = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
  keys() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) =>
        localStorage.key(i)
      ).filter(Boolean);
    } catch (e) {
      return [];
    }
  },
};

function mirror(fn) {
  if (!kvEnabled) return;
  const puter = getPuter();
  if (!puter) return;
  try {
    Promise.resolve(fn(puter)).catch((e) => {
      console.warn("puter.kv write failed:", e);
    });
  } catch (e) {}
}

export const settingsStorage = {
  getItem(key) {
    return local.get(key);
  },
  setItem(key, value) {
    const str = String(value);
    local.set(key, str);
    if (isSettingKey(key)) mirror((puter) => puter.kv.set(KV_PREFIX + key, str));
  },
  removeItem(key) {
    local.remove(key);
    if (isSettingKey(key)) mirror((puter) => puter.kv.del(KV_PREFIX + key));
  },
};

async function pullFromKv(puter) {
  let pairs;
  try {
    pairs = await puter.kv.list(`${KV_PREFIX}*`, true);
  } catch (e) {
    console.warn("puter.kv.list failed:", e);
    return false;
  }
  if (!Array.isArray(pairs)) return false;

  const remoteKeys = new Set();
  pairs.forEach((pair) => {
    if (!pair || typeof pair.key !== "string") return;
    const key = pair.key.slice(KV_PREFIX.length);
    if (!isSettingKey(key) || pair.value == null) return;
    remoteKeys.add(key);
    local.set(key, String(pair.value));
  });

  kvEnabled = true;

  const missing = local
    .keys()
    .filter((key) => isSettingKey(key) && !remoteKeys.has(key))
    .map((key) => ({ key: KV_PREFIX + key, value: local.get(key) }))
    .filter((item) => item.value != null);
  if (missing.length) {
    mirror((p) => p.kv.set(missing));
  }
  return true;
}

// cloud copy wins; whatever only exists locally is pushed up once. the whole
// thing is time-boxed so a slow network never holds the ui back: the local
// copy is used and the cloud copy wins on the next start.
export async function hydrateSettings({ timeoutMs = 3000 } = {}) {
  const run = async () => {
    const puter = await puterReady(timeoutMs);
    if (!puter) return false;
    if (!(await isSignedIn())) return false;
    return pullFromKv(puter);
  };
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([run(), timeout]);
}
