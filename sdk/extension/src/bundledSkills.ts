// The skills shipped inside the extension. Content is imported raw from the repo's canonical
// skills/ directory rather than pasted in, so the extension can never drift from the SKILL.md
// the Mac app and the docs use.
//
// Only products with a real web app get an entry: the other bundled skills (Blender,
// After Effects, Premiere Pro, DaVinci Resolve, Houdini) are desktop applications with no URL to
// match against, so their absence here is correct, not a gap. The generic fallback covers
// every other site.
import figmaBasicsSkillContent from "../../../skills/figma-basics/SKILL.md?raw";
import type { BundledSkill } from "./skillMatcher";

export const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: "figma-basics",
    name: "Figma Basics",
    urlPatterns: ["figma.com"],
    content: figmaBasicsSkillContent,
  },
];
