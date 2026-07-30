import { describe, expect, test, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { MinimalCursorWidget } from "../src/minimalCursorWidget";

let window: Window;

beforeEach(() => {
  window = new Window();
  // @ts-expect-error -- happy-dom's globals are close enough for this widget's DOM usage
  globalThis.document = window.document;
  // @ts-expect-error -- ditto
  globalThis.HTMLElement = window.HTMLElement;
});

describe("MinimalCursorWidget", () => {
  test("mounts a cursor element hidden by default", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    const cursor = window.document.querySelector("[data-skilly-cursor]");
    expect(cursor).not.toBeNull();
    expect(cursor?.getAttribute("data-visible")).toBe("false");
  });

  test("showCursor/hideCursor toggle visibility", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.showCursor();
    expect(window.document.querySelector("[data-skilly-cursor]")?.getAttribute("data-visible")).toBe("true");
    widget.hideCursor();
    expect(window.document.querySelector("[data-skilly-cursor]")?.getAttribute("data-visible")).toBe("false");
  });

  // The -3px offset puts the SVG cursor's *tip* on the target rather than its top-left corner,
  // matching sdk/web's SkillyWidget so both surfaces point identically.
  test("setCursorPosition offsets the transform to land the cursor tip on the point", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.setCursorPosition(100, 200);
    const cursor = window.document.querySelector("[data-skilly-cursor]") as unknown as HTMLElement;
    expect(cursor.style.transform).toBe("translate(97px, 197px)");
  });

  test("showBanner displays text; hideBanner clears it", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.showBanner("Session limit reached.");
    const banner = window.document.querySelector("[data-skilly-banner]");
    expect(banner?.getAttribute("data-visible")).toBe("true");
    expect(banner?.textContent).toBe("Session limit reached.");
    widget.hideBanner();
    expect(window.document.querySelector("[data-skilly-banner]")?.getAttribute("data-visible")).toBe("false");
  });

  // The widget mounts into the host page's DOM, so it must carry data-skilly-widget: the digest
  // builder filters out anything inside that attribute, otherwise Skilly's own cursor and confirm
  // buttons would be offered to the model as page elements to point at and click.
  test("marks its own elements so the digest builder excludes them", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    for (const selector of ["[data-skilly-cursor]", "[data-skilly-confirm]", "[data-skilly-banner]"]) {
      const element = window.document.querySelector(selector);
      expect(element?.closest("[data-skilly-widget]")).not.toBeNull();
    }
  });

  describe("confirmAction", () => {
    test("resolves true when the confirm button is clicked", async () => {
      const widget = new MinimalCursorWidget();
      widget.mount();
      const pending = widget.confirmAction("Delete project");
      const confirmPanel = window.document.querySelector("[data-skilly-confirm]");
      expect(confirmPanel?.getAttribute("data-visible")).toBe("true");
      expect(confirmPanel?.querySelector("[data-skilly-confirm-copy]")?.textContent).toContain("Delete project");

      (window.document.querySelector("[data-skilly-confirm-yes]") as unknown as HTMLElement).click();
      expect(await pending).toBe(true);
      expect(confirmPanel?.getAttribute("data-visible")).toBe("false");
    });

    test("resolves false when the cancel button is clicked", async () => {
      const widget = new MinimalCursorWidget();
      widget.mount();
      const pending = widget.confirmAction("Delete project");
      (window.document.querySelector("[data-skilly-confirm-no]") as unknown as HTMLElement).click();
      expect(await pending).toBe(false);
    });

    // A second request must not strand the first promise unresolved — the ActionExecutor awaits it.
    test("resolves a superseded confirmation as declined", async () => {
      const widget = new MinimalCursorWidget();
      widget.mount();
      const firstPending = widget.confirmAction("First action");
      const secondPending = widget.confirmAction("Second action");
      expect(await firstPending).toBe(false);

      (window.document.querySelector("[data-skilly-confirm-yes]") as unknown as HTMLElement).click();
      expect(await secondPending).toBe(true);
    });

    // destroy() while a confirmation is open must not leave the executor awaiting forever.
    test("resolves a pending confirmation as declined on destroy", async () => {
      const widget = new MinimalCursorWidget();
      widget.mount();
      const pending = widget.confirmAction("Delete project");
      widget.destroy();
      expect(await pending).toBe(false);
      expect(window.document.querySelector("[data-skilly-cursor]")).toBeNull();
    });
  });
});
