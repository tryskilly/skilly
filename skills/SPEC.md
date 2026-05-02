# SKILL.md — Spec v1.0

A `SKILL.md` is a single Markdown file that teaches an AI agent how to tutor a specific application. It pairs a YAML frontmatter block (machine-readable metadata) with structured Markdown sections (human-readable instructions). It's designed to be read by both an AI runtime (like Skilly) and a human curriculum author.

The format is intentionally minimal — a runtime needs only to parse the frontmatter and feed the rest to a language model with the appropriate context. There are no executable instructions, no scripting, no plugin API. Just text.

## File location

```
skills/
├── <skill-id>/
│   ├── SKILL.md         (required)
│   └── assets/          (optional — images referenced from SKILL.md)
```

The folder name should match the `id` field in the frontmatter.

## Frontmatter (required)

```yaml
---
id: blender-fundamentals
name: Blender Fundamentals
version: 1.0.0
format_version: "1.0"
min_runtime_version: "1.0.0"
author: moelabs
license: Apache-2.0
target_app: Blender
bundle_id: org.blenderfoundation.blender
platform: macOS
recommended_model: gpt-realtime
pointing_mode: always
category: creative-tools
tags:
  - 3d-modeling
  - blender
  - beginner
  - creative
difficulty: beginner
estimated_hours: 8
---
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique slug (lowercase, hyphens). Must match folder name. |
| `name` | string | Human-readable name shown in UI. |
| `version` | semver | Version of this skill's content. Bump on edit. |
| `format_version` | string | Spec version this skill conforms to. Currently `"1.0"`. |
| `min_runtime_version` | semver | Minimum Skilly version required to load this skill. |
| `author` | string | Author handle or org name. |
| `license` | SPDX | License identifier (e.g. `Apache-2.0`, `MIT`, `CC-BY-4.0`). |
| `target_app` | string | Display name of the app being taught. |
| `bundle_id` | string | macOS bundle identifier (e.g. `org.blenderfoundation.blender`). Used for app-detection. |
| `platform` | string | Currently `macOS`. Future: `windows`, `linux`, `web`. |
| `category` | string | Top-level grouping. Suggested: `creative-tools`, `design-tools`, `productivity`, `dev-tools`, `office`. |
| `difficulty` | enum | `beginner`, `intermediate`, `advanced`. |
| `estimated_hours` | number | Approximate hours to complete the curriculum. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `recommended_model` | string | Hint for the runtime about which model to use. Skilly defaults: `gpt-realtime`. |
| `pointing_mode` | enum | `always`, `on-request`, `never`. Whether the runtime should physically point at UI elements. |
| `tags` | string[] | Free-form tags for search. |
| `homepage` | url | Author's site or skill homepage. |
| `repository` | url | Source repository if maintained externally. |

## Body sections

After the frontmatter, the Markdown body should follow this structure (sections in this order, all required unless noted):

### 1. Title + intro paragraph (1-2 paragraphs)

A `# Skill Name` heading followed by a 2-paragraph intro that names:
- What the user will learn
- Where the content was sourced (official docs, training materials — cite specifically)
- The version of the target app the skill is calibrated to

### 2. `## Teaching Instructions` (required)

The core of the skill. This is the system-prompt-shaped instructions the AI runtime will feed to the model. Address the model in the second person ("You are teaching someone how to..."). Include:

- **Assumptions about the user** (skill level, what they have open)
- **Mental models that matter** for this app (the one or two ideas everything else hangs on)
- **Common beginner pitfalls** and how to recognize them on the user's screen
- **Tone guidance** (how patient, how technical, how to handle frustration)

This section is typically 200-400 lines and is the longest part of the skill.

### 3. `## Lessons` (required)

A numbered list of lesson modules. Each lesson should be:
- Self-contained (a user can do lesson 5 without lesson 4 if they're not stuck)
- Tied to a concrete outcome ("by the end of this lesson, you will have rendered your first image")
- Cross-referenced to official docs (link out — don't restate what the docs already say well)

### 4. `## Common Mistakes` (recommended)

A flat list of mistakes the AI tutor should recognize and gently correct. Format:

```markdown
### Wrong mode

**Symptom:** User can't select individual vertices.
**Cause:** They're in Object Mode, not Edit Mode.
**What to say:** "You're in Object Mode — press Tab to switch to Edit Mode and you'll be able to grab individual vertices."
```

### 5. `## Glossary` (optional)

App-specific terms with one-line definitions. Useful for non-native English speakers.

### 6. `## Sources` (required)

A bulleted list of every external source the skill draws from. Cite the version of the source where possible (e.g. "Blender 5.1 Manual, retrieved 2026-04-12"). This is what makes the skill honest and updatable.

## Versioning

Bump `version` on every meaningful edit. Bump `format_version` only when the spec itself changes (rare). The runtime is expected to gracefully refuse skills with `format_version` it doesn't understand.

## Pointing modes

The `pointing_mode` field tells the runtime how aggressively to physically move the user's cursor:

- `always` — point at every UI element you reference. Best for visual-heavy apps (Blender, Figma).
- `on-request` — only point when the user asks "where is X?". Best for keyboard-heavy apps (Vim, terminal tools).
- `never` — voice-only. Best for apps where cursor movement would interrupt the user's work (audio editing during a take).

## Validation

A skill is valid if:
1. The YAML frontmatter parses
2. All required fields are present and well-typed
3. The `id` matches the folder name
4. The body has at minimum a title, `## Teaching Instructions`, `## Lessons`, and `## Sources`
5. The total body length is between 100 and 2000 lines (very short skills probably miss too much; very long skills probably try to do too many things in one)

## Internationalization

Skills can be authored in any language. The `lang` field (optional, BCP-47) signals the content language to the runtime. If absent, the runtime should infer from the body. A single skill can have multiple translations in sibling folders: `blender-fundamentals/`, `blender-fundamentals-ar/`, `blender-fundamentals-ja/`.

## Sharing

Skills are designed to be portable. You can:
- Submit a PR to this repo to add yours to the canonical set
- Host your own collection in your own repo and point Skilly at it (custom skill source feature, in development)
- Fork the format entirely for a different runtime

The format is intentionally permissive so that runtimes other than Skilly can adopt it. If you build something that reads `SKILL.md` files, please open an issue so we can link to your project.

## Open questions

The spec is at v1.0 and stable. Open design questions for future versions:

- Should there be a structured `# Lessons` schema (per-lesson YAML) so runtimes can show progress UIs?
- Should skills be able to declare dependencies (e.g. "Premiere Pro Basics" requires "Premiere Pro Installed")?
- How should multi-app skills (Skilly's response to "I want to learn the After Effects → Premiere Pro round-trip workflow") be expressed?

PRs welcome.
