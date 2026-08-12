use serde::{Deserialize, Serialize};
use std::fmt;

pub const MAX_OVERLAY_TEXT_LEN: usize = 280;
pub const MAX_POINTER_LABEL_LEN: usize = 96;
pub const MAX_WAVEFORM_SAMPLES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ScreenRelativePoint {
    pub x: f32,
    pub y: f32,
}

impl ScreenRelativePoint {
    pub fn new(x: f32, y: f32) -> Self {
        Self {
            x: clamp_unit(x),
            y: clamp_unit(y),
        }
    }

    pub fn parse(raw: &str) -> Result<Self, ScreenRelativePointParseError> {
        let components = extract_numeric_components(raw)?;
        if components.len() != 2 {
            return Err(ScreenRelativePointParseError::InvalidArity {
                found: components.len(),
            });
        }

        let x = parse_coordinate_component(&components[0])?;
        let y = parse_coordinate_component(&components[1])?;
        Ok(Self::new(x, y))
    }

    pub fn map_to_screen(&self, bounds: ScreenBounds) -> ScreenPoint {
        bounds.map_relative_point(*self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScreenRelativePointParseError {
    Empty,
    InvalidArity { found: usize },
    InvalidComponent(String),
}

impl fmt::Display for ScreenRelativePointParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScreenRelativePointParseError::Empty => {
                write!(formatter, "expected two screen-relative coordinates")
            }
            ScreenRelativePointParseError::InvalidArity { found } => {
                write!(formatter, "expected 2 coordinates, found {found}")
            }
            ScreenRelativePointParseError::InvalidComponent(component) => {
                write!(formatter, "invalid coordinate component '{component}'")
            }
        }
    }
}

impl std::error::Error for ScreenRelativePointParseError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScreenBounds {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
}

impl ScreenBounds {
    pub fn new(origin_x: i32, origin_y: i32, width: u32, height: u32) -> Self {
        Self {
            origin_x,
            origin_y,
            width: width.max(1),
            height: height.max(1),
        }
    }

    pub fn map_relative_point(&self, relative: ScreenRelativePoint) -> ScreenPoint {
        let clamped = ScreenRelativePoint::new(relative.x, relative.y);
        let x_offset = ((self.width.saturating_sub(1)) as f32 * clamped.x).round() as i32;
        let y_offset = ((self.height.saturating_sub(1)) as f32 * clamped.y).round() as i32;
        let unclamped = ScreenPoint {
            x: self.origin_x.saturating_add(x_offset),
            y: self.origin_y.saturating_add(y_offset),
        };
        self.clamp_point(unclamped)
    }

    pub fn clamp_point(&self, point: ScreenPoint) -> ScreenPoint {
        let min_x = self.origin_x;
        let min_y = self.origin_y;
        let max_x = self
            .origin_x
            .saturating_add(self.width.saturating_sub(1) as i32);
        let max_y = self
            .origin_y
            .saturating_add(self.height.saturating_sub(1) as i32);

        ScreenPoint {
            x: point.x.clamp(min_x, max_x),
            y: point.y.clamp(min_y, max_y),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScreenPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlayPointerTarget {
    pub label: Option<String>,
    pub screen_id: Option<u32>,
    pub relative_point: ScreenRelativePoint,
}

impl OverlayPointerTarget {
    pub fn new(
        label: Option<impl Into<String>>,
        screen_id: Option<u32>,
        relative_point: ScreenRelativePoint,
    ) -> Self {
        Self {
            label: label.map(|value| sanitize_text(&value.into(), MAX_POINTER_LABEL_LEN)),
            screen_id,
            relative_point,
        }
    }

    pub fn from_raw_coordinate_string(
        raw_coordinates: &str,
        label: Option<impl Into<String>>,
        screen_id: Option<u32>,
    ) -> Result<Self, ScreenRelativePointParseError> {
        Ok(Self::new(
            label,
            screen_id,
            ScreenRelativePoint::parse(raw_coordinates)?,
        ))
    }

    pub fn map_to_screen(&self, bounds: ScreenBounds) -> MappedOverlayPointer {
        MappedOverlayPointer {
            label: self.label.clone(),
            screen_id: self.screen_id,
            relative_point: self.relative_point.clone(),
            screen_point: self.relative_point.map_to_screen(bounds),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MappedOverlayPointer {
    pub label: Option<String>,
    pub screen_id: Option<u32>,
    pub relative_point: ScreenRelativePoint,
    pub screen_point: ScreenPoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptSpeaker {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TranscriptBubbleModel {
    pub speaker: TranscriptSpeaker,
    pub text: String,
}

impl TranscriptBubbleModel {
    pub fn new(speaker: TranscriptSpeaker, text: impl Into<String>) -> Self {
        Self {
            speaker,
            text: sanitize_text(&text.into(), MAX_OVERLAY_TEXT_LEN),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WaveformModel {
    pub label: String,
    pub samples: Vec<u8>,
}

impl WaveformModel {
    pub fn new(label: impl Into<String>, samples: impl IntoIterator<Item = u8>) -> Self {
        Self {
            label: sanitize_text(&label.into(), MAX_OVERLAY_TEXT_LEN),
            samples: normalize_waveform_samples(samples),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoadingModel {
    pub label: String,
    pub detail: Option<String>,
    pub progress_percent: Option<u8>,
}

impl LoadingModel {
    pub fn new(
        label: impl Into<String>,
        detail: Option<impl Into<String>>,
        progress_percent: Option<u8>,
    ) -> Self {
        Self {
            label: sanitize_text(&label.into(), MAX_OVERLAY_TEXT_LEN),
            detail: detail.map(|value| sanitize_text(&value.into(), MAX_OVERLAY_TEXT_LEN)),
            progress_percent: progress_percent.map(|value| value.min(100)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpeakingModel {
    pub text: String,
    pub progress_percent: u8,
    pub samples: Vec<u8>,
}

impl SpeakingModel {
    pub fn new(
        text: impl Into<String>,
        progress_percent: u8,
        samples: impl IntoIterator<Item = u8>,
    ) -> Self {
        Self {
            text: sanitize_text(&text.into(), MAX_OVERLAY_TEXT_LEN),
            progress_percent: progress_percent.min(100),
            samples: normalize_waveform_samples(samples),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OverlayPresentation {
    TranscriptBubble(TranscriptBubbleModel),
    Waveform(WaveformModel),
    Loading(LoadingModel),
    Speaking(SpeakingModel),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShowOverlayCommand {
    pub generation: u64,
    pub pointer: Option<OverlayPointerTarget>,
    pub presentation: OverlayPresentation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PointerPatch {
    Keep,
    Clear,
    Set(OverlayPointerTarget),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PresentationPatch {
    Keep,
    Clear,
    Replace(OverlayPresentation),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateOverlayCommand {
    pub generation: u64,
    pub pointer: PointerPatch,
    pub presentation: PresentationPatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HideOverlayCommand {
    pub generation: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OverlayCommandStatus {
    Applied,
    IgnoredStaleGeneration,
    IgnoredFutureGeneration,
    IgnoredNoActiveGeneration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OverlayCommandReceipt {
    pub status: OverlayCommandStatus,
    pub active_generation: Option<u64>,
    pub generation_cursor: Option<u64>,
    pub visible: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlayState {
    pub active_generation: Option<u64>,
    pub generation_cursor: Option<u64>,
    pub visible: bool,
    pub pointer: Option<OverlayPointerTarget>,
    pub presentation: Option<OverlayPresentation>,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            active_generation: None,
            generation_cursor: None,
            visible: false,
            pointer: None,
            presentation: None,
        }
    }
}

impl OverlayState {
    pub fn show(&mut self, command: ShowOverlayCommand) -> OverlayCommandReceipt {
        if self
            .generation_cursor
            .is_some_and(|cursor| command.generation < cursor)
        {
            return self.receipt(OverlayCommandStatus::IgnoredStaleGeneration);
        }

        self.generation_cursor = Some(command.generation);
        self.active_generation = Some(command.generation);
        self.visible = true;
        self.pointer = command.pointer;
        self.presentation = Some(command.presentation);
        self.receipt(OverlayCommandStatus::Applied)
    }

    pub fn update(&mut self, command: UpdateOverlayCommand) -> OverlayCommandReceipt {
        let Some(active_generation) = self.active_generation else {
            if self
                .generation_cursor
                .is_some_and(|cursor| command.generation < cursor)
            {
                return self.receipt(OverlayCommandStatus::IgnoredStaleGeneration);
            }

            return self.receipt(OverlayCommandStatus::IgnoredNoActiveGeneration);
        };

        if command.generation < active_generation {
            return self.receipt(OverlayCommandStatus::IgnoredStaleGeneration);
        }

        if command.generation > active_generation {
            return self.receipt(OverlayCommandStatus::IgnoredFutureGeneration);
        }

        match command.pointer {
            PointerPatch::Keep => {}
            PointerPatch::Clear => self.pointer = None,
            PointerPatch::Set(pointer) => self.pointer = Some(pointer),
        }

        match command.presentation {
            PresentationPatch::Keep => {}
            PresentationPatch::Clear => self.presentation = None,
            PresentationPatch::Replace(presentation) => self.presentation = Some(presentation),
        }

        self.visible = self.pointer.is_some() || self.presentation.is_some();
        if !self.visible {
            self.active_generation = None;
        }

        self.receipt(OverlayCommandStatus::Applied)
    }

    pub fn hide(&mut self, command: HideOverlayCommand) -> OverlayCommandReceipt {
        let Some(active_generation) = self.active_generation else {
            if self
                .generation_cursor
                .is_some_and(|cursor| command.generation < cursor)
            {
                return self.receipt(OverlayCommandStatus::IgnoredStaleGeneration);
            }

            return self.receipt(OverlayCommandStatus::IgnoredNoActiveGeneration);
        };

        if command.generation < active_generation {
            return self.receipt(OverlayCommandStatus::IgnoredStaleGeneration);
        }

        if command.generation > active_generation {
            return self.receipt(OverlayCommandStatus::IgnoredFutureGeneration);
        }

        self.visible = false;
        self.pointer = None;
        self.presentation = None;
        self.active_generation = None;
        self.generation_cursor = Some(command.generation);
        self.receipt(OverlayCommandStatus::Applied)
    }

    pub fn mapped_pointer(&self, bounds: ScreenBounds) -> Option<MappedOverlayPointer> {
        self.pointer
            .as_ref()
            .map(|pointer| pointer.map_to_screen(bounds))
    }

    fn receipt(&self, status: OverlayCommandStatus) -> OverlayCommandReceipt {
        OverlayCommandReceipt {
            status,
            active_generation: self.active_generation,
            generation_cursor: self.generation_cursor,
            visible: self.visible,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum NativeOverlayAvailability {
    Available,
    Unavailable { reason: String },
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowsNativeOverlayAdapter {
    availability: NativeOverlayAvailability,
}

#[cfg(target_os = "windows")]
impl Default for WindowsNativeOverlayAdapter {
    fn default() -> Self {
        Self {
            availability: NativeOverlayAvailability::Unavailable {
                reason: "Native overlay window has not been initialized yet.".to_string(),
            },
        }
    }
}

#[cfg(target_os = "windows")]
impl WindowsNativeOverlayAdapter {
    pub fn availability(&self) -> &NativeOverlayAvailability {
        &self.availability
    }

    pub fn render(&self, _state: &OverlayState) -> Result<(), String> {
        match &self.availability {
            NativeOverlayAvailability::Available => Ok(()),
            NativeOverlayAvailability::Unavailable { reason } => Err(reason.clone()),
        }
    }
}

fn sanitize_text(value: &str, max_len: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    trimmed.chars().take(max_len).collect()
}

fn normalize_waveform_samples(samples: impl IntoIterator<Item = u8>) -> Vec<u8> {
    samples
        .into_iter()
        .take(MAX_WAVEFORM_SAMPLES)
        .map(|sample| sample.min(100))
        .collect()
}

fn clamp_unit(value: f32) -> f32 {
    if value.is_nan() {
        0.0
    } else {
        value.clamp(0.0, 1.0)
    }
}

fn extract_numeric_components(raw: &str) -> Result<Vec<String>, ScreenRelativePointParseError> {
    let mut components = Vec::new();
    let mut current = String::new();

    for character in raw.chars() {
        if character.is_ascii_digit() || matches!(character, '.' | '-' | '+' | '%' | 'e' | 'E') {
            current.push(character);
        } else if !current.is_empty() {
            components.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        components.push(current);
    }

    if components.is_empty() {
        return Err(ScreenRelativePointParseError::Empty);
    }

    Ok(components)
}

fn parse_coordinate_component(raw_component: &str) -> Result<f32, ScreenRelativePointParseError> {
    if let Some(stripped) = raw_component.strip_suffix('%') {
        let value = stripped.parse::<f32>().map_err(|_| {
            ScreenRelativePointParseError::InvalidComponent(raw_component.to_string())
        })?;
        return Ok(value / 100.0);
    }

    let parsed = raw_component
        .parse::<f32>()
        .map_err(|_| ScreenRelativePointParseError::InvalidComponent(raw_component.to_string()))?;

    if parsed.abs() > 1.0 {
        Ok(parsed / 100.0)
    } else {
        Ok(parsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fractional_and_percent_coordinates() {
        let fractional = ScreenRelativePoint::parse("0.25, 0.75").unwrap();
        assert_eq!(fractional, ScreenRelativePoint::new(0.25, 0.75));

        let percent = ScreenRelativePoint::parse("25%, 75%").unwrap();
        assert_eq!(percent, ScreenRelativePoint::new(0.25, 0.75));

        let integer_percent = ScreenRelativePoint::parse("25 75").unwrap();
        assert_eq!(integer_percent, ScreenRelativePoint::new(0.25, 0.75));
    }

    #[test]
    fn map_relative_point_clamps_to_screen_bounds() {
        let bounds = ScreenBounds::new(100, 200, 400, 300);
        let point = ScreenRelativePoint::new(1.4, -0.5);
        let mapped = point.map_to_screen(bounds);
        assert_eq!(mapped, ScreenPoint { x: 499, y: 200 });

        let clamped = bounds.clamp_point(ScreenPoint { x: 900, y: 50 });
        assert_eq!(clamped, ScreenPoint { x: 499, y: 200 });
    }

    #[test]
    fn stale_generation_cannot_overwrite_current_overlay() {
        let mut state = OverlayState::default();

        let first = state.show(ShowOverlayCommand {
            generation: 7,
            pointer: Some(
                OverlayPointerTarget::from_raw_coordinate_string(
                    "0.5,0.5",
                    Some("viewport"),
                    Some(1),
                )
                .unwrap(),
            ),
            presentation: OverlayPresentation::Loading(LoadingModel::new(
                "Thinking",
                Some("Reading the screen"),
                None,
            )),
        });
        assert_eq!(first.status, OverlayCommandStatus::Applied);
        assert_eq!(state.active_generation, Some(7));

        let stale = state.update(UpdateOverlayCommand {
            generation: 6,
            pointer: PointerPatch::Clear,
            presentation: PresentationPatch::Clear,
        });
        assert_eq!(stale.status, OverlayCommandStatus::IgnoredStaleGeneration);
        assert!(state.visible);
        assert!(state.pointer.is_some());
        assert!(state.presentation.is_some());
    }

    #[test]
    fn hide_clears_visible_state_and_preserves_generation_cursor() {
        let mut state = OverlayState::default();
        state.show(ShowOverlayCommand {
            generation: 9,
            pointer: None,
            presentation: OverlayPresentation::TranscriptBubble(TranscriptBubbleModel::new(
                TranscriptSpeaker::Assistant,
                "Click the modifier tab.",
            )),
        });

        let receipt = state.hide(HideOverlayCommand { generation: 9 });
        assert_eq!(receipt.status, OverlayCommandStatus::Applied);
        assert_eq!(state.active_generation, None);
        assert_eq!(state.generation_cursor, Some(9));
        assert!(!state.visible);
        assert!(state.presentation.is_none());
    }

    #[test]
    fn speaking_and_waveform_models_are_sanitized() {
        let waveform = WaveformModel::new(
            " Listening ",
            [0, 20, 101, 255]
                .into_iter()
                .chain(std::iter::repeat(80).take(MAX_WAVEFORM_SAMPLES)),
        );
        assert_eq!(waveform.label, "Listening");
        assert_eq!(waveform.samples.len(), MAX_WAVEFORM_SAMPLES);
        assert_eq!(waveform.samples[2], 100);

        let speaking = SpeakingModel::new("  Hello world  ", 180, [90, 101, 12]);
        assert_eq!(speaking.text, "Hello world");
        assert_eq!(speaking.progress_percent, 100);
        assert_eq!(speaking.samples, vec![90, 100, 12]);
    }

    #[test]
    fn clearing_last_presentation_hides_overlay() {
        let mut state = OverlayState::default();
        state.show(ShowOverlayCommand {
            generation: 3,
            pointer: None,
            presentation: OverlayPresentation::Waveform(WaveformModel::new(
                "Listening",
                [10, 20, 30],
            )),
        });

        let receipt = state.update(UpdateOverlayCommand {
            generation: 3,
            pointer: PointerPatch::Keep,
            presentation: PresentationPatch::Clear,
        });

        assert_eq!(receipt.status, OverlayCommandStatus::Applied);
        assert!(!state.visible);
        assert_eq!(state.active_generation, None);
        assert!(state.presentation.is_none());
    }
}
