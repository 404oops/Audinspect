import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  // relative asset urls: the build is served from a *.puter.site root or any subfolder
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: "es",
  },
  build: {
    // mediabunny and the wasm decoders use current syntax (bigint, top-level await)
    target: "esnext",
    chunkSizeWarningLimit: 1500,
  },
});
