use serde::{Deserialize, Serialize};
use skilly_core_skills::{
    CurriculumStage, PointingMode, SkillDefinition, SkillMetadata, VocabularyEntry,
};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const APP_DIRECTORY_NAME: &str = "Skilly";
pub const SKILL_FILE_NAME: &str = "SKILL.md";
pub const CONFIG_FILE_NAME: &str = "config.json";
pub const DEFAULT_BUNDLED_SKILL_IDS: &[&str] = &[
    "blender-fundamentals",
    "figma-basics",
    "after-effects-basics",
    "davinci-resolve-basics",
    "premiere-pro-basics",
];

const MAX_TEACHING_INSTRUCTION_TOKENS: usize = 4_000;
const MAX_TOTAL_SKILL_TOKENS: usize = 10_000;
const MIN_COMPLETION_SIGNAL_LENGTH: usize = 3;

const BANNED_PHRASES: [(&str, &str); 14] = [
    (
        "ignore previous instructions",
        "Prompt injection: attempts to override base prompt",
    ),
    (
        "ignore all previous",
        "Prompt injection: attempts to override base prompt",
    ),
    (
        "disregard previous",
        "Prompt injection: attempts to override base prompt",
    ),
    (
        "you are no longer",
        "Prompt injection: attempts to redefine assistant identity",
    ),
    (
        "forget everything",
        "Prompt injection: attempts to clear context",
    ),
    (
        "forget all previous",
        "Prompt injection: attempts to clear context",
    ),
    (
        "override your",
        "Prompt injection: attempts to override behavior",
    ),
    (
        "override the system",
        "Prompt injection: attempts to override system prompt",
    ),
    (
        "encode the screenshot",
        "Data exfiltration: attempts to extract screenshot data",
    ),
    (
        "encode the image",
        "Data exfiltration: attempts to extract image data",
    ),
    ("base64", "Data exfiltration: encoding instruction detected"),
    (
        "exfiltrate",
        "Data exfiltration: explicit exfiltration language",
    ),
    (
        "transmit the",
        "Data exfiltration: attempts to transmit data",
    ),
    (
        "send data to",
        "Data exfiltration: attempts to send data externally",
    ),
];

#[derive(Debug)]
pub enum SkillStoreError {
    MissingAppDataDirectory,
    MissingSkillFile(PathBuf),
    UnsupportedSkillFile(String),
    MissingFrontmatter,
    MissingRequiredField(&'static str),
    InvalidSkillId(String),
    InvalidPointingMode(String),
    InvalidYamlStructure(String),
    MissingTeachingInstructions,
    InvalidEncoding(PathBuf),
    InvalidSkillContent(Vec<String>),
    SkillNotInstalled(String),
    Io(io::Error),
    Json(serde_json::Error),
}

impl fmt::Display for SkillStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SkillStoreError::MissingAppDataDirectory => {
                write!(formatter, "APPDATA or LOCALAPPDATA is required")
            }
            SkillStoreError::MissingSkillFile(path) => {
                write!(formatter, "No SKILL.md file found at {}", path.display())
            }
            SkillStoreError::UnsupportedSkillFile(file_name) => write!(
                formatter,
                "Unsupported skill file '{file_name}'. Select a Markdown (.md) file or a folder containing SKILL.md."
            ),
            SkillStoreError::MissingFrontmatter => write!(
                formatter,
                "The SKILL.md file does not contain a YAML frontmatter block delimited by '---'."
            ),
            SkillStoreError::MissingRequiredField(field_name) => {
                write!(formatter, "Required field '{field_name}' is missing from the YAML frontmatter.")
            }
            SkillStoreError::InvalidSkillId(id) => write!(
                formatter,
                "Skill ID '{id}' is invalid. IDs must match '^[a-z0-9]+(-[a-z0-9]+)*$'."
            ),
            SkillStoreError::InvalidPointingMode(mode) => write!(
                formatter,
                "Invalid pointing_mode '{mode}'. Valid values: always, when-relevant, minimal."
            ),
            SkillStoreError::InvalidYamlStructure(detail) => {
                write!(formatter, "Invalid YAML structure: {detail}")
            }
            SkillStoreError::MissingTeachingInstructions => write!(
                formatter,
                "Expected section 'Teaching Instructions' was not found in the SKILL.md file."
            ),
            SkillStoreError::InvalidEncoding(path) => {
                write!(formatter, "Skill content at '{}' is not valid UTF-8", path.display())
            }
            SkillStoreError::InvalidSkillContent(violations) => {
                write!(formatter, "Skill validation failed: {}", violations.join("; "))
            }
            SkillStoreError::SkillNotInstalled(skill_id) => {
                write!(formatter, "Skill '{skill_id}' is not installed")
            }
            SkillStoreError::Io(error) => error.fmt(formatter),
            SkillStoreError::Json(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for SkillStoreError {}

impl From<io::Error> for SkillStoreError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for SkillStoreError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillStoreConfig {
    pub version: u32,
    pub active_skill_id: Option<String>,
    pub analytics_opt_out: bool,
    pub auto_detection_enabled: bool,
    pub has_manually_selected_skill: bool,
}

impl Default for SkillStoreConfig {
    fn default() -> Self {
        Self {
            version: 1,
            active_skill_id: None,
            analytics_opt_out: false,
            auto_detection_enabled: true,
            has_manually_selected_skill: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SkillSourceKind {
    Bundled,
    Imported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillListItem {
    pub id: String,
    pub name: String,
    pub target_app: String,
    pub bundle_id: String,
    pub pointing_mode: PointingMode,
    pub source_kind: SkillSourceKind,
    pub installed_path: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillActivationDto {
    pub active_skill_id: Option<String>,
    pub auto_detection_enabled: bool,
    pub has_manually_selected_skill: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SeedBundledSkillsReport {
    pub seeded_skill_ids: Vec<String>,
    pub skipped_existing_skill_ids: Vec<String>,
    pub missing_source_skill_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillImportResult {
    pub skill: SkillListItem,
    pub replaced_existing: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledSkill {
    pub definition: SkillDefinition,
    pub bundle_id: String,
    pub version: String,
    pub description: String,
    pub source_kind: SkillSourceKind,
    pub installed_path: PathBuf,
}

impl InstalledSkill {
    pub fn list_item(&self, active_skill_id: Option<&str>) -> SkillListItem {
        SkillListItem {
            id: self.definition.metadata.id.clone(),
            name: self.definition.metadata.name.clone(),
            target_app: self.definition.metadata.target_app.clone(),
            bundle_id: self.bundle_id.clone(),
            pointing_mode: self.definition.metadata.pointing_mode,
            source_kind: self.source_kind,
            installed_path: self.installed_path.display().to_string(),
            is_active: active_skill_id == Some(self.definition.metadata.id.as_str()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SkillStore {
    base_dir: PathBuf,
    bundled_skills_root: Option<PathBuf>,
    bundled_skill_ids: BTreeSet<String>,
}

impl SkillStore {
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
            bundled_skills_root: None,
            bundled_skill_ids: DEFAULT_BUNDLED_SKILL_IDS
                .iter()
                .map(|skill_id| (*skill_id).to_owned())
                .collect(),
        }
    }

    pub fn for_windows_app_data() -> Result<Self, SkillStoreError> {
        Ok(Self::new(default_app_data_root()?))
    }

    pub fn with_bundled_skills_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.bundled_skills_root = Some(root.into());
        self
    }

    pub fn with_bundled_skill_ids<I, S>(mut self, bundled_skill_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.bundled_skill_ids = bundled_skill_ids.into_iter().map(Into::into).collect();
        self
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn skills_dir(&self) -> PathBuf {
        self.base_dir.join("skills")
    }

    pub fn progress_dir(&self) -> PathBuf {
        self.base_dir.join("progress")
    }

    pub fn config_file(&self) -> PathBuf {
        self.base_dir.join(CONFIG_FILE_NAME)
    }

    pub fn ensure_directories_exist(&self) -> Result<(), SkillStoreError> {
        fs::create_dir_all(self.skills_dir())?;
        fs::create_dir_all(self.progress_dir())?;
        Ok(())
    }

    pub fn load_config(&self) -> Result<SkillStoreConfig, SkillStoreError> {
        let config_path = self.config_file();
        if !config_path.exists() {
            return Ok(SkillStoreConfig::default());
        }

        let data = fs::read(&config_path)?;
        Ok(serde_json::from_slice(&data)?)
    }

    pub fn save_config(&self, config: &SkillStoreConfig) -> Result<(), SkillStoreError> {
        self.ensure_directories_exist()?;
        let encoded = serde_json::to_vec_pretty(config)?;
        write_atomic(&self.config_file(), &encoded)
    }

    pub fn list_installed_skills(&self) -> Result<Vec<InstalledSkill>, SkillStoreError> {
        let skills_dir = self.skills_dir();
        if !skills_dir.exists() {
            return Ok(Vec::new());
        }

        let active_skill_id = self.load_config()?.active_skill_id;
        let mut installed_skills = Vec::new();

        for entry in fs::read_dir(&skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let skill_file = path.join(SKILL_FILE_NAME);
            if !skill_file.is_file() {
                continue;
            }

            let raw_content = read_utf8_file(&skill_file)?;
            let parsed = ParsedSkill::parse(&raw_content)?;
            validate_parsed_skill(&parsed, &raw_content)?;

            let matches_bundled_source = self
                .bundled_skills_root
                .as_ref()
                .map(|root| {
                    root.join(&parsed.definition.metadata.id)
                        .join(SKILL_FILE_NAME)
                })
                .and_then(|path| read_utf8_file(&path).ok())
                .is_some_and(|bundled| bundled == raw_content);
            let source_kind = if matches_bundled_source {
                SkillSourceKind::Bundled
            } else {
                SkillSourceKind::Imported
            };

            installed_skills.push(InstalledSkill {
                definition: parsed.definition,
                bundle_id: parsed.bundle_id,
                version: parsed.version,
                description: parsed.description,
                source_kind,
                installed_path: path,
            });
        }

        installed_skills.sort_by(|left, right| {
            left.definition
                .metadata
                .name
                .cmp(&right.definition.metadata.name)
        });

        let _ = active_skill_id;
        Ok(installed_skills)
    }

    pub fn list_skill_items(&self) -> Result<Vec<SkillListItem>, SkillStoreError> {
        let active_skill_id = self.load_config()?.active_skill_id;
        Ok(self
            .list_installed_skills()?
            .into_iter()
            .map(|skill| skill.list_item(active_skill_id.as_deref()))
            .collect())
    }

    pub fn active_skill(&self) -> Result<Option<InstalledSkill>, SkillStoreError> {
        let Some(active_id) = self.load_config()?.active_skill_id else {
            return Ok(None);
        };
        Ok(self
            .list_installed_skills()?
            .into_iter()
            .find(|skill| skill.definition.metadata.id == active_id))
    }

    pub fn activate_skill(
        &self,
        skill_id: &str,
        has_manually_selected_skill: bool,
    ) -> Result<SkillActivationDto, SkillStoreError> {
        let installed = self.list_installed_skills()?;
        if !installed
            .iter()
            .any(|skill| skill.definition.metadata.id == skill_id)
        {
            return Err(SkillStoreError::SkillNotInstalled(skill_id.to_owned()));
        }

        let mut config = self.load_config()?;
        config.active_skill_id = Some(skill_id.to_owned());
        config.has_manually_selected_skill = has_manually_selected_skill;
        self.save_config(&config)?;
        Ok(config.into())
    }

    pub fn deactivate_skill(&self) -> Result<SkillActivationDto, SkillStoreError> {
        let mut config = self.load_config()?;
        config.active_skill_id = None;
        config.has_manually_selected_skill = false;
        self.save_config(&config)?;
        Ok(config.into())
    }

    pub fn import_skill(&self, source_path: &Path) -> Result<SkillImportResult, SkillStoreError> {
        self.ensure_directories_exist()?;

        let source_kind = if source_path.is_dir() {
            SourceImportKind::Directory
        } else if source_path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
        {
            SourceImportKind::StandaloneMarkdown
        } else {
            return Err(SkillStoreError::UnsupportedSkillFile(
                source_path
                    .file_name()
                    .and_then(|file_name| file_name.to_str())
                    .unwrap_or_default()
                    .to_owned(),
            ));
        };

        let skill_file = match source_kind {
            SourceImportKind::Directory => source_path.join(SKILL_FILE_NAME),
            SourceImportKind::StandaloneMarkdown => source_path.to_path_buf(),
        };

        if !skill_file.is_file() {
            return Err(SkillStoreError::MissingSkillFile(source_path.to_path_buf()));
        }

        let raw_content = read_utf8_file(&skill_file)?;
        let parsed = ParsedSkill::parse(&raw_content)?;
        validate_parsed_skill(&parsed, &raw_content)?;
        if self
            .bundled_skill_ids
            .contains(parsed.definition.metadata.id.as_str())
        {
            return Err(SkillStoreError::InvalidSkillId(format!(
                "{} is reserved for bundled content",
                parsed.definition.metadata.id
            )));
        }

        let destination_dir = self
            .skills_dir()
            .join(parsed.definition.metadata.id.as_str());
        let replaced_existing = destination_dir.exists();
        if replaced_existing {
            fs::remove_dir_all(&destination_dir)?;
        }

        match source_kind {
            SourceImportKind::Directory => {
                copy_directory_recursive(source_path, &destination_dir)?;
            }
            SourceImportKind::StandaloneMarkdown => {
                fs::create_dir_all(&destination_dir)?;
                write_atomic(
                    &destination_dir.join(SKILL_FILE_NAME),
                    raw_content.as_bytes(),
                )?;
            }
        }

        let active_skill = self.activate_skill(parsed.definition.metadata.id.as_str(), true)?;
        let source_kind = SkillSourceKind::Imported;

        let installed = InstalledSkill {
            definition: parsed.definition,
            bundle_id: parsed.bundle_id,
            version: parsed.version,
            description: parsed.description,
            source_kind,
            installed_path: destination_dir,
        };

        Ok(SkillImportResult {
            skill: installed.list_item(active_skill.active_skill_id.as_deref()),
            replaced_existing,
        })
    }

    pub fn seed_bundled_skills(&self) -> Result<SeedBundledSkillsReport, SkillStoreError> {
        self.ensure_directories_exist()?;
        let mut report = SeedBundledSkillsReport::default();
        let Some(bundled_skills_root) = &self.bundled_skills_root else {
            return Ok(report);
        };

        for skill_id in &self.bundled_skill_ids {
            let source_dir = bundled_skills_root.join(skill_id);
            let source_skill = source_dir.join(SKILL_FILE_NAME);
            if !source_skill.is_file() {
                report.missing_source_skill_ids.push(skill_id.clone());
                continue;
            }

            let destination_dir = self.skills_dir().join(skill_id);
            if destination_dir.exists() {
                report.skipped_existing_skill_ids.push(skill_id.clone());
                continue;
            }

            copy_directory_recursive(&source_dir, &destination_dir)?;
            report.seeded_skill_ids.push(skill_id.clone());
        }

        report.seeded_skill_ids.sort();
        report.skipped_existing_skill_ids.sort();
        report.missing_source_skill_ids.sort();
        Ok(report)
    }
}

impl From<SkillStoreConfig> for SkillActivationDto {
    fn from(config: SkillStoreConfig) -> Self {
        Self {
            active_skill_id: config.active_skill_id,
            auto_detection_enabled: config.auto_detection_enabled,
            has_manually_selected_skill: config.has_manually_selected_skill,
        }
    }
}

fn default_app_data_root() -> Result<PathBuf, SkillStoreError> {
    resolve_app_data_root(env_os_path("APPDATA"), env_os_path("LOCALAPPDATA"))
        .map(|root| root.join(APP_DIRECTORY_NAME))
}

fn env_os_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn resolve_app_data_root(
    appdata: Option<PathBuf>,
    localappdata: Option<PathBuf>,
) -> Result<PathBuf, SkillStoreError> {
    appdata
        .or(localappdata)
        .ok_or(SkillStoreError::MissingAppDataDirectory)
}

#[derive(Debug, Clone)]
struct ParsedSkill {
    definition: SkillDefinition,
    bundle_id: String,
    version: String,
    description: String,
    curriculum_completion_signals: Vec<(String, Vec<String>)>,
}

impl ParsedSkill {
    fn parse(raw_content: &str) -> Result<Self, SkillStoreError> {
        let (yaml_content, markdown_body) = extract_frontmatter(raw_content)?;
        let key_value_map = build_key_value_map(&yaml_content)?;
        let metadata = build_metadata(&key_value_map)?;
        let sections = split_by_h2_headings(&markdown_body);

        let raw_preamble = sections
            .get("_preamble")
            .map(String::as_str)
            .unwrap_or_default();
        let description = {
            let trimmed_preamble = raw_preamble.trim();
            if !trimmed_preamble.is_empty() {
                trimmed_preamble.to_owned()
            } else {
                key_value_map
                    .get("description")
                    .or_else(|| key_value_map.get("summary"))
                    .cloned()
                    .unwrap_or_default()
                    .trim()
                    .to_owned()
            }
        };

        let teaching_instructions = if let Some(section) = sections.get("Teaching Instructions") {
            section.trim().to_owned()
        } else {
            let fallback = strip_top_level_h1_titles(&markdown_body).trim().to_owned();
            if !fallback.is_empty() {
                fallback
            } else if !description.is_empty() {
                description.clone()
            } else {
                return Err(SkillStoreError::MissingTeachingInstructions);
            }
        };

        let mut curriculum_stages = Vec::new();
        let mut curriculum_completion_signals = Vec::new();
        if let Some(curriculum_section) = sections.get("Curriculum") {
            for (index, block) in split_by_h3_headings(curriculum_section).iter().enumerate() {
                if let Ok(parsed_stage) = parse_curriculum_stage(block, index) {
                    curriculum_completion_signals.push((
                        parsed_stage.core.name.clone(),
                        parsed_stage.completion_signals.clone(),
                    ));
                    curriculum_stages.push(parsed_stage.core);
                }
            }
        }

        let mut vocabulary_entries = Vec::new();
        if let Some(vocabulary_section) = sections.get("UI Vocabulary") {
            for block in split_by_h3_headings(vocabulary_section) {
                if let Ok(entry) = parse_vocabulary_entry(&block) {
                    vocabulary_entries.push(entry);
                }
            }
        }

        Ok(Self {
            bundle_id: metadata.bundle_id.clone(),
            version: metadata.version.clone(),
            description,
            curriculum_completion_signals,
            definition: SkillDefinition {
                metadata: metadata.core,
                teaching_instructions,
                curriculum_stages,
                vocabulary_entries,
            },
        })
    }
}

#[derive(Debug, Clone)]
struct ParsedMetadata {
    core: SkillMetadata,
    bundle_id: String,
    version: String,
}

fn extract_frontmatter(raw_content: &str) -> Result<(String, String), SkillStoreError> {
    let lines: Vec<&str> = raw_content.lines().collect();
    let Some(opening_index) = lines.iter().position(|line| line.trim() == "---") else {
        return Err(SkillStoreError::MissingFrontmatter);
    };

    let Some(closing_offset) = lines[(opening_index + 1)..]
        .iter()
        .position(|line| line.trim() == "---")
    else {
        return Err(SkillStoreError::MissingFrontmatter);
    };
    let closing_index = opening_index + 1 + closing_offset;

    let yaml = lines[(opening_index + 1)..closing_index].join("\n");
    let body = lines[(closing_index + 1)..].join("\n");
    Ok((yaml, body))
}

fn build_key_value_map(frontmatter: &str) -> Result<BTreeMap<String, String>, SkillStoreError> {
    let mut key_value_map = BTreeMap::new();
    let mut current_array_key: Option<String> = None;
    let mut current_array_items: Vec<String> = Vec::new();

    let flush_array = |key_value_map: &mut BTreeMap<String, String>,
                       current_array_key: &mut Option<String>,
                       current_array_items: &mut Vec<String>| {
        if let Some(key) = current_array_key.take() {
            key_value_map.insert(key, current_array_items.join(","));
            current_array_items.clear();
        }
    };

    for line in frontmatter.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("- ") {
            if current_array_key.is_none() {
                return Err(SkillStoreError::InvalidYamlStructure(format!(
                    "Array item found without a parent key: '{line}'"
                )));
            }
            current_array_items.push(normalize_scalar_value(value));
            continue;
        }

        flush_array(
            &mut key_value_map,
            &mut current_array_key,
            &mut current_array_items,
        );

        let Some((raw_key, raw_value)) = line.split_once(':') else {
            return Err(SkillStoreError::InvalidYamlStructure(format!(
                "Unexpected line without a colon: '{line}'"
            )));
        };

        let key = raw_key.trim().to_owned();
        let value = raw_value.trim();
        if value.is_empty() {
            current_array_key = Some(key);
        } else {
            key_value_map.insert(key, normalize_scalar_value(value));
        }
    }

    flush_array(
        &mut key_value_map,
        &mut current_array_key,
        &mut current_array_items,
    );

    Ok(key_value_map)
}

fn normalize_scalar_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let quoted = (bytes[0] == b'"' && bytes[trimmed.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[trimmed.len() - 1] == b'\'');
        if quoted {
            return trimmed[1..trimmed.len() - 1].trim().to_owned();
        }
    }
    trimmed.to_owned()
}

fn build_metadata(
    key_value_map: &BTreeMap<String, String>,
) -> Result<ParsedMetadata, SkillStoreError> {
    let parsed_name = first_non_empty_value(key_value_map, &["name", "title"])
        .ok_or(SkillStoreError::MissingRequiredField("name"))?;
    let raw_id = first_non_empty_value(key_value_map, &["id", "slug"]);
    let parsed_id = normalized_skill_id(raw_id.unwrap_or(parsed_name));
    if parsed_id.is_empty() || !is_valid_skill_id(&parsed_id) {
        return Err(SkillStoreError::InvalidSkillId(
            raw_id.unwrap_or(parsed_name).to_owned(),
        ));
    }

    let inferred = infer_target_app_and_bundle_id(parsed_name, parsed_id.as_str());
    let target_app = first_non_empty_value(key_value_map, &["target_app", "target", "app"])
        .map(ToOwned::to_owned)
        .or_else(|| inferred.as_ref().map(|value| value.0.clone()))
        .unwrap_or_else(|| "General".to_owned());
    let bundle_id = first_non_empty_value(
        key_value_map,
        &["bundle_id", "bundleid", "target_bundle_id"],
    )
    .map(ToOwned::to_owned)
    .or_else(|| inferred.as_ref().map(|value| value.1.clone()))
    .unwrap_or_else(|| format!("generic.{parsed_id}"));
    let version = first_non_empty_value(key_value_map, &["version"])
        .unwrap_or("1.0.0")
        .to_owned();

    let pointing_mode = match key_value_map.get("pointing_mode") {
        Some(mode) if !mode.is_empty() => {
            let normalized = mode.to_lowercase().replace('_', "-");
            match normalized.as_str() {
                "always" => PointingMode::Always,
                "when-relevant" => PointingMode::WhenRelevant,
                "minimal" => PointingMode::Minimal,
                _ => return Err(SkillStoreError::InvalidPointingMode(mode.clone())),
            }
        }
        _ => PointingMode::Always,
    };

    Ok(ParsedMetadata {
        bundle_id,
        version: version.clone(),
        core: SkillMetadata {
            id: parsed_id,
            name: parsed_name.to_owned(),
            target_app,
            pointing_mode,
        },
    })
}

fn first_non_empty_value<'a>(
    key_value_map: &'a BTreeMap<String, String>,
    keys: &[&str],
) -> Option<&'a str> {
    keys.iter().find_map(|key| {
        key_value_map
            .get(*key)
            .map(String::as_str)
            .filter(|value| !value.is_empty())
    })
}

fn normalized_skill_id(raw_value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_hyphen = false;

    for character in raw_value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            normalized.push(character);
            previous_was_hyphen = false;
        } else if !previous_was_hyphen && !normalized.is_empty() {
            normalized.push('-');
            previous_was_hyphen = true;
        }
    }

    normalized.trim_matches('-').to_owned()
}

fn is_valid_skill_id(skill_id: &str) -> bool {
    let mut previous_was_hyphen = false;
    for (index, character) in skill_id.chars().enumerate() {
        if character == '-' {
            if index == 0 || previous_was_hyphen {
                return false;
            }
            previous_was_hyphen = true;
        } else if character.is_ascii_lowercase() || character.is_ascii_digit() {
            previous_was_hyphen = false;
        } else {
            return false;
        }
    }
    !skill_id.is_empty() && !skill_id.ends_with('-')
}

fn infer_target_app_and_bundle_id(name: &str, skill_id: &str) -> Option<(String, String)> {
    let lower_name = name.to_lowercase();
    let lower_id = skill_id.to_lowercase();
    let known = [
        ("figma", "Figma", "com.figma.Desktop"),
        ("blender", "Blender", "org.blenderfoundation.blender"),
        ("xcode", "Xcode", "com.apple.dt.Xcode"),
        ("vscode", "Visual Studio Code", "com.microsoft.VSCode"),
    ];

    known.iter().find_map(|(prefix, target_app, bundle_id)| {
        let matches_prefix = lower_id == *prefix
            || lower_id.starts_with(&format!("{prefix}-"))
            || lower_name == *prefix
            || lower_name.starts_with(&format!("{prefix}-"));
        if matches_prefix {
            Some(((*target_app).to_owned(), (*bundle_id).to_owned()))
        } else {
            None
        }
    })
}

fn split_by_h2_headings(content: &str) -> BTreeMap<String, String> {
    let mut sections = BTreeMap::new();
    let mut current_key = "_preamble".to_owned();
    let mut current_lines = Vec::new();

    for line in content.lines() {
        if line.starts_with("## ") && !line.starts_with("### ") {
            sections.insert(current_key, current_lines.join("\n"));
            current_key = line[3..].trim().to_owned();
            current_lines.clear();
            continue;
        }

        if current_key == "_preamble" && line.starts_with("# ") && !line.starts_with("## ") {
            continue;
        }
        current_lines.push(line.to_owned());
    }

    sections.insert(current_key, current_lines.join("\n"));
    sections
}

fn split_by_h3_headings(content: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current_lines = Vec::new();
    let mut in_block = false;

    for line in content.lines() {
        if line.starts_with("### ") {
            if in_block {
                blocks.push(current_lines.join("\n"));
                current_lines.clear();
            }
            in_block = true;
            current_lines.push(line.to_owned());
        } else if in_block {
            current_lines.push(line.to_owned());
        }
    }

    if in_block && !current_lines.is_empty() {
        blocks.push(current_lines.join("\n"));
    }

    blocks
}

fn strip_top_level_h1_titles(content: &str) -> String {
    content
        .lines()
        .filter(|line| !(line.starts_with("# ") && !line.starts_with("## ")))
        .collect::<Vec<_>>()
        .join("\n")
}

#[derive(Debug)]
struct ParsedCurriculumStage {
    core: CurriculumStage,
    completion_signals: Vec<String>,
}

fn parse_curriculum_stage(
    markdown_block: &str,
    stage_index: usize,
) -> Result<ParsedCurriculumStage, SkillStoreError> {
    let lines: Vec<&str> = markdown_block.lines().collect();
    let heading_line = lines
        .iter()
        .copied()
        .find(|line| line.starts_with("### "))
        .ok_or_else(|| {
            SkillStoreError::InvalidYamlStructure(
                "CurriculumStage block has no '### Stage N: Name' heading.".to_owned(),
            )
        })?;

    let heading_text = heading_line[4..].trim();
    let (_stage_number, stage_name) = if let Some(prefix) = heading_text.strip_prefix("Stage ") {
        if let Some((number, name)) = prefix.split_once(": ") {
            (
                number.parse::<usize>().unwrap_or(stage_index + 1),
                name.trim().to_owned(),
            )
        } else {
            (stage_index + 1, heading_text.to_owned())
        }
    } else {
        (stage_index + 1, heading_text.to_owned())
    };

    let heading_index = lines
        .iter()
        .position(|line| line.starts_with("### "))
        .unwrap_or(0);
    let body_lines = &lines[(heading_index + 1)..];

    let goals = extract_list_items("Goals", body_lines);
    let completion_signals = extract_inline_field("Completion signals", body_lines)
        .map(|value| {
            value
                .split(',')
                .map(|signal| signal.trim().to_owned())
                .filter(|signal| !signal.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let next_stage_name = extract_inline_field("Next", body_lines).and_then(|value| {
        if value.eq_ignore_ascii_case("null") || value.is_empty() {
            None
        } else {
            Some(value)
        }
    });

    Ok(ParsedCurriculumStage {
        completion_signals,
        core: CurriculumStage {
            id: normalized_skill_id(stage_name.as_str()),
            name: stage_name,
            goals,
            next_stage_name,
        },
    })
}

fn extract_list_items(field_name: &str, body_lines: &[&str]) -> Vec<String> {
    let marker = format!("**{field_name}:**");
    let mut collecting = false;
    let mut items = Vec::new();

    for line in body_lines {
        let trimmed = line.trim();
        if trimmed == marker || trimmed.starts_with(marker.as_str()) {
            collecting = true;
            continue;
        }

        if !collecting {
            continue;
        }

        if let Some(item) = trimmed.strip_prefix("- ") {
            items.push(item.trim().to_owned());
        } else if trimmed.is_empty() {
            continue;
        } else {
            break;
        }
    }

    items
}

fn extract_inline_field(field_name: &str, body_lines: &[&str]) -> Option<String> {
    let marker = format!("**{field_name}:**");
    body_lines.iter().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix(marker.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn parse_vocabulary_entry(markdown_block: &str) -> Result<VocabularyEntry, SkillStoreError> {
    let lines: Vec<&str> = markdown_block.lines().collect();
    let heading_line = lines
        .iter()
        .copied()
        .find(|line| line.starts_with("### "))
        .ok_or_else(|| {
            SkillStoreError::InvalidYamlStructure(
                "VocabularyEntry block has no '### Element Name' heading.".to_owned(),
            )
        })?;
    let name = heading_line[4..].trim().to_owned();
    let heading_index = lines
        .iter()
        .position(|line| line.starts_with("### "))
        .unwrap_or(0);
    let body_lines = &lines[(heading_index + 1)..];
    let description = build_paragraph_text(body_lines.iter().copied());
    Ok(VocabularyEntry { name, description })
}

fn build_paragraph_text<'a>(lines: impl Iterator<Item = &'a str>) -> String {
    let mut paragraphs = Vec::new();
    let mut current = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join(" "));
                current.clear();
            }
        } else {
            current.push(trimmed.to_owned());
        }
    }

    if !current.is_empty() {
        paragraphs.push(current.join(" "));
    }

    paragraphs.join("\n\n").trim().to_owned()
}

fn validate_parsed_skill(
    parsed_skill: &ParsedSkill,
    raw_content: &str,
) -> Result<(), SkillStoreError> {
    let mut violations = Vec::new();
    let definition = &parsed_skill.definition;

    violations.extend(validate_text(
        "Teaching instructions",
        &definition.teaching_instructions,
    ));
    violations.extend(validate_size(
        definition.teaching_instructions.chars().count() / 4,
        MAX_TEACHING_INSTRUCTION_TOKENS,
        "Teaching instructions exceed the 4000-token limit",
    ));
    violations.extend(validate_size(
        raw_content.chars().count() / 4,
        MAX_TOTAL_SKILL_TOKENS,
        "Total skill content exceeds the 10000-token limit",
    ));

    violations.extend(prefix_violations(
        "Skill name",
        validate_text("", &definition.metadata.name),
    ));
    violations.extend(prefix_violations(
        "Skill description",
        validate_text("", &parsed_skill.description),
    ));

    for (stage_name, completion_signals) in &parsed_skill.curriculum_completion_signals {
        let escaped_stage_name = stage_name.replace('\n', " ");
        if let Some(stage) = definition
            .curriculum_stages
            .iter()
            .find(|stage| stage.name == *stage_name)
        {
            for goal in &stage.goals {
                violations.extend(prefix_violations(
                    &format!("Curriculum stage '{escaped_stage_name}' goal"),
                    validate_text("", goal),
                ));
            }
        }

        for signal in completion_signals {
            violations.extend(prefix_violations(
                &format!("Curriculum stage '{escaped_stage_name}' completion signal"),
                validate_text("", signal),
            ));
            if signal.chars().count() < MIN_COMPLETION_SIGNAL_LENGTH {
                violations.push(format!(
                    "Curriculum stage '{escaped_stage_name}' completion signal '{signal}' is too short (minimum {MIN_COMPLETION_SIGNAL_LENGTH} characters). Generic signals trigger false positives in normal conversation."
                ));
            }
        }
    }

    for vocabulary_entry in &definition.vocabulary_entries {
        let escaped_name = vocabulary_entry.name.replace('\n', " ");
        violations.extend(prefix_violations(
            &format!("Vocabulary entry '{escaped_name}' name"),
            validate_text("", &vocabulary_entry.name),
        ));
        if vocabulary_entry.name.to_lowercase().contains("[point:") {
            violations.push(format!(
                "Vocabulary entry '{escaped_name}' name: contains [POINT: tag pattern, which is not allowed"
            ));
        }
        violations.extend(prefix_violations(
            &format!("Vocabulary entry '{escaped_name}' description"),
            validate_text("", &vocabulary_entry.description),
        ));
    }

    if violations.is_empty() {
        Ok(())
    } else {
        Err(SkillStoreError::InvalidSkillContent(violations))
    }
}

fn validate_size(count: usize, max_allowed: usize, message: &str) -> Vec<String> {
    if count > max_allowed {
        vec![format!(
            "{message} (approximately {count} tokens estimated)"
        )]
    } else {
        Vec::new()
    }
}

fn validate_text(_label: &str, text: &str) -> Vec<String> {
    let mut violations = Vec::new();
    let lower = text.to_lowercase();
    let normalized = normalize_for_detection(text).to_lowercase();

    for (phrase, reason) in BANNED_PHRASES {
        if lower.contains(phrase) {
            violations.push(reason.to_owned());
        } else if normalized.contains(phrase) {
            violations.push(format!("{reason} (obfuscated)"));
        }
    }

    if lower.contains("http://") || lower.contains("https://") {
        violations.push(
            "URL detected in teaching instructions: external URLs are not permitted".to_owned(),
        );
    }

    violations
}

fn prefix_violations(prefix: &str, violations: Vec<String>) -> Vec<String> {
    violations
        .into_iter()
        .map(|violation| {
            if prefix.is_empty() {
                violation
            } else {
                format!("{prefix}: {violation}")
            }
        })
        .collect()
}

fn normalize_for_detection(text: &str) -> String {
    text.chars()
        .filter_map(|character| match character {
            '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}' | '\u{2060}'
            | '\u{180E}' => None,
            '\u{0430}' | '\u{FF41}' => Some('a'),
            '\u{0435}' | '\u{FF45}' => Some('e'),
            '\u{043E}' | '\u{FF4F}' => Some('o'),
            '\u{0440}' | '\u{FF50}' => Some('p'),
            '\u{0441}' | '\u{FF43}' => Some('c'),
            '\u{0443}' | '\u{FF59}' => Some('y'),
            '\u{0445}' | '\u{FF58}' => Some('x'),
            '\u{FF42}' => Some('b'),
            '\u{FF44}' => Some('d'),
            '\u{FF46}' => Some('f'),
            '\u{FF47}' => Some('g'),
            '\u{FF48}' => Some('h'),
            '\u{FF49}' => Some('i'),
            '\u{FF4A}' => Some('j'),
            '\u{FF4B}' => Some('k'),
            '\u{FF4C}' => Some('l'),
            '\u{FF4D}' => Some('m'),
            '\u{FF4E}' => Some('n'),
            '\u{FF51}' => Some('q'),
            '\u{FF52}' => Some('r'),
            '\u{FF53}' => Some('s'),
            '\u{FF54}' => Some('t'),
            '\u{FF55}' => Some('u'),
            '\u{FF56}' => Some('v'),
            '\u{FF57}' => Some('w'),
            '\u{FF5A}' => Some('z'),
            other => Some(other),
        })
        .collect()
}

fn read_utf8_file(path: &Path) -> Result<String, SkillStoreError> {
    let bytes = fs::read(path)?;
    String::from_utf8(bytes).map_err(|_| SkillStoreError::InvalidEncoding(path.to_path_buf()))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), SkillStoreError> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "missing parent directory"))?;
    fs::create_dir_all(parent)?;

    let temp_path = parent.join(format!(
        ".{}.tmp-{}-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skilly"),
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));

    fs::write(&temp_path, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(&temp_path, path)?;
    Ok(())
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), SkillStoreError> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory_recursive(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum SourceImportKind {
    Directory,
    StandaloneMarkdown,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_directory_skill_and_lists_it_as_active() {
        let sandbox = TestSandbox::new("directory-import");
        let source_dir = sandbox.fixture_dir("valid-skill");
        let store = SkillStore::new(sandbox.store_root());

        let import = store
            .import_skill(&source_dir)
            .expect("import should succeed");
        assert_eq!(import.skill.id, "excel-modeling-basics");
        assert!(import.skill.is_active);
        assert_eq!(import.skill.source_kind, SkillSourceKind::Imported);

        let listed = store.list_skill_items().expect("list should succeed");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].bundle_id, "com.microsoft.Excel");
    }

    #[test]
    fn imports_standalone_markdown_by_normalizing_to_skill_directory() {
        let sandbox = TestSandbox::new("standalone-import");
        let source_file = sandbox.fixture_dir("valid-skill").join(SKILL_FILE_NAME);
        let store = SkillStore::new(sandbox.store_root());

        let import = store
            .import_skill(&source_file)
            .expect("import should succeed");
        let installed_dir = store.skills_dir().join("excel-modeling-basics");
        assert!(installed_dir.join(SKILL_FILE_NAME).is_file());
        assert_eq!(
            import.skill.installed_path,
            installed_dir.display().to_string()
        );
    }

    #[test]
    fn rejects_prompt_injection_and_obfuscated_urls() {
        let sandbox = TestSandbox::new("invalid-skill");
        let store = SkillStore::new(sandbox.store_root());
        let invalid_skill_dir = sandbox.fixture_dir("unsafe-skill");

        let error = store
            .import_skill(&invalid_skill_dir)
            .expect_err("unsafe skill should be rejected");
        match error {
            SkillStoreError::InvalidSkillContent(violations) => {
                assert!(violations
                    .iter()
                    .any(|violation| violation.contains("Prompt injection")));
                assert!(violations
                    .iter()
                    .any(|violation| violation.contains("URL detected")));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn seeds_bundled_skills_idempotently_without_overwriting_existing_installs() {
        let sandbox = TestSandbox::new("bundled-seed");
        let bundled_root = sandbox.bundled_root();
        let existing_skill = bundled_root.join("existing-bundled");
        fs::create_dir_all(&existing_skill).expect("create existing fixture skill");
        fs::write(
            existing_skill.join(SKILL_FILE_NAME),
            fixture_text(
                "existing-bundled",
                "Existing Bundled",
                "org.example.Existing",
            ),
        )
        .expect("write existing fixture skill");

        let store = SkillStore::new(sandbox.store_root())
            .with_bundled_skills_root(&bundled_root)
            .with_bundled_skill_ids(["bundled-figma", "existing-bundled", "missing-bundled"]);

        let destination_existing = store.skills_dir().join("existing-bundled");
        fs::create_dir_all(&destination_existing).expect("create destination existing skill");
        fs::write(
            destination_existing.join(SKILL_FILE_NAME),
            fixture_text("existing-bundled", "Do Not Replace", "org.example.Existing"),
        )
        .expect("write destination existing skill");

        let bundled_skill_dir = bundled_root.join("bundled-figma");
        fs::create_dir_all(bundled_skill_dir.join("assets")).expect("create bundled asset dir");
        fs::write(
            bundled_skill_dir.join(SKILL_FILE_NAME),
            fixture_text("bundled-figma", "Bundled Figma", "com.figma.Desktop"),
        )
        .expect("write bundled skill");
        fs::write(bundled_skill_dir.join("assets").join("tip.txt"), "asset").expect("write asset");

        let report = store.seed_bundled_skills().expect("seed should succeed");
        assert_eq!(report.seeded_skill_ids, vec!["bundled-figma".to_owned()]);
        assert_eq!(
            report.skipped_existing_skill_ids,
            vec!["existing-bundled".to_owned()]
        );
        assert_eq!(
            report.missing_source_skill_ids,
            vec!["missing-bundled".to_owned()]
        );
        assert!(store
            .skills_dir()
            .join("bundled-figma")
            .join("assets")
            .join("tip.txt")
            .is_file());

        let preserved = fs::read_to_string(destination_existing.join(SKILL_FILE_NAME))
            .expect("read existing installed skill");
        assert!(preserved.contains("Do Not Replace"));
    }

    #[test]
    fn saves_and_loads_config_round_trip() {
        let sandbox = TestSandbox::new("config-round-trip");
        let store = SkillStore::new(sandbox.store_root());
        let config = SkillStoreConfig {
            version: 2,
            active_skill_id: Some("excel-modeling-basics".to_owned()),
            analytics_opt_out: true,
            auto_detection_enabled: false,
            has_manually_selected_skill: true,
        };

        store.save_config(&config).expect("save config");
        let loaded = store.load_config().expect("load config");
        assert_eq!(loaded, config);
    }

    #[test]
    fn resolves_app_data_root_with_appdata_priority() {
        let appdata = PathBuf::from("C:/Users/test/AppData/Roaming");
        let localappdata = PathBuf::from("C:/Users/test/AppData/Local");
        let resolved = resolve_app_data_root(Some(appdata.clone()), Some(localappdata))
            .expect("path should resolve");
        assert_eq!(resolved, appdata);
    }

    #[test]
    fn resolve_app_data_root_falls_back_to_localappdata() {
        let localappdata = PathBuf::from("C:/Users/test/AppData/Local");
        let resolved = resolve_app_data_root(None, Some(localappdata.clone()))
            .expect("fallback should resolve");
        assert_eq!(resolved, localappdata);
    }

    struct TestSandbox {
        root: PathBuf,
    }

    impl TestSandbox {
        fn new(label: &str) -> Self {
            let root = std::env::temp_dir().join(format!(
                "skilly-windows-skills-{label}-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ));
            fs::create_dir_all(&root).expect("create sandbox");
            Self { root }
        }

        fn store_root(&self) -> PathBuf {
            self.root.join("appdata")
        }

        fn bundled_root(&self) -> PathBuf {
            let path = self.root.join("bundled");
            fs::create_dir_all(&path).expect("create bundled root");
            path
        }

        fn fixture_dir(&self, name: &str) -> PathBuf {
            let source = Path::new(file!())
                .parent()
                .expect("skills.rs parent")
                .parent()
                .expect("windows-shell-gui root")
                .join("tests")
                .join("fixtures")
                .join("skills")
                .join(name);
            let destination = self.root.join("fixtures").join(name);
            copy_directory_recursive(&source, &destination).expect("copy fixture");
            destination
        }
    }

    impl Drop for TestSandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn fixture_text(id: &str, name: &str, bundle_id: &str) -> String {
        format!(
            r#"---
id: {id}
name: {name}
version: 1.0.0
format_version: "1.0"
target_app: Example
bundle_id: {bundle_id}
pointing_mode: always
---

# {name}

## Teaching Instructions

Teach the user carefully and point at the exact controls they need.
"#
        )
    }
}
