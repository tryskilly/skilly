import { describe, expect, test } from "bun:test";
import { qualifyElementId, parseQualifiedTarget, FrameRegistry } from "../src/frameRegistry";
import type { DomDigest } from "@skilly/browser-core";

function digestWith(elements: Array<{ id: string; label: string }>): DomDigest {
  return {
    url: "https://example.com",
    title: "Example",
    viewport: { width: 1200, height: 800 },
    truncated: false,
    elements: elements.map((element) => ({
      id: element.id,
      role: "button",
      label: element.label,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })),
  };
}

describe("qualifyElementId / parseQualifiedTarget", () => {
  test("round-trips a frame id and local id", () => {
    const qualified = qualifyElementId(2, "el_1");
    expect(qualified).toBe("f2:el_1");
    expect(parseQualifiedTarget(qualified)).toEqual({ frameId: 2, localTarget: "el_1" });
  });

  test("returns null for a target with no frame qualifier", () => {
    expect(parseQualifiedTarget("el_1")).toBeNull();
  });

  test("returns null for a malformed frame qualifier", () => {
    expect(parseQualifiedTarget("fX:el_1")).toBeNull();
  });

  // A local id may itself contain a colon (data-skilly values are author-supplied), so only the
  // FIRST colon separates the frame qualifier from the local target.
  test("keeps colons inside the local target intact", () => {
    expect(parseQualifiedTarget("f3:nav:primary:cta")).toEqual({ frameId: 3, localTarget: "nav:primary:cta" });
  });
});

describe("FrameRegistry", () => {
  test("merges digests from multiple frames with qualified, collision-free ids", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "Top frame button" }]));
    registry.registerFrame(7, digestWith([{ id: "el_1", label: "Iframe button" }])); // same local id, different frame

    const merged = registry.mergedDigest();
    const ids = merged.elements.map((element) => element.id);
    expect(ids).toEqual(["f0:el_1", "f7:el_1"]);
    expect(merged.elements.find((element) => element.id === "f7:el_1")?.label).toBe("Iframe button");
  });

  // Frames load in arbitrary order, so an iframe's content script can register before the top
  // frame's. The merged view must still read top-frame-first rather than registration-first.
  test("orders merged elements by frame id regardless of registration order", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(7, digestWith([{ id: "el_1", label: "Iframe button" }]));
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "Top frame button" }]));

    const merged = registry.mergedDigest();
    expect(merged.elements.map((element) => element.id)).toEqual(["f0:el_1", "f7:el_1"]);
    expect(merged.url).toBe("https://example.com");
    expect(merged.viewport).toEqual({ width: 1200, height: 800 });
  });

  test("unregistering a frame removes its elements from the merge", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.registerFrame(1, digestWith([{ id: "el_1", label: "B" }]));
    registry.unregisterFrame(1);
    expect(registry.mergedDigest().elements.map((element) => element.id)).toEqual(["f0:el_1"]);
  });

  test("clear() empties the registry", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.clear();
    expect(registry.mergedDigest().elements).toEqual([]);
  });

  test("mergedDigest reports truncated:true if ANY registered frame was truncated", () => {
    const registry = new FrameRegistry();
    const truncatedDigest = { ...digestWith([{ id: "el_1", label: "A" }]), truncated: true };
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.registerFrame(1, truncatedDigest);
    expect(registry.mergedDigest().truncated).toBe(true);
  });

  // Re-registering the same frame replaces its digest rather than accumulating duplicates —
  // a content script re-sends its digest on every DOM change.
  test("re-registering a frame replaces that frame's previous digest", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "Before" }]));
    registry.registerFrame(0, digestWith([{ id: "el_2", label: "After" }]));

    const merged = registry.mergedDigest();
    expect(merged.elements.map((element) => element.id)).toEqual(["f0:el_2"]);
  });

  // With no top frame registered, the merge must still be well-formed rather than throwing.
  test("falls back to a zeroed viewport when frame 0 is absent", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(4, digestWith([{ id: "el_1", label: "Orphan iframe" }]));

    const merged = registry.mergedDigest();
    expect(merged.viewport).toEqual({ width: 0, height: 0 });
    expect(merged.url).toBe("");
    expect(merged.elements.map((element) => element.id)).toEqual(["f4:el_1"]);
  });
});
