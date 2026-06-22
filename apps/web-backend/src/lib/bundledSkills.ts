import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface BundledSkillSummary {
  id: string;
  name: string;
  targetApp: string;
  category: string;
  difficulty: string;
  estimatedHours: string;
  license: string;
  content: string;
}

const fallbackSkills: BundledSkillSummary[] = [
  {
    id: "blender-fundamentals",
    name: "Blender Fundamentals",
    targetApp: "Blender",
    category: "creative-tools",
    difficulty: "beginner",
    estimatedHours: "8",
    license: "Apache-2.0",
    content: "",
  },
  {
    id: "figma-basics",
    name: "Figma Basics",
    targetApp: "Figma",
    category: "design-tools",
    difficulty: "beginner",
    estimatedHours: "6",
    license: "MIT",
    content: "",
  },
];

function frontmatterValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function parseSkill(content: string): BundledSkillSummary {
  return {
    id: frontmatterValue(content, "id") ?? "unknown-skill",
    name: frontmatterValue(content, "name") ?? "Untitled skill",
    targetApp: frontmatterValue(content, "target_app") ?? "Unknown app",
    category: frontmatterValue(content, "category") ?? "skills",
    difficulty: frontmatterValue(content, "difficulty") ?? "beginner",
    estimatedHours: frontmatterValue(content, "estimated_hours") ?? "0",
    license: frontmatterValue(content, "license") ?? "unknown",
    content,
  };
}

export async function listBundledSkills(): Promise<BundledSkillSummary[]> {
  const skillsRoot = path.resolve(process.cwd(), "../../skills");
  try {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const content = await readFile(path.join(skillsRoot, entry.name, "SKILL.md"), "utf8");
          return parseSkill(content);
        }),
    );
    return skills.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return fallbackSkills;
  }
}
