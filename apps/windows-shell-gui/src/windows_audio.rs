use super::MicrophoneCaptureStatus;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use std::time::Duration;
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
static LAST_CAPTURE: OnceLock<Mutex<Vec<u8>>> = OnceLock::new();

fn capture_status() -> &'static Mutex<MicrophoneCaptureStatus> {
    CAPTURE_STATUS.get_or_init(|| Mutex::new(MicrophoneCaptureStatus::default()))
}

fn last_capture() -> &'static Mutex<Vec<u8>> {
    LAST_CAPTURE.get_or_init(|| Mutex::new(Vec::new()))
}

pub(super) fn current_status() -> MicrophoneCaptureStatus {
    capture_status()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub(super) fn start() {
    if CAPTURE_ACTIVE.swap(true, Ordering::AcqRel) {
        return;
    }

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
        let mut captured_frames = 0_u64;

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
                &mut captured_frames,
            )?;
            std::thread::sleep(Duration::from_millis(8));
        }
        audio_client.Stop()?;
        drain_available_packets(
            &capture_client,
            format.nBlockAlign as usize,
            &mut captured_audio,
            &mut captured_frames,
        )?;

        let duration_ms = if format.nSamplesPerSec == 0 {
            0
        } else {
            captured_frames.saturating_mul(1_000) / u64::from(format.nSamplesPerSec)
        };
        let bytes_captured = captured_audio.len();
        *last_capture()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = captured_audio;
        *capture_status()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = MicrophoneCaptureStatus {
            state: "committed",
            bytes_captured,
            duration_ms,
            sample_rate: format.nSamplesPerSec,
            channels: format.nChannels,
            bits_per_sample: format.wBitsPerSample,
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
    captured_frames: &mut u64,
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
        if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data_pointer.is_null() {
            captured_audio.resize(captured_audio.len() + byte_count, 0);
        } else {
            captured_audio.extend_from_slice(std::slice::from_raw_parts(data_pointer, byte_count));
        }
        *captured_frames += u64::from(frame_count);
        capture_client.ReleaseBuffer(frame_count)?;
    }
}
