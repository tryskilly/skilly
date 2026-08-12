use super::MicrophoneCaptureStatus;
#[path = "audio_format.rs"]
mod audio_format;

use self::audio_format::{
    convert_interleaved_to_pcm16_mono, InterleavedAudioFormat, Pcm16MonoChunk, SourceSampleFormat,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use std::time::Duration;
use windows::core::HRESULT;
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

static CAPTURE_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURE_STATUS: OnceLock<Mutex<MicrophoneCaptureStatus>> = OnceLock::new();
static LAST_CAPTURE: OnceLock<Mutex<Option<Pcm16MonoChunk>>> = OnceLock::new();
const TARGET_SAMPLE_RATE: u32 = 24_000;
const MAX_CAPTURE_BYTES: usize = 32 * 1024 * 1024;

fn capture_status() -> &'static Mutex<MicrophoneCaptureStatus> {
    CAPTURE_STATUS.get_or_init(|| Mutex::new(MicrophoneCaptureStatus::default()))
}

fn last_capture() -> &'static Mutex<Option<Pcm16MonoChunk>> {
    LAST_CAPTURE.get_or_init(|| Mutex::new(None))
}

pub(super) fn current_status() -> MicrophoneCaptureStatus {
    capture_status()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub(super) fn latest_capture_chunk() -> Option<Pcm16MonoChunk> {
    last_capture()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub(super) fn take_last_capture() -> Option<Pcm16MonoChunk> {
    last_capture()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
}

pub(super) fn start() {
    if CAPTURE_ACTIVE.swap(true, Ordering::AcqRel) {
        return;
    }

    *last_capture()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *capture_status()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = MicrophoneCaptureStatus {
        state: "starting",
        ..MicrophoneCaptureStatus::default()
    };

    std::thread::spawn(|| {
        let result = unsafe { capture_default_microphone() };
        if let Err(error) = result {
            CAPTURE_ACTIVE.store(false, Ordering::Release);
            *capture_status()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = MicrophoneCaptureStatus {
                state: "error",
                error: Some(error.to_string()),
                ..MicrophoneCaptureStatus::default()
            };
        }
    });
}

pub(super) fn stop() {
    CAPTURE_ACTIVE.store(false, Ordering::Release);
}

pub(super) fn stop_and_take_capture(timeout: Duration) -> Option<Pcm16MonoChunk> {
    stop();
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if let Some(capture) = take_last_capture() {
            return Some(capture);
        }
        if current_status().state == "error" || std::time::Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}

unsafe fn capture_default_microphone() -> windows::core::Result<()> {
    CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;

    let capture_result = (|| -> windows::core::Result<()> {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications)?;
        let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
        let format_pointer = audio_client.GetMixFormat()?;
        let format = *format_pointer;

        let initialize_result = audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            0,
            10_000_000,
            0,
            format_pointer,
            None,
        );
        CoTaskMemFree(Some(format_pointer.cast()));
        initialize_result?;

        let capture_client: IAudioCaptureClient = audio_client.GetService()?;
        let mut captured_audio = Vec::new();

        *capture_status()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = MicrophoneCaptureStatus {
            state: "recording",
            sample_rate: format.nSamplesPerSec,
            channels: format.nChannels,
            bits_per_sample: format.wBitsPerSample,
            ..MicrophoneCaptureStatus::default()
        };

        audio_client.Start()?;
        while CAPTURE_ACTIVE.load(Ordering::Acquire) {
            drain_available_packets(
                &capture_client,
                format.nBlockAlign as usize,
                &mut captured_audio,
            )?;
            std::thread::sleep(Duration::from_millis(8));
        }
        audio_client.Stop()?;
        drain_available_packets(
            &capture_client,
            format.nBlockAlign as usize,
            &mut captured_audio,
        )?;

        let converted_capture =
            convert_capture_payload(&captured_audio, &format).map_err(|error| {
                windows::core::Error::new(HRESULT(0x8000_4005_u32 as i32), error.to_string())
            })?;
        let bytes_captured = converted_capture.bytes.len();
        let duration_ms = converted_capture.duration_ms;
        *last_capture()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(converted_capture);
        *capture_status()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = MicrophoneCaptureStatus {
            state: "committed",
            bytes_captured,
            duration_ms,
            sample_rate: TARGET_SAMPLE_RATE,
            channels: 1,
            bits_per_sample: 16,
            error: None,
        };
        Ok(())
    })();

    CoUninitialize();
    capture_result
}

unsafe fn drain_available_packets(
    capture_client: &IAudioCaptureClient,
    block_align: usize,
    captured_audio: &mut Vec<u8>,
) -> windows::core::Result<()> {
    loop {
        let next_packet_frames = capture_client.GetNextPacketSize()?;
        if next_packet_frames == 0 {
            return Ok(());
        }

        let mut data_pointer = std::ptr::null_mut();
        let mut frame_count = 0_u32;
        let mut flags = 0_u32;
        capture_client.GetBuffer(&mut data_pointer, &mut frame_count, &mut flags, None, None)?;

        let byte_count = frame_count as usize * block_align;
        let remaining_capacity = MAX_CAPTURE_BYTES.saturating_sub(captured_audio.len());
        let bytes_to_store = (byte_count.min(remaining_capacity) / block_align) * block_align;
        if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data_pointer.is_null() {
            captured_audio.resize(captured_audio.len() + bytes_to_store, 0);
        } else {
            captured_audio
                .extend_from_slice(std::slice::from_raw_parts(data_pointer, bytes_to_store));
        }
        capture_client.ReleaseBuffer(frame_count)?;
    }
}

fn convert_capture_payload(
    captured_audio: &[u8],
    format: &windows::Win32::Media::Audio::WAVEFORMATEX,
) -> Result<Pcm16MonoChunk, audio_format::AudioFormatError> {
    let source_sample_format = match format.wBitsPerSample {
        16 => SourceSampleFormat::Pcm16,
        32 => SourceSampleFormat::Float32,
        _ => return Err(audio_format::AudioFormatError::UnsupportedSourceFormat),
    };
    convert_interleaved_to_pcm16_mono(
        captured_audio,
        InterleavedAudioFormat {
            sample_rate: format.nSamplesPerSec,
            channels: format.nChannels,
            sample_format: source_sample_format,
        },
        TARGET_SAMPLE_RATE,
    )
}
