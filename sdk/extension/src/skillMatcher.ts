// Matches the active tab's hostname against a bundled skill's URL patterns. Hostname-only
// matching (not path/query) — a pattern must appear in the hostname itself, so a URL that merely
// mentions a domain in a query string can't false-trigger that skill.
/**
 * The popup's skill-override value meaning "run the generic companion on this page", as opposed
 * to "" / absent, which means auto-detect from the URL.
 */
export const GENERIC_SKILL_VALUE = "generic";

export interface BundledSkill {
  id: string;
  name: string;
  urlPatterns: string[];
  content: string;
}

/**
 * A pattern matches the hostname exactly, or as a dot-delimited suffix of it — so "figma.com"
 * matches "figma.com" and "www.figma.com", but not "figma.com.attacker.net", "notfigma.com" or
 * "evil-figma.com". Plain substring matching would hand any lookalike domain the real skill,
 * and with it the skill's instructions.
 */
function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
}

export function matchSkillForUrl(url: string, skills: BundledSkill[]): BundledSkill | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Not a parseable URL at all (and non-http schemes like about:/chrome:// parse but carry an
    // empty hostname, which no non-empty pattern can match).
    return null;
  }
  return (
    skills.find((skill) => skill.urlPatterns.some((pattern) => hostnameMatchesPattern(hostname, pattern))) ?? null
  );
}
