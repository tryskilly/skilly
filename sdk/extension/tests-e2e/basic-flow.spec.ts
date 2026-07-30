// Covers what can be verified without a live OpenAI/WorkOS round-trip: the extension loads, a
// content script actually mounts on a real page (including inside a cross-origin iframe), and
// the popup renders its signed-out state.
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

let context: BrowserContext;
let extensionId: string;

// Two servers on two different ports so the iframe is genuinely cross-origin — the whole reason
// the extension exists rather than the embeddable widget.
let outerServer: Server;
let innerServer: Server;
let outerOrigin: string;
let innerOrigin: string;

function serveHtml(html: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

test.beforeAll(async () => {
  const inner = await serveHtml(
    `<!doctype html><title>inner</title><button data-skilly="inner-cta">Inner button</button>`,
  );
  innerServer = inner.server;
  innerOrigin = inner.origin;

  const outer = await serveHtml(
    `<!doctype html><title>outer</title><button data-skilly="outer-cta">Outer button</button>
     <iframe src="${innerOrigin}" width="300" height="200"></iframe>`,
  );
  outerServer = outer.server;
  outerOrigin = outer.origin;

  // The package is an ES module, so __dirname does not exist here.
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const pathToExtension = path.join(testDirectory, "../.output/chrome-mv3");
  context = await chromium.launchPersistentContext("", {
    // MV3 extensions require a headed context in current Playwright/Chromium.
    headless: false,
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });

  // The service worker registers asynchronously after the context starts.
  const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionId = new URL(serviceWorker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
  outerServer?.close();
  innerServer?.close();
});

test("content script mounts a hidden cursor element on a real page", async () => {
  const page = await context.newPage();
  await page.goto(outerOrigin);

  const cursor = page.locator("[data-skilly-cursor]");
  await expect(cursor).toBeAttached();
  await expect(cursor).toHaveAttribute("data-visible", "false");

  await page.close();
});

// allFrames: true is what lets Skilly reach into cross-origin iframes at all; if the content
// script silently stopped injecting into subframes, pointing there would fail with no error.
test("content script also mounts inside a cross-origin iframe", async () => {
  const page = await context.newPage();
  await page.goto(outerOrigin);

  const iframe = page.frameLocator("iframe");
  await expect(iframe.locator("[data-skilly-cursor]")).toBeAttached();

  await page.close();
});

// The widget must be invisible to its own digest, or Skilly offers its own cursor and confirm
// buttons to the model as page elements to click.
test("the widget's own elements are marked so the digest excludes them", async () => {
  const page = await context.newPage();
  await page.goto(outerOrigin);

  await expect(page.locator("[data-skilly-widget] [data-skilly-cursor]")).toBeAttached();
  await expect(page.locator("[data-skilly-widget] [data-skilly-banner]")).toBeAttached();

  await page.close();
});

test("popup renders its signed-out state", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator("#sign-in")).toBeVisible();
  await expect(page.locator("#signed-in")).toBeHidden();

  await page.close();
});
