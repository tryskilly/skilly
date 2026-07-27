import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import { inferPointFromText, parsePointTags, PointingEngine } from "../src/pointing";
import type { DomDigest } from "../src/digest";

const digest: DomDigest = {
  url: "https://tryskilly.app",
  title: "Skilly",
  viewport: { width: 1200, height: 800 },
  truncated: false,
  elements: [
    { id: "primary-cta", role: "region", label: "primary-cta", rect: { x: 0, y: 0, width: 10, height: 10 } },
    { id: "pricing", role: "region", label: "pricing", rect: { x: 0, y: 0, width: 10, height: 10 } },
    { id: "demo-video", role: "button", label: "demo-video", rect: { x: 0, y: 0, width: 10, height: 10 } },
  ],
};

describe("parsePointTags", () => {
  test("strips point tags and returns target metadata", () => {
    const parsed = parsePointTags("Click here [POINT:pricing:Pricing] to compare plans.");
    expect(parsed.cleanedText).toBe("Click here to compare plans.");
    expect(parsed.points).toEqual([{ target: "pricing", label: "Pricing" }]);
  });
});

describe("inferPointFromText", () => {
  test("infers pricing from spoken cost language", () => {
    expect(inferPointFromText("The cost and plan details are in the pricing section.", digest)).toEqual({
      target: "pricing",
      label: "pricing",
    });
  });

  test("infers primary CTA from get-started language", () => {
    expect(inferPointFromText("To get started, use the download button.", digest)).toEqual({
      target: "primary-cta",
      label: "primary-cta",
    });
  });

  test("returns null when no page element is mentioned", () => {
    expect(inferPointFromText("Skilly is a voice-first tutor.", digest)).toBeNull();
  });
});

describe("PointingEngine construction", () => {
  let windowStub: { innerWidth?: number; innerHeight?: number } | undefined;

  beforeEach(() => {
    // Ensure window exists and has the required properties for PointingEngine
    if (typeof (globalThis as any).window === "undefined") {
      (globalThis as any).window = {};
    }
    windowStub = (globalThis as any).window;

    // Store original descriptors
    const originalInnerWidth = Object.getOwnPropertyDescriptor(windowStub, "innerWidth");
    const originalInnerHeight = Object.getOwnPropertyDescriptor(windowStub, "innerHeight");

    // Set up mock properties, restore after test
    Object.defineProperty(windowStub, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
    Object.defineProperty(windowStub, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });

    // Store descriptors for cleanup
    (windowStub as any).__originalInnerWidthDesc = originalInnerWidth;
    (windowStub as any).__originalInnerHeightDesc = originalInnerHeight;
  });

  afterEach(() => {
    if (!windowStub) return;

    // Restore original properties or delete the mock
    const originalWidthDesc = (windowStub as any).__originalInnerWidthDesc;
    const originalHeightDesc = (windowStub as any).__originalInnerHeightDesc;

    if (originalWidthDesc) {
      Object.defineProperty(windowStub, "innerWidth", originalWidthDesc);
    } else {
      delete (windowStub as any).innerWidth;
    }

    if (originalHeightDesc) {
      Object.defineProperty(windowStub, "innerHeight", originalHeightDesc);
    } else {
      delete (windowStub as any).innerHeight;
    }

    // Clean up temporary storage
    delete (windowStub as any).__originalInnerWidthDesc;
    delete (windowStub as any).__originalInnerHeightDesc;
  });

  test("accepts a plain object satisfying the CursorHost shape, not a real SkillyWidget", () => {
    let hideCalled = false;
    const fakeCursorHost = {
      showCursor: () => {},
      hideCursor: () => {
        hideCalled = true;
      },
      setCursorPosition: (_x: number, _y: number) => {},
    };
    const engine = new PointingEngine(fakeCursorHost);
    engine.clear();
    expect(hideCalled).toBe(true);
  });
});
