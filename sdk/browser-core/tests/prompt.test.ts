import { describe, expect, test } from "bun:test";
import { buildCompanionInstructions, summarizeDigestForPrompt } from "../src/prompt";
import type { DomDigest } from "../src/digest";

function digest(elements: DomDigest["elements"]): DomDigest {
  return { url: "https://acme.com", title: "Acme", viewport: { width: 1000, height: 800 }, elements, truncated: false };
}

describe("summarizeDigestForPrompt", () => {
  test("renders one line per element with id/role/label", () => {
    const summary = summarizeDigestForPrompt(
      digest([
        { id: "pricing", role: "region", label: "Pricing", rect: { x: 0, y: 0, width: 10, height: 10 } },
        { id: "el_1", role: "button", label: "Buy now", rect: { x: 0, y: 0, width: 10, height: 10 } },
      ]),
    );
    expect(summary).toContain("[pricing] region: Pricing");
    expect(summary).toContain("[el_1] button: Buy now");
  });

  test("handles an empty page", () => {
    expect(summarizeDigestForPrompt(digest([]))).toContain("none detected");
  });
});

describe("buildCompanionInstructions", () => {
  const sample = digest([
    { id: "pricing", role: "region", label: "Pricing", rect: { x: 0, y: 0, width: 10, height: 10 } },
  ]);

  test("includes persona, skill, page summary, and the pointing protocol", () => {
    const instructions = buildCompanionInstructions({
      skillContent: "# Acme\nTeach project setup.",
      digest: sample,
    });
    expect(instructions).toContain("You are Skilly");
    expect(instructions).toContain("ACTIVE SKILL");
    expect(instructions).toContain("Teach project setup.");
    expect(instructions).toContain("PAGE ELEMENTS");
    expect(instructions).toContain("[POINT:<id>:<short label>]");
  });

  test("omits the skill section when no skill content is provided", () => {
    const instructions = buildCompanionInstructions({ skillContent: null, digest: sample });
    expect(instructions).not.toContain("ACTIVE SKILL");
    expect(instructions).toContain("PAGE ELEMENTS");
  });
});
