import { defineConfig } from "tsup";

// Two outputs from one entry:
// - ESM (`skilly-web.js`) for bundler/npm consumers (`import { init } from "@skilly/web"`).
// - IIFE (`skilly-web.global.js`) for the `<script src>` embed — exposes `window.Skilly`.
export default defineConfig({
  entry: { "skilly-web": "src/index.ts" },
  format: ["esm", "iife"],
  globalName: "Skilly",
  dts: { entry: "src/index.ts" },
  sourcemap: true,
  minify: true,
  clean: true,
  target: "es2020",
  platform: "browser",
});
