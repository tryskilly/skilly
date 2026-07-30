import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: ".",
  // WXT defaults Firefox to MV2; this plan is MV3-only for both targets, so pin it explicitly.
  manifestVersion: 3,
  manifest: {
    name: "Skilly",
    description: "Skilly points, talks, and acts on any page you're browsing.",
    // `offscreen` hosts the Realtime voice session (a service worker cannot hold media),
    // `identity` drives the WorkOS login redirect, `scripting` injects the page digest.
    permissions: ["storage", "offscreen", "identity", "scripting"],
    // The broad host permission the design's Chrome Web Store risk note flags. It is required
    // for the extension's core value — pointing into any page, including cross-origin iframes —
    // and cannot be narrowed without breaking that.
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Skilly",
    },
  },
});
