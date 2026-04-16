//! Shared skill prompt composition logic.

use serde::{Deserialize, Serialize};

pub const VOCABULARY_BUDGET_TOKENS: usize = 700;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PointingMode {
    Always,
    WhenRelevant,
    Minimal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillMetadata {
    pub id: String,
    pub name: String,
    pub target_app: String,
    pub pointing_mode: PointingMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurriculumStage {
    pub id: String,
    pub name: String,
    pub goals: Vec<String>,
    pub next_stage_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VocabularyEntry {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub metadata: SkillMetadata,
    pub teaching_instructions: String,
    pub curriculum_stages: Vec<CurriculumStage>,
    pub vocabulary_entries: Vec<VocabularyEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillProgress {
    pub current_stage_id: String,
    pub completed_stage_ids: Vec<String>,
}

pub fn compose_prompt(base_prompt: &str, skill: &SkillDefinition, progress: &SkillProgress) -> String {
    let mut sections = Vec::new();
    sections.push(base_prompt.to_string());
    sections.push(format!(
        "--- ACTIVE SKILL: {} ---\n\n{}",
        escape_prompt_delimiters(&skill.metadata.name),
        escape_prompt_delimiters(&skill.teaching_instructions)
    ));

    let curriculum_context = compose_curriculum_context(skill, progress);
    if !curriculum_context.is_empty() {
        sections.push(curriculum_context);
    }

    let vocabulary_context = compose_vocabulary_context(skill, progress);
    if !vocabulary_context.is_empty() {
        sections.push(vocabulary_context);
    }

    sections.push(pointing_mode_instruction(
        skill.metadata.pointing_mode,
        &skill.metadata.target_app,
    ));

    sections.join("\n\n")
}

pub fn estimate_token_count(text: &str) -> usize {
    std::cmp::max(1, text.chars().count() / 4)
}

pub fn trim_vocabulary(
    entries: &[VocabularyEntry],
    current_stage: &CurriculumStage,
    budget_tokens: usize,
) -> Vec<VocabularyEntry> {
    fn format_entries(entries: &[VocabularyEntry]) -> String {
        entries
            .iter()
            .map(|entry| format!("{}: {}", entry.name, entry.description))
            .collect::<Vec<_>>()
            .join("\n")
    }

    let all_entries = entries.to_vec();
    if estimate_token_count(&format_entries(&all_entries)) <= budget_tokens {
        return all_entries;
    }

    let stage_goal_text = current_stage.goals.join(" ").to_lowercase();
    let stage_relevant_entries: Vec<VocabularyEntry> = entries
        .iter()
        .filter(|entry| stage_goal_text.contains(&entry.name.to_lowercase()))
        .cloned()
        .collect();

    if estimate_token_count(&format_entries(&stage_relevant_entries)) <= budget_tokens {
        return stage_relevant_entries;
    }

    let top_five_entries: Vec<VocabularyEntry> = stage_relevant_entries.into_iter().take(5).collect();
    if estimate_token_count(&format_entries(&top_five_entries)) <= budget_tokens {
        return top_five_entries;
    }

    Vec::new()
}

fn compose_curriculum_context(skill: &SkillDefinition, progress: &SkillProgress) -> String {
    let Some(current_stage) = skill
        .curriculum_stages
        .iter()
        .find(|stage| stage.id == progress.current_stage_id)
    else {
        return String::new();
    };

    let mut lines = Vec::new();
    lines.push("--- LEARNING PROGRESS ---".to_string());
    lines.push(format!(
        "Current stage: {}",
        escape_prompt_delimiters(&current_stage.name)
    ));
    lines.push("Goals for this stage:".to_string());
    for stage_goal in &current_stage.goals {
        lines.push(format!("- {}", escape_prompt_delimiters(stage_goal)));
    }

    if !progress.completed_stage_ids.is_empty() {
        let completed_stage_names: Vec<String> = progress
            .completed_stage_ids
            .iter()
            .filter_map(|completed_stage_id| {
                skill.curriculum_stages
                    .iter()
                    .find(|stage| &stage.id == completed_stage_id)
                    .map(|stage| escape_prompt_delimiters(&stage.name))
            })
            .collect();
        if !completed_stage_names.is_empty() {
            lines.push(format!(
                "Completed stages: {}",
                completed_stage_names.join(", ")
            ));
        }
    }

    if let Some(next_stage_name) = &current_stage.next_stage_name {
        lines.push(format!(
            "Next up: {}",
            escape_prompt_delimiters(next_stage_name)
        ));
    }

    lines.join("\n")
}

fn compose_vocabulary_context(skill: &SkillDefinition, progress: &SkillProgress) -> String {
    if skill.vocabulary_entries.is_empty() {
        return String::new();
    }

    let Some(current_stage) = skill
        .curriculum_stages
        .iter()
        .find(|stage| stage.id == progress.current_stage_id)
    else {
        let all_entries = skill
            .vocabulary_entries
            .iter()
            .map(|entry| {
                format!(
                    "{}: {}",
                    escape_prompt_delimiters(&entry.name),
                    escape_prompt_delimiters(&entry.description)
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        return format!("--- UI ELEMENT REFERENCE ---\n{all_entries}");
    };

    let trimmed_entries = trim_vocabulary(&skill.vocabulary_entries, current_stage, VOCABULARY_BUDGET_TOKENS);
    if trimmed_entries.is_empty() {
        return String::new();
    }

    let formatted_entries = trimmed_entries
        .iter()
        .map(|entry| {
            format!(
                "{}: {}",
                escape_prompt_delimiters(&entry.name),
                escape_prompt_delimiters(&entry.description)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("--- UI ELEMENT REFERENCE ---\n{formatted_entries}")
}

fn pointing_mode_instruction(pointing_mode: PointingMode, target_app: &str) -> String {
    match pointing_mode {
        PointingMode::Always => format!(
            "When helping with {target_app}, aggressively point at UI elements using the vocabulary above. The user is learning and needs visual guidance. Err on the side of pointing rather than not pointing."
        ),
        PointingMode::WhenRelevant => format!(
            "When helping with {target_app}, point at UI elements when it would genuinely help the user find something they're looking for. Don't point at things that are obvious or that the user is already looking at."
        ),
        PointingMode::Minimal => format!(
            "When helping with {target_app}, only point at UI elements when the user explicitly asks where something is or is clearly lost. Default to verbal descriptions unless pointing adds significant clarity."
        ),
    }
}

fn escape_prompt_delimiters(text: &str) -> String {
    text.replace("---", "—")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[derive(Debug, Deserialize)]
    struct PromptFixture {
        base_prompt: String,
        skill: SkillDefinition,
        progress: SkillProgress,
        expected_prompt: String,
    }

    #[test]
    fn compose_prompt_matches_fixture() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("compose_prompt_fixture.json");
        let fixture_json = fs::read_to_string(fixture_path).expect("fixture should exist");
        let fixture: PromptFixture = serde_json::from_str(&fixture_json).expect("fixture json should parse");

        let composed_prompt = compose_prompt(&fixture.base_prompt, &fixture.skill, &fixture.progress);
        assert_eq!(composed_prompt, fixture.expected_prompt);
    }
}
