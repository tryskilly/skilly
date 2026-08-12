#[path = "audio_format.rs"]
mod audio_format;

use self::audio_format::SourceSampleFormat;
use std::collections::VecDeque;
use std::fmt::{Display, Formatter};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex, OnceLock,
};
#[cfg(target_os = "windows")]
use std::time::Duration;

#[cfg(target_os = "windows")]
use windows::core::HRESULT;
#[cfg(target_os = "windows")]
use windows::Win32::Media::Audio::{
    eCommunications, eRender, IAudioClient, IAudioRenderClient, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

const INPUT_SAMPLE_RATE: u32 = 24_000;
const INPUT_CHANNELS: u16 = 1;
const INPUT_BITS_PER_SAMPLE: u16 = 16;
const MAX_QUEUE_BYTES: usize = 32 * 1024 * 1024;
const POLL_INTERVAL_MS: u64 = 8;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AudioPlaybackStatus {
    pub state: &'static str,
    pub queued_bytes: usize,
    pub rendered_bytes: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct QueuedChunk {
    input_bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct OutputMixFormat {
    sample_rate: u32,
    channels: u16,
    sample_format: SourceSampleFormat,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AudioPlaybackError {
    UnsupportedPlatform(&'static str),
    EmptyInput,
    MisalignedInput,
    InvalidSampleRate,
    InvalidChannelCount,
    QueueFull { attempted: usize, available: usize },
    UnsupportedOutputFormat,
    Os(String),
}

impl Display for AudioPlaybackError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioPlaybackError::UnsupportedPlatform(message) => formatter.write_str(message),
            AudioPlaybackError::EmptyInput => formatter.write_str("audio output chunk is empty"),
            AudioPlaybackError::MisalignedInput => formatter.write_str(
                "audio output chunk must be PCM16 mono 24k aligned to 16-bit samples",
            ),
            AudioPlaybackError::InvalidSampleRate => {
                formatter.write_str("audio output sample rate is invalid")
            }
            AudioPlaybackError::InvalidChannelCount => {
                formatter.write_str("audio output channel count is invalid")
            }
            AudioPlaybackError::QueueFull { attempted, available } => write!(
                formatter,
                "audio output queue is full; attempted {attempted} bytes with {available} bytes remaining"
            ),
            AudioPlaybackError::UnsupportedOutputFormat => {
                formatter.write_str("the default render device mix format is unsupported")
            }
            AudioPlaybackError::Os(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for AudioPlaybackError {}

static PLAYBACK_RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static QUEUED_BYTES: AtomicU64 = AtomicU64::new(0);
static RENDERED_BYTES: AtomicU64 = AtomicU64::new(0);
static PLAYBACK_QUEUE: OnceLock<Mutex<VecDeque<QueuedChunk>>> = OnceLock::new();
static PLAYBACK_STATUS: OnceLock<Mutex<AudioPlaybackStatus>> = OnceLock::new();

fn playback_queue() -> &'static Mutex<VecDeque<QueuedChunk>> {
    PLAYBACK_QUEUE.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn playback_status() -> &'static Mutex<AudioPlaybackStatus> {
    PLAYBACK_STATUS.get_or_init(|| Mutex::new(AudioPlaybackStatus::default()))
}

pub(crate) fn current_status() -> AudioPlaybackStatus {
    let mut snapshot = playback_status()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    snapshot.queued_bytes = QUEUED_BYTES.load(Ordering::Relaxed) as usize;
    snapshot.rendered_bytes = RENDERED_BYTES.load(Ordering::Relaxed);
    snapshot
}

pub(crate) fn clear() {
    STOP_REQUESTED.store(true, Ordering::Release);
    if let Ok(mut queue) = playback_queue().lock() {
        queue.clear();
    }
    QUEUED_BYTES.store(0, Ordering::Release);
    if let Ok(mut status) = playback_status().lock() {
        status.state = if PLAYBACK_RUNNING.load(Ordering::Acquire) {
            "stopping"
        } else {
            "idle"
        };
        status.queued_bytes = 0;
    }
}

pub(crate) fn stop() {
    clear();
}

pub(crate) fn enqueue_pcm16_mono_24k(input_bytes: &[u8]) -> Result<(), AudioPlaybackError> {
    validate_input_chunk(input_bytes)?;

    let available_bytes =
        MAX_QUEUE_BYTES.saturating_sub(QUEUED_BYTES.load(Ordering::Acquire) as usize);
    if input_bytes.len() > available_bytes {
        return Err(AudioPlaybackError::QueueFull {
            attempted: input_bytes.len(),
            available: available_bytes,
        });
    }

    {
        let mut queue = playback_queue()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        queue.push_back(QueuedChunk {
            input_bytes: input_bytes.to_vec(),
        });
    }

    QUEUED_BYTES.fetch_add(input_bytes.len() as u64, Ordering::AcqRel);
    {
        let mut status = playback_status()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        status.state = if PLAYBACK_RUNNING.load(Ordering::Acquire) {
            "queued"
        } else {
            "starting"
        };
        status.queued_bytes = QUEUED_BYTES.load(Ordering::Relaxed) as usize;
        status.error = None;
    }

    ensure_playback_thread();
    Ok(())
}

fn validate_input_chunk(input_bytes: &[u8]) -> Result<(), AudioPlaybackError> {
    if input_bytes.is_empty() {
        return Err(AudioPlaybackError::EmptyInput);
    }
    if input_bytes.len() % 2 != 0 {
        return Err(AudioPlaybackError::MisalignedInput);
    }
    Ok(())
}

fn ensure_playback_thread() {
    if PLAYBACK_RUNNING.swap(true, Ordering::AcqRel) {
        return;
    }
    STOP_REQUESTED.store(false, Ordering::Release);

    std::thread::spawn(|| {
        if let Err(error) = playback_loop() {
            if let Ok(mut status) = playback_status().lock() {
                status.state = "error";
                status.error = Some(error.to_string());
            }
        }
        PLAYBACK_RUNNING.store(false, Ordering::Release);
        STOP_REQUESTED.store(false, Ordering::Release);
        if let Ok(mut status) = playback_status().lock() {
            if status.state != "error" {
                status.state = "idle";
                status.error = None;
            }
            status.queued_bytes = QUEUED_BYTES.load(Ordering::Relaxed) as usize;
            status.rendered_bytes = RENDERED_BYTES.load(Ordering::Relaxed);
        }
    });
}

fn playback_loop() -> Result<(), AudioPlaybackError> {
    #[cfg(not(target_os = "windows"))]
    {
        Err(AudioPlaybackError::UnsupportedPlatform(
            "WASAPI playback is only available on Windows",
        ))
    }

    #[cfg(target_os = "windows")]
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;

        let playback_result = (|| -> Result<(), AudioPlaybackError> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eCommunications)
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;

            let format_pointer = audio_client
                .GetMixFormat()
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            let wave_format = *format_pointer;
            let mix_format = mix_format_from_wave_format(&wave_format)
                .ok_or(AudioPlaybackError::UnsupportedOutputFormat)?;

            audio_client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    0,
                    10_000_000,
                    0,
                    format_pointer,
                    None,
                )
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            CoTaskMemFree(Some(format_pointer.cast()));

            let render_client: IAudioRenderClient = audio_client
                .GetService()
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            let buffer_frame_count = audio_client
                .GetBufferSize()
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            let bytes_per_frame = bytes_per_output_frame(mix_format);

            {
                let mut status = playback_status()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                status.state = "playing";
                status.sample_rate = mix_format.sample_rate;
                status.channels = mix_format.channels;
                status.bits_per_sample = match mix_format.sample_format {
                    SourceSampleFormat::Pcm16 => 16,
                    SourceSampleFormat::Float32 => 32,
                };
                status.error = None;
            }

            audio_client
                .Start()
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;

            let mut current_output = Vec::<u8>::new();
            let mut current_offset = 0usize;

            loop {
                if STOP_REQUESTED.load(Ordering::Acquire) {
                    break;
                }

                if current_offset >= current_output.len() {
                    current_output.clear();
                    current_offset = 0;
                    if let Some(chunk) = pop_queued_chunk() {
                        current_output =
                            convert_pcm16_mono_24k_to_mix(&chunk.input_bytes, mix_format)?;
                    } else if QUEUED_BYTES.load(Ordering::Acquire) == 0 {
                        break;
                    }
                }

                let current_padding = audio_client
                    .GetCurrentPadding()
                    .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
                let writable_frames = buffer_frame_count.saturating_sub(current_padding);
                if writable_frames == 0 {
                    std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
                    continue;
                }

                if current_output.is_empty() {
                    std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
                    continue;
                }

                let remaining_frames = (current_output.len() - current_offset) / bytes_per_frame;
                let frames_to_write = writable_frames.min(remaining_frames as u32);
                if frames_to_write == 0 {
                    std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
                    continue;
                }

                let buffer_ptr = render_client
                    .GetBuffer(frames_to_write)
                    .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
                let bytes_to_write = frames_to_write as usize * bytes_per_frame;
                let output_slice = std::slice::from_raw_parts_mut(buffer_ptr, bytes_to_write);
                output_slice.copy_from_slice(
                    &current_output[current_offset..current_offset + bytes_to_write],
                );
                render_client
                    .ReleaseBuffer(frames_to_write, 0)
                    .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;

                current_offset += bytes_to_write;
                RENDERED_BYTES.fetch_add(bytes_to_write as u64, Ordering::AcqRel);
                if let Ok(mut status) = playback_status().lock() {
                    status.state = if QUEUED_BYTES.load(Ordering::Acquire) > 0 {
                        "playing"
                    } else {
                        "draining"
                    };
                    status.rendered_bytes = RENDERED_BYTES.load(Ordering::Relaxed);
                }
            }

            audio_client
                .Stop()
                .map_err(|error| AudioPlaybackError::Os(error.to_string()))?;
            Ok(())
        })();

        CoUninitialize();
        playback_result
    }
}

fn pop_queued_chunk() -> Option<QueuedChunk> {
    let mut queue = playback_queue()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let chunk = queue.pop_front()?;
    QUEUED_BYTES.fetch_sub(chunk.input_bytes.len() as u64, Ordering::AcqRel);
    if let Ok(mut status) = playback_status().lock() {
        status.queued_bytes = QUEUED_BYTES.load(Ordering::Relaxed) as usize;
    }
    Some(chunk)
}

fn bytes_per_output_frame(format: OutputMixFormat) -> usize {
    let bytes_per_channel = match format.sample_format {
        SourceSampleFormat::Pcm16 => 2,
        SourceSampleFormat::Float32 => 4,
    };
    usize::from(format.channels) * bytes_per_channel
}

#[cfg(target_os = "windows")]
fn mix_format_from_wave_format(
    wave_format: &windows::Win32::Media::Audio::WAVEFORMATEX,
) -> Option<OutputMixFormat> {
    let sample_format = match wave_format.wBitsPerSample {
        16 => SourceSampleFormat::Pcm16,
        32 => SourceSampleFormat::Float32,
        _ => return None,
    };

    if wave_format.nSamplesPerSec == 0 || wave_format.nChannels == 0 {
        return None;
    }

    Some(OutputMixFormat {
        sample_rate: wave_format.nSamplesPerSec,
        channels: wave_format.nChannels,
        sample_format,
    })
}

fn convert_pcm16_mono_24k_to_mix(
    input_bytes: &[u8],
    output_format: OutputMixFormat,
) -> Result<Vec<u8>, AudioPlaybackError> {
    validate_input_chunk(input_bytes)?;
    if output_format.sample_rate == 0 {
        return Err(AudioPlaybackError::InvalidSampleRate);
    }
    if output_format.channels == 0 {
        return Err(AudioPlaybackError::InvalidChannelCount);
    }

    let mono_samples = input_bytes
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / i16::MAX as f32)
        .collect::<Vec<_>>();
    let output_frames = resampled_frame_count(mono_samples.len(), output_format.sample_rate);
    let mut output = Vec::with_capacity(output_frames * bytes_per_output_frame(output_format));

    for output_index in 0..output_frames {
        let sample = resample_mono_frame(&mono_samples, output_index, output_format.sample_rate);
        for _ in 0..output_format.channels {
            match output_format.sample_format {
                SourceSampleFormat::Pcm16 => {
                    output.extend_from_slice(&normalized_sample_to_i16(sample).to_le_bytes());
                }
                SourceSampleFormat::Float32 => {
                    output.extend_from_slice(&sample.clamp(-1.0, 1.0).to_le_bytes());
                }
            }
        }
    }

    Ok(output)
}

fn resampled_frame_count(source_frames: usize, target_sample_rate: u32) -> usize {
    let rounded = ((source_frames as u128 * target_sample_rate as u128)
        + (INPUT_SAMPLE_RATE as u128 / 2))
        / INPUT_SAMPLE_RATE as u128;
    rounded.max(1).min(usize::MAX as u128) as usize
}

fn resample_mono_frame(mono_samples: &[f32], target_index: usize, target_sample_rate: u32) -> f32 {
    if mono_samples.len() == 1 || target_sample_rate == INPUT_SAMPLE_RATE {
        return mono_samples[target_index.min(mono_samples.len() - 1)];
    }

    let source_position =
        (target_index as f64 * INPUT_SAMPLE_RATE as f64) / target_sample_rate as f64;
    let left_index = source_position.floor() as usize;
    let right_index = (left_index + 1).min(mono_samples.len() - 1);
    let fraction = (source_position - left_index as f64) as f32;
    let left = mono_samples[left_index.min(mono_samples.len() - 1)];
    let right = mono_samples[right_index];
    left + ((right - left) * fraction)
}

fn normalized_sample_to_i16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    if clamped >= 1.0 {
        return i16::MAX;
    }
    if clamped <= -1.0 {
        return i16::MIN;
    }
    (clamped * i16::MAX as f32).round() as i16
}

#[cfg(test)]
mod tests {
    use super::{
        convert_pcm16_mono_24k_to_mix, validate_input_chunk, AudioPlaybackError, OutputMixFormat,
        SourceSampleFormat,
    };

    #[test]
    fn rejects_misaligned_input() {
        let error = validate_input_chunk(&[0x01]).expect_err("misaligned input must fail");
        assert_eq!(error, AudioPlaybackError::MisalignedInput);
    }

    #[test]
    fn upmixes_pcm16_mono_to_stereo_pcm16() {
        let mut input = Vec::new();
        for sample in [i16::MIN, 0, i16::MAX] {
            input.extend_from_slice(&sample.to_le_bytes());
        }

        let output = convert_pcm16_mono_24k_to_mix(
            &input,
            OutputMixFormat {
                sample_rate: 24_000,
                channels: 2,
                sample_format: SourceSampleFormat::Pcm16,
            },
        )
        .expect("conversion should succeed");

        let rendered = output
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        assert_eq!(
            rendered,
            vec![i16::MIN, i16::MIN, 0, 0, i16::MAX, i16::MAX,]
        );
    }

    #[test]
    fn resamples_to_float32_mix_format() {
        let mut input = Vec::new();
        for sample in [0_i16, i16::MAX] {
            input.extend_from_slice(&sample.to_le_bytes());
        }

        let output = convert_pcm16_mono_24k_to_mix(
            &input,
            OutputMixFormat {
                sample_rate: 48_000,
                channels: 1,
                sample_format: SourceSampleFormat::Float32,
            },
        )
        .expect("conversion should succeed");

        let rendered = output
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect::<Vec<_>>();
        assert_eq!(rendered.len(), 4);
        assert!(rendered[1] > 0.45 && rendered[1] < 0.55);
        assert!(rendered[3] > 0.99);
    }
}
