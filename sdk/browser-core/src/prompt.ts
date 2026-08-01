// Builds the companion's session instructions for the Realtime model. The web
// analog of the desktop 5-layer prompt: base persona + the tenant's authored
// SKILL.md + a compact summary of the live page (the DOM digest) + the pointing
// protocol that tells the model how to reference on-screen elements.
//
// Pure + deterministic so it's unit-testable.

import type { DomDigest } from "./digest.js";

const BASE_PERSONA = [
  "You are Skilly, an embedded teaching companion living inside this website.",
  "Help the visitor accomplish what they ask, concisely and warmly, by voice.",
  "You can SEE the page through a structured list of its elements (below).",
].join(" ");

const POINTING_PROTOCOL = [
  "To point the on-screen cursor at an element, include a tag of the exact form",
  "[POINT:<id>:<short label>] in your spoken response, where <id> is one of the",
  "element ids listed in PAGE ELEMENTS. Use at most one POINT per response, only",
  "when it helps the user locate something. Never read the tag aloud or invent ids.",
].join(" ");

const MAX_DIGEST_ELEMENTS = 30;

/** A compact, model-friendly rendering of the page's elements. */
export function summarizeDigestForPrompt(digest: DomDigest): string {
  if (digest.elements.length === 0) {
    return "PAGE ELEMENTS: (none detected)";
  }
  const lines = digest.elements
    .slice(0, MAX_DIGEST_ELEMENTS)
    .map((element) => `- [${element.id}] ${element.role}: ${element.label || "(no label)"}`);
  const header = `PAGE ELEMENTS (page "${digest.title}"):`;
  return [header, ...lines].join("\n");
}

export interface InstructionInput {
  skillContent?: string | null;
  digest: DomDigest;
}

/** Compose the full instruction string sent in the Realtime session.update. */
export function buildCompanionInstructions(input: InstructionInput): string {
  const sections: string[] = [BASE_PERSONA];

  if (input.skillContent && input.skillContent.trim()) {
    sections.push(`--- ACTIVE SKILL ---\n${input.skillContent.trim()}`);
  }

  sections.push(summarizeDigestForPrompt(input.digest));
  sections.push(`--- POINTING ---\n${POINTING_PROTOCOL}`);

  return sections.join("\n\n");
}
