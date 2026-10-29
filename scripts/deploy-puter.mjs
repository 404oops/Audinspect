#!/usr/bin/env node
// publishes the build as a puter *app*:
//   1. uploads dist/ to a new release folder on the puter drive
//      (~/Documents/Audinspect/v<version>-<timestamp>/ by default)
//   2. serves that folder at <subdomain>.puter.site (created or re-pointed),
//      then removes the previous release folders
//   3. creates or updates the puter app that opens it, with the audio
//      extensions as file type associations
//
// a fresh folder per release keeps the switch atomic (the site only moves
// once every file is up) and avoids a puter quirk where a directory made by
// /mkdir is not accepted as the parent of uploaded files.
//
// usage: node scripts/deploy-puter.mjs [subdomain] [--dry-run]
// env:   PUTER_AUTH_TOKEN (or a browser sign-in is opened), PUTER_SUBDOMAIN,
//        PUTER_APP_NAME (default audinspect), PUTER_APP_DIR (default ~/Documents/Audinspect)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const audioExtensions = Object.keys(
  JSON.parse(readFileSync(join(root, "src/utils/audio-extensions.json"), "utf8"))
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const subdomain = (args.find((a) => !a.startsWith("--")) || process.env.PUTER_SUBDOMAIN || "")
  .trim()
  .replace(/\.puter\.site$/i, "");
const appName = (process.env.PUTER_APP_NAME || "audinspect").trim();
const remoteDir = (process.env.PUTER_APP_DIR || "~/Documents/Audinspect").replace(/\/+$/, "");
const distDir = join(root, "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain",
};

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else out.push({ abs, rel: relative(distDir, abs).split(sep).join("/"), size: st.size });
  }
  return out;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await fn(items[i], i);
    return run();
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const describe = (e) => {
  if (!e) return String(e);
  const parts = [e.message || e.error?.message || e.code];
  // the sdk's batch upload attaches the failed items with their own errors
  if (Array.isArray(e.failedItems)) {
    e.failedItems.forEach((item) => {
      parts.push(`${item.path || item.name || item.requestIndex} (${item.stage}): ${item.message || item.code || item.status || "unknown error"}`);
    });
  }
  return parts.filter(Boolean).join("; ") || JSON.stringify(e);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// uploads are individually retried: the puter api occasionally fails a
// single operation in a batch, and that must not sink the whole deploy
async function withRetries(label, fn, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts) throw e;
      console.warn(`  ${label}: ${describe(e)}; retrying (${attempt}/${attempts - 1})`);
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

// ---------------------------------------------------------------------------
if (!subdomain) fail("no subdomain: pass it as the first argument or set PUTER_SUBDOMAIN");
if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
  fail(`"${subdomain}" is not a valid subdomain (lowercase letters, digits, hyphens)`);
}
let files;
try {
  files = walk(distDir);
} catch (e) {
  fail(`dist/ is missing or unreadable (${describe(e)}); run \`npm run build\` first`);
}
if (!files.some((f) => f.rel === "index.html")) fail("dist/index.html not found; run `npm run build` first");

const indexURL = `https://${subdomain}.puter.site`;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
const releaseName = `v${pkg.version}-${stamp}`;
const releaseDir = `${remoteDir}/${releaseName}`;
const isReleaseName = (name) => /^v\d+\.\d+\.\d+-\d{8}T\d{6}$/.test(name);
// what dist/ puts at its top level; leftovers of these at the folder root
// come from older versions of this script and are swept
const DIST_ROOT_NAMES = new Set(["assets", "index.html", "icon.png"]);
const totalBytes = files.reduce((a, f) => a + f.size, 0);
console.log(`${files.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) → ${releaseDir} → ${indexURL} → app "${appName}"`);

if (dryRun) {
  files.forEach((f) => console.log(`  ${f.rel}`));
  console.log("dry run, nothing uploaded");
  process.exit(0);
}

// ---------------------------------------------------------------------------
const { init, getAuthToken } = require("@heyputer/puter.js/src/init.cjs");
let token = process.env.PUTER_AUTH_TOKEN;
if (!token) {
  if (process.env.CI) fail("PUTER_AUTH_TOKEN is not set");
  console.log("no PUTER_AUTH_TOKEN; opening the browser to sign in…");
  token = await getAuthToken();
}
const puter = init(token);

try {
  const me = await puter.auth.getUser();
  console.log(`signed in as ${me.username}`);

  // 1. upload into a fresh release folder ---------------------------------------
  // the folders are created by the upload itself (createMissingParents), see
  // the note at the top
  let done = 0;
  await mapWithConcurrency(files, 3, async (f) => {
    const bytes = readFileSync(f.abs);
    await withRetries(f.rel, () => {
      const file = new File([bytes], basename(f.rel), {
        type: MIME[extname(f.rel).toLowerCase()] || "application/octet-stream",
      });
      return puter.fs.write(`${releaseDir}/${f.rel}`, file, {
        overwrite: true,
        createMissingParents: true,
      });
    });
    done += 1;
    if (done % 10 === 0 || done === files.length) console.log(`uploaded ${done}/${files.length}`);
  });
  const releaseStat = await puter.fs.stat(releaseDir);
  if (!(releaseStat.is_dir || releaseStat.isDir)) fail(`${releaseDir} did not end up a directory`);

  // 2. the site -------------------------------------------------------------------
  let site = null;
  try {
    site = await puter.hosting.get(subdomain);
  } catch (e) {
    site = null;
  }
  if (site) {
    await puter.hosting.update(subdomain, releaseDir);
    console.log(`site ${indexURL} now serves ${releaseDir}`);
  } else {
    await puter.hosting.create(subdomain, releaseDir);
    console.log(`site ${indexURL} created, serving ${releaseDir}`);
  }

  // older releases (and leftovers of the flat layout) are no longer served
  try {
    const listed = await puter.fs.readdir(remoteDir);
    const entries = Array.isArray(listed) ? listed : listed.items || [];
    const stale = entries
      .filter((it) => it.name !== releaseName)
      .filter((it) => ((it.is_dir || it.isDir) && isReleaseName(it.name)) || DIST_ROOT_NAMES.has(it.name))
      .map((it) => it.path);
    if (stale.length) {
      await puter.fs.delete(stale, { recursive: true });
      console.log(`removed ${stale.length} older release(s)`);
    }
  } catch (e) {
    console.warn(`could not clean up ${remoteDir}: ${describe(e)}`);
  }

  // 3. the app ------------------------------------------------------------------
  const icon = `data:image/png;base64,${readFileSync(join(root, "resources/icon.png")).toString("base64")}`;
  const attributes = {
    indexURL,
    title: "Audinspect",
    description: pkg.description,
    icon,
    maximizeOnStart: false,
    filetypeAssociations: audioExtensions.map((ext) => `.${ext}`),
    metadata: { version: pkg.version },
  };
  let app = null;
  try {
    app = await puter.apps.get(appName);
  } catch (e) {
    app = null;
  }
  if (app) {
    await puter.apps.update(appName, attributes);
    console.log(`app "${appName}" updated`);
  } else {
    try {
      await puter.apps.create({ name: appName, ...attributes });
      console.log(`app "${appName}" created`);
    } catch (e) {
      fail(
        `could not create app "${appName}": ${describe(e)}. app names are global on puter; set PUTER_APP_NAME to a free one`
      );
    }
  }

  console.log(`✔ deployed v${pkg.version}`);
  console.log(`  files: ${releaseDir}`);
  console.log(`  site:  ${indexURL}`);
  console.log(`  app:  https://puter.com/app/${appName}`);
  process.exit(0);
} catch (e) {
  fail(describe(e));
}
