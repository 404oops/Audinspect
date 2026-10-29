// puter.js is loaded from https://js.puter.com/v2/ in index.html, which is
// the documented way to include it: the sdk stays in step with the puter
// desktop that hosts the app. the global appears as soon as that script has
// run; the helpers here only guard against a slow network or a blocked cdn.
let readyPromise = null;

export function hasPuter() {
  return typeof window !== "undefined" && !!window.puter;
}

export function getPuter() {
  return hasPuter() ? window.puter : null;
}

// resolves with the puter global, or null when it hasn't shown up within
// the timeout. a null answer is not cached, so a later call tries again.
export function puterReady(timeoutMs = 8000) {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve) => {
    if (hasPuter()) {
      resolve(window.puter);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      if (hasPuter()) {
        resolve(window.puter);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  }).then((puter) => {
    if (!puter) readyPromise = null;
    return puter;
  });
  return readyPromise;
}

// inside a puter window (`puter.env === "app"`) the user is always signed
// in. on a plain web page puter.js would open a sign-in popup on the first
// authenticated call, so cloud features are only used after an explicit
// sign-in there.
export async function isSignedIn() {
  const puter = getPuter();
  if (!puter) return false;
  if (puter.env === "app") return true;
  try {
    return !!(await puter.auth.isSignedIn());
  } catch (e) {
    return false;
  }
}
