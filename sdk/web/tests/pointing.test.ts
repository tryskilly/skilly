import { describe, expect, test } from "bun:test";
import { inferPointFromText, parsePointTags } from "../src/pointing";
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
