# Skilly Skill Format Specification

## Overview

This document defines the Skilly extended SKILL.md format, explains how it differs from the community standard, and provides a conversion guide for building a marketplace that imports community skills into the Skilly format.

---

## The SKILL.md Ecosystem

The `SKILL.md` format originated with Claude Code and has become an open standard adopted by GitHub Copilot, Cursor, Codex, Windsurf, and other AI coding assistants. Skills are portable across platforms because the core format is universal.

**Canonical references:**
- [Anthropic's SKILL.md specification](https://github.com/anthropics/claude-code/tree/main/plugins/plugin-dev/skills/skill-development)
- [Agent Skills Specification](https://github.com/microsoft/agent-skills)
- [Open Skills Standard](https://github.com/seb1n/awesome-ai-agent-skills)

---

## Format Comparison

| Aspect | Standard Format | Skilly Format |
|--------|----------------|---------------|
| **Complexity** | Minimal (2 required fields) | Extended (15+ fields) |
| **Activation** | Manual only | Manual + auto-detect by app |
| **Progress** | None | Curriculum stages with signal detection |
| **Pointing** | None | UI vocabulary with element descriptions |
| **Compatibility** | Portable across platforms | Skilly runtime only |
| **Versioning** | None | Built-in via `format_version` |

---

## Standard SKILL.md Format

Used by: Claude Code, GitHub Copilot, Cursor, Codex, Windsurf

```yaml
---
name: skill-name          # Required: kebab-case, matches folder name
description: >-            # Required: what it does and when to use
  A clear description of the skill's purpose and trigger phrases.
  Claude uses this for automatic discovery.
license: MIT              # Optional: license identifier
---

# Skill Title

Instructions, workflows, and examples for the AI to follow.
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Kebab-case identifier, must match folder name. Max 64 chars. |
| `description` | string | What the skill does AND when to use it. Used for automatic discovery. Max 1024 chars. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `license` | string | License name or SPDX identifier |
| `allowed-tools` | string[] | Pre-approved tool list (experimental, Claude Code specific) |

### Body Structure

The markdown body contains skill instructions. Common sections:

```markdown
## Overview
Brief description of what this skill does.

## Step 1: ...
Step-by-step instructions.

## Examples
Input/output demonstrations.

## Rules
Constraints and non-negotiable behaviors.
```

### Example: Standard Format

```yaml
---
name: code-review
description: Review code for best practices. Use when asked to review pull requests, audit code quality, or check for bugs.
license: MIT
---

# Code Review

## When to Use
- PR review requests
- Code quality audits
- Bug hunting sessions

## Review Checklist
1. Check for null/undefined handling
2. Verify error handling
3. Review naming conventions
4. Check test coverage
```

---

## Skilly Extended SKILL.md Format

Used by: Skilly runtime (tryskilly.app)

```yaml
---
id: skill-id              # Required: lowercase alphanumeric + hyphens
name: Skill Name          # Required: human-readable name
version: 1.0.0           # Required: semantic version
format_version: "1.0"     # Required: must be "1.0"
min_runtime_version: "1.0.0" # Optional: minimum Skilly version needed
author: Author Name       # Required: skill author
license: MIT              # Required: license identifier
target_app: App Name      # Required: app the skill teaches
bundle_id: com.app.bundle # Required: macOS bundle ID for auto-detection
min_app_version: "4.0"   # Optional: minimum app version
platform: macOS           # Required: target platform
recommended_model: gpt-4o # Optional: recommended AI model
pointing_mode: always     # Optional: cursor pointing behavior
category: creative-tools  # Required: skill category
tags:                    # Optional: search/categorization tags
  - 3d-modeling
  - blender
difficulty: beginner     # Optional: difficulty level
estimated_hours: 8       # Optional: estimated completion time
---

# Skill Title

Skill description for marketplace listing.

## Teaching Instructions

The core teaching content that becomes part of the system prompt.
Written as instructions for the AI companion to follow.

### Your Expertise
Domain-specific knowledge the AI should exhibit.

### Teaching Approach
How to teach effectively — pacing, tone, common mistakes to catch.

## Curriculum

### Stage 1: Stage Name
Stage description and learning goals.

**Goals:**
- Goal item 1
- Goal item 2

**Completion signals:** keyword1, keyword2, keyword3
Keywords that indicate mastery when detected in user speech.

**Next:** Next Stage Name

### Stage 2: Next Stage
...

**Next:** null

## UI Vocabulary

### Element Name
Element description — what it is, where to find it, how to recognize it.

### Another Element
Another description.
```

---

## Field Reference

### Required Fields (Skilly-specific)

#### `id`
- **Type:** string
- **Pattern:** `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase, hyphens only)
- **Description:** Stable skill identifier. Used as the directory name and for progress tracking. Must be unique.
- **Example:** `blender-fundamentals`, `figma-design-tokens`

#### `format_version`
- **Type:** string
- **Allowed values:** `"1.0"`
- **Description:** Declares which Skilly format version this skill uses. Allows forward compatibility — if new required fields are added in future formats, skills can declare a minimum version.

#### `target_app`
- **Type:** string
- **Description:** Human-readable name of the application the skill teaches. Used for auto-detection UI.
- **Example:** `Blender`, `Figma`, `Xcode`

#### `bundle_id`
- **Type:** string
- **Description:** macOS bundle identifier of the target application. Used for automatic skill activation when the user switches to that app.
- **Example:** `org.blenderfoundation.blender`, `com.figma.Desktop`
- **Special values:** `generic.` prefix for skills that don't target a specific app

#### `platform`
- **Type:** string
- **Allowed values:** `macOS`, `windows`, `linux`, `cross-platform`
- **Description:** Target platform for the skill.

#### `category`
- **Type:** string
- **Description:** Primary category for marketplace organization.
- **Example values:** `creative-tools`, `development`, `productivity`, `education`

#### `author`
- **Type:** string
- **Description:** Name or organization that created the skill.

#### `license`
- **Type:** string
- **Description:** License under which the skill is distributed.
- **Example:** `MIT`, `Apache-2.0`, `CC-BY-4.0`

---

### Optional Fields (Skilly-specific)

#### `min_runtime_version`
- **Type:** string (semver)
- **Default:** `"1.0.0"`
- **Description:** Minimum Skilly runtime version required to parse this skill correctly.

#### `min_app_version`
- **Type:** string
- **Description:** Minimum version of the target application required for this skill's instructions to be relevant.

#### `recommended_model`
- **Type:** string
- **Description:** AI model best suited for this skill's interactions.
- **Example:** `gpt-4o`, `claude-sonnet-4-6`

#### `pointing_mode`
- **Type:** enum
- **Allowed values:** `always`, `when-relevant`, `minimal`
- **Default:** `always`
- **Description:** How aggressively the companion should point at UI elements during teaching.
  - `always`: Point at every referenced element
  - `when-relevant`: Point only at elements central to the current topic
  - `minimal`: Rarely or never point

#### `difficulty`
- **Type:** string
- **Allowed values:** `beginner`, `intermediate`, `advanced`
- **Description:** Difficulty level for the skill's content.

#### `estimated_hours`
- **Type:** integer
- **Description:** Estimated time to complete the skill's curriculum.

#### `tags`
- **Type:** string[]
- **Description:** Additional search/categorization keywords beyond the primary category.

---

## Body Sections

### `## Teaching Instructions` (Required)

**Purpose:** Core teaching content that gets injected into the AI companion's system prompt.

**Content:** Written from the AI's perspective as instructions for how to teach. Should include:
- Domain expertise the AI should demonstrate
- Teaching approach and pacing
- Common mistakes to catch
- Tone and communication style

**Rules:**
- Must NOT contain URLs (security: prevents data exfiltration)
- Must NOT contain prompt injection patterns (e.g., "ignore previous instructions")
- Must stay under 4,000 tokens (~16,000 characters)
- Total skill content must stay under 10,000 tokens (~40,000 characters)

### `## Curriculum` (Optional)

**Purpose:** Structured learning progression with automatic advancement detection.

**Structure:** H3 headings for each stage.

```markdown
### Stage 1: Stage Name

Stage description text.

**Goals:**
- Learning goal 1
- Learning goal 2

**Completion signals:** keyword1, keyword2, keyword3

**Prerequisites:** Previous Stage Name

**Next:** Next Stage Name
```

**Fields per stage:**
| Field | Description |
|-------|-------------|
| `Stage N:` heading | Stage number and name |
| Description | Prose explanation of what this stage covers |
| `**Goals:**` | Bulleted list of learning objectives |
| `**Completion signals:**` | Comma-separated keywords that indicate mastery |
| `**Prerequisites:**` | Name of required previous stage (optional) |
| `**Next:**` | Next stage name, or `null` if final stage |

**How advancement works:** The CurriculumEngine watches for completion signal keywords in the user's voice transcript. After detecting 3+ signals for the current stage, it automatically advances to the next stage.

### `## UI Vocabulary` (Optional)

**Purpose:** Named UI elements the AI can reference, enabling cursor pointing.

**Structure:** H3 headings for each vocabulary entry.

```markdown
### Element Name

Description of the element — what it is, where to find it, 
what it does, and when to use it.
```

**Example:**
```markdown
### 3D Viewport

The main view area showing the 3D scene. Located in the center 
of the default Blender layout. Shows objects, grids, and manipulators.
Use "viewport" or "3D view" to refer to this.
```

**How pointing works:** When the AI embeds `[POINT:x,y:label:screenN]` in its response, the overlay system maps the label to a vocabulary entry, captures a screenshot, and animates the cursor to the referenced element.

---

## Conversion Guide (Marketplace Builder Reference)

When importing community skills into Skilly format, use this mapping:

### Field Conversion Table

| Standard Field | Skilly Field | Conversion Notes |
|---------------|---------------|------------------|
| `name` | `name` | Copy as-is |
| `name` | `id` | Derive from `name`: lowercase, spaces→hyphens, strip special chars |
| `description` | `skillDescription` | Copy as preamble to body, or use as marketplace listing |
| `license` | `license` | Copy as-is |
| — | `id` | Create from folder name or `name` |
| — | `version` | Default to `"1.0.0"` for converted skills |
| — | `format_version` | Set to `"1.0"` |
| — | `author` | Set to `"community"` or parse from repo metadata |
| — | `target_app` | Infer from skill name/content, or set to `"General"` |
| — | `bundle_id` | Set to `generic.desktop` or infer from known mappings |
| — | `platform` | Set to `cross-platform` or infer |
| — | `category` | Infer from content keywords |
| — | `pointing_mode` | Default to `always` |
| — | `format_version` | Set to `"1.0"` |
| Body content | `## Teaching Instructions` | Wrap body in this section |

### Auto-Detection Mappings

The parser includes known mappings for common applications:

```swift
let knownAppMappings: [(prefix: String, targetApp: String, bundleId: String)] = [
    ("figma", "Figma", "com.figma.Desktop"),
    ("blender", "Blender", "org.blenderfoundation.blender"),
    ("xcode", "Xcode", "com.apple.dt.Xcode"),
    ("vscode", "Visual Studio Code", "com.microsoft.VSCode")
]
```

For skills whose ID or name starts with these prefixes, `target_app` and `bundle_id` are inferred automatically.

### Unknown Source Skills

For skills that don't declare a target app:

1. Set `target_app: General`
2. Set `bundle_id: generic.desktop`
3. Set `platform: cross-platform`
4. Consider `pointing_mode: minimal` since no specific UI is referenced

---

## Format Version History

### 1.0 (Current)
- Initial Skilly format
- Required frontmatter: `id`, `name`, `version`, `format_version`, `author`, `license`, `target_app`, `bundle_id`, `platform`, `category`
- Optional frontmatter: `min_runtime_version`, `min_app_version`, `recommended_model`, `pointing_mode`, `difficulty`, `estimated_hours`, `tags`
- Body sections: `## Teaching Instructions`, `## Curriculum`, `## UI Vocabulary`
- Curriculum stage format: `### Stage N: Name` with `**Goals:**`, `**Completion signals:**`, `**Prerequisites:**`, `**Next:**`
- UI Vocabulary format: `### Element Name` followed by description paragraphs

---

## Security Notes

Skilly validates skills before loading:

1. **Banned patterns scan:** Rejects skills containing prompt injection attempts (`ignore previous instructions`, `you are no longer`, etc.)
2. **URL detection:** Teaching instructions must not contain HTTP/HTTPS links
3. **Size limits:** Teaching instructions ≤4,000 tokens; total skill ≤10,000 tokens
4. **Completion signal constraints:** Minimum 3 characters per keyword, minimum 1 keyword per stage

---

## Marketplace Integration

For a Skilly marketplace that converts community skills:

1. **Fetch** raw `SKILL.md` from GitHub URLs or marketplace API
2. **Parse** existing frontmatter and body
3. **Convert** to Skilly format using the field mapping table above
4. **Validate** using `SkillValidation.validate()`
5. **Store** in `~/.skilly/skills/{skill-id}/SKILL.md`
6. **Index** for marketplace browsing by `category`, `tags`, `target_app`, `difficulty`

### Raw URL Pattern (GitHub)

```
https://raw.githubusercontent.com/{owner}/{repo}/main/{skill-dir}/SKILL.md
```

### Required Conversions Summary

When converting a standard skill to Skilly format:

```python
def convert_standard_to_skilly(standard_skill, folder_name):
    return {
        "id": derive_id_from(folder_name or standard_skill["name"]),
        "name": standard_skill["name"],
        "version": "1.0.0",
        "format_version": "1.0",
        "author": standard_skill.get("author", "community"),
        "license": standard_skill.get("license", "MIT"),
        "target_app": infer_target_app(folder_name) or "General",
        "bundle_id": infer_bundle_id(folder_name) or "generic.desktop",
        "platform": "cross-platform",
        "category": infer_category(standard_skill.get("description", "")),
        "pointing_mode": "always",
        # Body
        "skillDescription": standard_skill.get("description", ""),
        "teachingInstructions": standard_skill["body"],  # Wrap original body
        "curriculumStages": [],
        "vocabularyEntries": [],
    }
```
