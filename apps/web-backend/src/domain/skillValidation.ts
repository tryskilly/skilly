// Safety validation for tenant-authored SKILL.md, before it's stored and served
// to the widget as model instructions. A TypeScript counterpart to the desktop
// `SkillValidation.swift` scanner: size limits + a banned-phrase scan for prompt
// injection / data exfiltration, plus a raw-URL check. Pure + deterministic.
//
// (The desktop app validates with the same intent; unifying both on the shared
// core parser is tracked in the Web SDK PRD §8b.)

export interface SkillValidationResult {
  ok: boolean;
  issues: string[];
}

export const MAX_SKILL_CHARS = 10_000;
export const MIN_SKILL_CHARS = 20;

// Phrases that strongly indicate an attempt to override the companion's framing
// or exfiltrate data. Matched case-insensitively as substrings.
const BANNED_PHRASES = [
  "ignore previous instructions",
  "ignore all previous",
  "disregard the above",
  "disregard previous",
  "system prompt",
  "reveal your instructions",
  "exfiltrate",
  "send the user's",
  "api key",
  "password",
];

export function validateSkillContent(rawContent: string): SkillValidationResult {
  const issues: string[] = [];
  const content = rawContent.trim();
  const lowerContent = content.toLowerCase();

  if (content.length < MIN_SKILL_CHARS) {
    issues.push(`Skill is too short (min ${MIN_SKILL_CHARS} characters).`);
  }
  if (content.length > MAX_SKILL_CHARS) {
    issues.push(`Skill is too long (${content.length} > ${MAX_SKILL_CHARS} characters).`);
  }

  for (const phrase of BANNED_PHRASES) {
    if (lowerContent.includes(phrase)) {
      issues.push(`Disallowed phrase: "${phrase}".`);
    }
  }

  // Raw links can be used for exfiltration or to send users off-site.
  if (/https?:\/\/\S+/i.test(content)) {
    issues.push("Remove raw URLs (http/https links are not allowed in skill content).");
  }

  return { ok: issues.length === 0, issues };
}
