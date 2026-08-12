#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum SourceSampleFormat {
    Pcm16,
    Float32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct InterleavedAudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: SourceSampleFormat,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Pcm16MonoChunk {
    pub bytes: Vec<u8>,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub duration_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum AudioFormatError {
    EmptyInput,
    InvalidSampleRate,
    InvalidChannelCount,
    MisalignedInput,
    UnsupportedTargetSampleRate,
    UnsupportedSourceFormat,
}

impl std::fmt::Display for AudioFormatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioFormatError::EmptyInput => f.write_str("audio buffer is empty"),
            AudioFormatError::InvalidSampleRate => f.write_str("audio sample rate is invalid"),
            AudioFormatError::InvalidChannelCount => f.write_str("audio channel count is invalid"),
            AudioFormatError::MisalignedInput => {
                f.write_str("audio buffer does not align to the declared frame size")
            }
            AudioFormatError::UnsupportedTargetSampleRate => {
                f.write_str("target sample rate is invalid")
            }
            AudioFormatError::UnsupportedSourceFormat => {
                f.write_str("audio source format is not supported")
            }
        }
    }
}

impl std::error::Error for AudioFormatError {}

pub(super) fn convert_interleaved_to_pcm16_mono(
    input: &[u8],
    source_format: InterleavedAudioFormat,
    target_sample_rate: u32,
) -> Result<Pcm16MonoChunk, AudioFormatError> {
    if input.is_empty() {
        return Err(AudioFormatError::EmptyInput);
    }
    if source_format.sample_rate == 0 {
        return Err(AudioFormatError::InvalidSampleRate);
    }
    if target_sample_rate == 0 {
        return Err(AudioFormatError::UnsupportedTargetSampleRate);
    }
    if source_format.channels == 0 {
        return Err(AudioFormatError::InvalidChannelCount);
    }

    let bytes_per_channel = match source_format.sample_format {
        SourceSampleFormat::Pcm16 => 2,
        SourceSampleFormat::Float32 => 4,
    };
    let frame_size = usize::from(source_format.channels) * bytes_per_channel;
    if frame_size == 0 || input.len() % frame_size != 0 {
        return Err(AudioFormatError::MisalignedInput);
    }

    let source_frame_count = input.len() / frame_size;
    let mut mono = Vec::with_capacity(source_frame_count);
    for frame_index in 0..source_frame_count {
        let frame_offset = frame_index * frame_size;
        let mut sample_sum = 0.0_f32;
        for channel_index in 0..usize::from(source_format.channels) {
            let channel_offset = frame_offset + channel_index * bytes_per_channel;
            let sample = match source_format.sample_format {
                SourceSampleFormat::Pcm16 => {
                    let bytes = [input[channel_offset], input[channel_offset + 1]];
                    f32::from(i16::from_le_bytes(bytes)) / f32::from(i16::MAX)
                }
                SourceSampleFormat::Float32 => {
                    let bytes = [
                        input[channel_offset],
                        input[channel_offset + 1],
                        input[channel_offset + 2],
                        input[channel_offset + 3],
                    ];
                    f32::from_le_bytes(bytes)
                }
            };
            sample_sum += sample;
        }
        mono.push((sample_sum / f32::from(source_format.channels)).clamp(-1.0, 1.0));
    }

    let target_frame_count = resampled_frame_count(
        source_frame_count,
        source_format.sample_rate,
        target_sample_rate,
    );
    if target_frame_count == 0 {
        return Err(AudioFormatError::EmptyInput);
    }

    let mut bytes = Vec::with_capacity(target_frame_count * 2);
    for target_index in 0..target_frame_count {
        let sample = resample_mono_frame(
            &mono,
            source_format.sample_rate,
            target_sample_rate,
            target_index,
        );
        bytes.extend_from_slice(&normalized_sample_to_i16(sample).to_le_bytes());
    }

    Ok(Pcm16MonoChunk {
        duration_ms: target_frame_count as u64 * 1_000 / u64::from(target_sample_rate),
        bytes,
        sample_rate: target_sample_rate,
        channels: 1,
        bits_per_sample: 16,
    })
}

fn resampled_frame_count(
    source_frame_count: usize,
    source_sample_rate: u32,
    target_sample_rate: u32,
) -> usize {
    let rounded = ((source_frame_count as u128 * u128::from(target_sample_rate))
        + (u128::from(source_sample_rate) / 2))
        / u128::from(source_sample_rate);
    rounded.max(1).min(usize::MAX as u128) as usize
}

fn resample_mono_frame(
    mono: &[f32],
    source_sample_rate: u32,
    target_sample_rate: u32,
    target_index: usize,
) -> f32 {
    if mono.len() == 1 || source_sample_rate == target_sample_rate {
        return mono[target_index.min(mono.len() - 1)];
    }

    let source_position =
        (target_index as f64 * f64::from(source_sample_rate)) / f64::from(target_sample_rate);
    let left_index = source_position.floor() as usize;
    let right_index = (left_index + 1).min(mono.len() - 1);
    let fraction = (source_position - left_index as f64) as f32;
    let left = mono[left_index.min(mono.len() - 1)];
    let right = mono[right_index];
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
    (clamped * f32::from(i16::MAX)).round() as i16
}

#[cfg(test)]
mod tests {
    use super::{
        convert_interleaved_to_pcm16_mono, AudioFormatError, InterleavedAudioFormat,
        SourceSampleFormat,
    };

    #[test]
    fn rejects_empty_input() {
        let error = convert_interleaved_to_pcm16_mono(
            &[],
            InterleavedAudioFormat {
                sample_rate: 48_000,
                channels: 2,
                sample_format: SourceSampleFormat::Float32,
            },
            24_000,
        )
        .unwrap_err();

        assert_eq!(error, AudioFormatError::EmptyInput);
    }

    #[test]
    fn downmixes_pcm16_and_preserves_target_sample_rate() {
        let mut input = Vec::new();
        for (left, right) in [(i16::MAX, i16::MAX), (0, 0), (i16::MIN, i16::MIN)] {
            input.extend_from_slice(&left.to_le_bytes());
            input.extend_from_slice(&right.to_le_bytes());
        }

        let output = convert_interleaved_to_pcm16_mono(
            &input,
            InterleavedAudioFormat {
                sample_rate: 24_000,
                channels: 2,
                sample_format: SourceSampleFormat::Pcm16,
            },
            24_000,
        )
        .unwrap();

        let samples: Vec<i16> = output
            .bytes
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        assert_eq!(output.sample_rate, 24_000);
        assert_eq!(output.channels, 1);
        assert_eq!(samples, vec![i16::MAX, 0, i16::MIN]);
    }

    #[test]
    fn resamples_float32_with_linear_interpolation() {
        let mut input = Vec::new();
        for sample in [0.0_f32, 1.0, 0.0, -1.0] {
            input.extend_from_slice(&sample.to_le_bytes());
        }

        let output = convert_interleaved_to_pcm16_mono(
            &input,
            InterleavedAudioFormat {
                sample_rate: 4,
                channels: 1,
                sample_format: SourceSampleFormat::Float32,
            },
            8,
        )
        .unwrap();

        let samples: Vec<i16> = output
            .bytes
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        assert_eq!(samples.len(), 8);
        assert_eq!(samples[0], 0);
        assert!(samples[1] > 15_000 && samples[1] < 17_000);
        assert_eq!(samples[2], i16::MAX);
        assert!(samples[3] > 15_000 && samples[3] < 17_000);
        assert_eq!(samples[4], 0);
        assert!(samples[5] < -15_000 && samples[5] > -17_000);
        assert_eq!(samples[6], i16::MIN);
        assert_eq!(samples[7], i16::MIN);
    }

    #[test]
    fn rejects_misaligned_input() {
        let error = convert_interleaved_to_pcm16_mono(
            &[0, 1, 2],
            InterleavedAudioFormat {
                sample_rate: 48_000,
                channels: 2,
                sample_format: SourceSampleFormat::Pcm16,
            },
            24_000,
        )
        .unwrap_err();

        assert_eq!(error, AudioFormatError::MisalignedInput);
    }

    #[test]
    fn formats_unsupported_source_error_message() {
        assert_eq!(
            AudioFormatError::UnsupportedSourceFormat.to_string(),
            "audio source format is not supported"
        );
    }
}
