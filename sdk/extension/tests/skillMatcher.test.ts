import { describe, expect, test } from "bun:test";
import { matchSkillForUrl } from "../src/skillMatcher";
import type { BundledSkill } from "../src/skillMatcher";

const testSkills: BundledSkill[] = [
  { id: "figma-basics", name: "Figma Basics", urlPatterns: ["figma.com"], content: "# Figma" },
  { id: "generic", name: "Generic", urlPatterns: [], content: "" },
];

describe("matchSkillForUrl", () => {
  test("matches a skill whose urlPattern is the hostname", () => {
    const match = matchSkillForUrl("https://figma.com/file/abc123", testSkills);
    expect(match?.id).toBe("figma-basics");
  });

  test("matches a subdomain of the pattern", () => {
    const match = matchSkillForUrl("https://www.figma.com/file/abc123", testSkills);
    expect(match?.id).toBe("figma-basics");
  });

  test("returns null when no skill's pattern matches the hostname", () => {
    expect(matchSkillForUrl("https://example.com/page", testSkills)).toBeNull();
  });

  test("does not match a pattern found only in the path or query string, not the hostname", () => {
    // "figma.com" appearing in a query param on an unrelated host must not false-match.
    const match = matchSkillForUrl("https://example.com/redirect?to=figma.com", testSkills);
    expect(match).toBeNull();
  });

  // Substring matching on the hostname would hand a lookalike domain the real skill — and with
  // it the skill's instructions — so the pattern must match at a dot boundary, not anywhere.
  test("does not match a lookalike domain that merely contains the pattern", () => {
    expect(matchSkillForUrl("https://figma.com.attacker.net/file/abc", testSkills)).toBeNull();
    expect(matchSkillForUrl("https://notfigma.com/file/abc", testSkills)).toBeNull();
    expect(matchSkillForUrl("https://evil-figma.com/file/abc", testSkills)).toBeNull();
  });

  test("matches case-insensitively", () => {
    expect(matchSkillForUrl("https://WWW.FIGMA.COM/file/abc", testSkills)?.id).toBe("figma-basics");
  });

  test("returns null for an unparseable URL rather than throwing", () => {
    expect(matchSkillForUrl("not a url", testSkills)).toBeNull();
  });

  test("returns null for a browser-internal URL with no matching host", () => {
    expect(matchSkillForUrl("about:blank", testSkills)).toBeNull();
    expect(matchSkillForUrl("chrome://extensions", testSkills)).toBeNull();
  });
});
