import { defineConfig } from "wxt";

const chromeExtensionKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzFbriWw6arh0TOciBITgjNVHrNqbIasfbiq42PMS7BgrQP3nuJufsik7jlTYzdnef2ehjgNUGh8+7X7XDZu5LpHtGGj4T2b9lftEqhhLbGc7yrutl3R8Rrn7WFYS1gP4aUQQ93HT+plEN4e4dcvfr7MJzeakwsyQLzeNYN8zvKiHJoNFVbuQ9BsoMlqiKYhwudwSSY6uTy6Qmz4RcFajtjOtuHEN1jAjC53eiY5gEU5QRPG61jHch8E5rxn2I6T6Pj78kbWZI1opC0V3fXLvW17q9OiYc2STEKmrb0V/y85R2qIQUmqW/I6wzB0zdoAqyPRyxr0kWOMMOgc64fik5QIDAQAB";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: ".",
  // WXT defaults Firefox to MV2; this plan is MV3-only for both targets, so pin it explicitly.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    // Pins the extension id to pfhbjclnbpgaakhkklninbpbedakpdij. Without this, an unpacked
    // extension's id is derived from its filesystem path, so it differs per machine and per
    // checkout — and the WorkOS redirect URI (https://<id>.chromiumapp.org/) would stop matching
    // the one registered in the dashboard. This is the PUBLIC half of the key; the private .pem
    // is not in the repo and is only needed to self-pack a .crx.
    ...(browser === "chrome" ? { key: chromeExtensionKey } : {}),
    name: "Skilly",
    description: "Skilly points, talks, and acts on any page you're browsing.",
    // `offscreen` hosts the Realtime voice session (a service worker cannot hold media),
    // while `identity` drives the WorkOS login redirect. The page digest is provided by
    // the statically declared content script, so no runtime scripting permission is needed.
    permissions: ["storage", "identity", ...(browser === "chrome" ? ["offscreen"] : [])],
    // The broad host permission the design's Chrome Web Store risk note flags. It is required
    // for the extension's core value — pointing into any page, including cross-origin iframes —
    // and cannot be narrowed without breaking that.
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Skilly",
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "skilly@tryskilly.app",
              data_collection_permissions: {
                required: [
                  "authenticationInfo",
                  "browsingActivity",
                  "personalCommunications",
                  "personallyIdentifyingInfo",
                  "websiteActivity",
                  "websiteContent",
                ],
              },
            },
          },
        }
      : {}),
  }),
});
