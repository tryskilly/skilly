use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct PixelSize {
    pub width: u32,
    pub height: u32,
}

impl PixelSize {
    pub(super) fn new(width: u32, height: u32) -> Result<Self, ScreenCaptureError> {
        if width == 0 || height == 0 {
            return Err(ScreenCaptureError::InvalidDimensions { width, height });
        }
        Ok(Self { width, height })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct PixelPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct ScreenCaptureFrame {
    pub bytes: Vec<u8>,
    pub mime_type: &'static str,
    pub display_origin: PixelPoint,
    pub display_size: PixelSize,
    pub capture_size: PixelSize,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum ScreenCaptureError {
    UnsupportedPlatform,
    InvalidDimensions { width: u32, height: u32 },
    InvalidMaxDimension,
    BufferTooLarge,
    CaptureFailed(&'static str),
    EncodeFailed(&'static str),
}

impl fmt::Display for ScreenCaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScreenCaptureError::UnsupportedPlatform => {
                f.write_str("screen capture is only available on Windows")
            }
            ScreenCaptureError::InvalidDimensions { width, height } => {
                write!(f, "invalid capture dimensions: {width}x{height}")
            }
            ScreenCaptureError::InvalidMaxDimension => {
                f.write_str("max dimension must be greater than zero")
            }
            ScreenCaptureError::BufferTooLarge => {
                f.write_str("screen capture would allocate an unreasonably large buffer")
            }
            ScreenCaptureError::CaptureFailed(reason) => {
                write!(f, "screen capture failed: {reason}")
            }
            ScreenCaptureError::EncodeFailed(reason) => {
                write!(f, "image encoding failed: {reason}")
            }
        }
    }
}

impl std::error::Error for ScreenCaptureError {}

pub(super) fn capture_primary_monitor_for_realtime(
    max_dimension: u32,
) -> Result<ScreenCaptureFrame, ScreenCaptureError> {
    if max_dimension == 0 {
        return Err(ScreenCaptureError::InvalidMaxDimension);
    }

    #[cfg(target_os = "windows")]
    {
        let raw_capture = gdi::capture_primary_monitor_bgra()?;
        let bounded_capture_size = fit_within_bounds(raw_capture.display_size, max_dimension)?;
        let rgba = convert_and_resize_bgra_to_rgba(
            &raw_capture.bgra_bytes,
            raw_capture.display_size,
            bounded_capture_size,
        )?;
        let png_bytes = encode_rgba_as_png(&rgba, bounded_capture_size)?;
        Ok(ScreenCaptureFrame {
            bytes: png_bytes,
            mime_type: "image/png",
            display_origin: raw_capture.display_origin,
            display_size: raw_capture.display_size,
            capture_size: bounded_capture_size,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = max_dimension;
        Err(ScreenCaptureError::UnsupportedPlatform)
    }
}

pub(super) fn fit_within_bounds(
    source_size: PixelSize,
    max_dimension: u32,
) -> Result<PixelSize, ScreenCaptureError> {
    if max_dimension == 0 {
        return Err(ScreenCaptureError::InvalidMaxDimension);
    }

    if source_size.width <= max_dimension && source_size.height <= max_dimension {
        return Ok(source_size);
    }

    let scale = if source_size.width >= source_size.height {
        max_dimension as f64 / source_size.width as f64
    } else {
        max_dimension as f64 / source_size.height as f64
    };

    let width = ((source_size.width as f64) * scale).round().max(1.0) as u32;
    let height = ((source_size.height as f64) * scale).round().max(1.0) as u32;
    PixelSize::new(width, height)
}

pub(super) fn map_capture_pixel_to_display_point(
    capture_point: PixelPoint,
    capture_size: PixelSize,
    display_origin: PixelPoint,
    display_size: PixelSize,
) -> Result<PixelPoint, ScreenCaptureError> {
    if capture_size.width == 0
        || capture_size.height == 0
        || display_size.width == 0
        || display_size.height == 0
    {
        return Err(ScreenCaptureError::InvalidDimensions {
            width: capture_size.width.max(display_size.width),
            height: capture_size.height.max(display_size.height),
        });
    }

    let clamped_x = capture_point
        .x
        .clamp(0, capture_size.width.saturating_sub(1) as i32) as f64;
    let clamped_y = capture_point
        .y
        .clamp(0, capture_size.height.saturating_sub(1) as i32) as f64;
    let width_scale = display_size.width as f64 / capture_size.width as f64;
    let height_scale = display_size.height as f64 / capture_size.height as f64;

    Ok(PixelPoint {
        x: display_origin.x + (clamped_x * width_scale).round() as i32,
        y: display_origin.y + (clamped_y * height_scale).round() as i32,
    })
}

fn convert_and_resize_bgra_to_rgba(
    bgra_bytes: &[u8],
    source_size: PixelSize,
    target_size: PixelSize,
) -> Result<Vec<u8>, ScreenCaptureError> {
    let source_pixel_count = checked_pixel_count(source_size)?;
    let source_byte_count = source_pixel_count
        .checked_mul(4)
        .ok_or(ScreenCaptureError::BufferTooLarge)?;
    if bgra_bytes.len() != source_byte_count {
        return Err(ScreenCaptureError::CaptureFailed(
            "raw BGRA buffer length does not match declared dimensions",
        ));
    }

    let target_pixel_count = checked_pixel_count(target_size)?;
    let target_byte_count = target_pixel_count
        .checked_mul(4)
        .ok_or(ScreenCaptureError::BufferTooLarge)?;
    let mut rgba = vec![0_u8; target_byte_count];

    let source_width = source_size.width as usize;
    let source_height = source_size.height as usize;
    let target_width = target_size.width as usize;
    let target_height = target_size.height as usize;

    for target_y in 0..target_height {
        let source_y = ((target_y as u64 * source_height as u64) / target_height as u64) as usize;
        for target_x in 0..target_width {
            let source_x = ((target_x as u64 * source_width as u64) / target_width as u64) as usize;
            let source_offset = ((source_y * source_width) + source_x) * 4;
            let target_offset = ((target_y * target_width) + target_x) * 4;
            let blue = bgra_bytes[source_offset];
            let green = bgra_bytes[source_offset + 1];
            let red = bgra_bytes[source_offset + 2];
            let alpha = bgra_bytes[source_offset + 3];
            rgba[target_offset] = red;
            rgba[target_offset + 1] = green;
            rgba[target_offset + 2] = blue;
            rgba[target_offset + 3] = alpha;
        }
    }

    Ok(rgba)
}

fn encode_rgba_as_png(
    rgba_bytes: &[u8],
    image_size: PixelSize,
) -> Result<Vec<u8>, ScreenCaptureError> {
    let pixel_count = checked_pixel_count(image_size)?;
    let expected_rgba_len = pixel_count
        .checked_mul(4)
        .ok_or(ScreenCaptureError::BufferTooLarge)?;
    if rgba_bytes.len() != expected_rgba_len {
        return Err(ScreenCaptureError::EncodeFailed(
            "RGBA byte length does not match the declared image size",
        ));
    }

    let width = image_size.width as usize;
    let height = image_size.height as usize;
    let row_stride = width
        .checked_mul(4)
        .ok_or(ScreenCaptureError::BufferTooLarge)?;
    let raw_capacity = height
        .checked_mul(row_stride + 1)
        .ok_or(ScreenCaptureError::BufferTooLarge)?;
    let mut raw_scanlines = Vec::with_capacity(raw_capacity);
    for row_index in 0..height {
        raw_scanlines.push(0); // filter type 0 (None)
        let row_start = row_index * row_stride;
        raw_scanlines.extend_from_slice(&rgba_bytes[row_start..row_start + row_stride]);
    }

    let compressed = zlib_store_compress(&raw_scanlines)?;
    let mut png_bytes = Vec::with_capacity(8 + 25 + 12 + compressed.len() + 12);
    png_bytes.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&image_size.width.to_be_bytes());
    ihdr.extend_from_slice(&image_size.height.to_be_bytes());
    ihdr.push(8); // bit depth
    ihdr.push(6); // color type: RGBA
    ihdr.push(0); // compression method
    ihdr.push(0); // filter method
    ihdr.push(0); // no interlace
    write_png_chunk(&mut png_bytes, *b"IHDR", &ihdr)?;
    write_png_chunk(&mut png_bytes, *b"IDAT", &compressed)?;
    write_png_chunk(&mut png_bytes, *b"IEND", &[])?;
    Ok(png_bytes)
}

fn write_png_chunk(
    output: &mut Vec<u8>,
    chunk_type: [u8; 4],
    chunk_data: &[u8],
) -> Result<(), ScreenCaptureError> {
    let chunk_len = u32::try_from(chunk_data.len())
        .map_err(|_| ScreenCaptureError::EncodeFailed("chunk larger than PNG supports"))?;
    output.extend_from_slice(&chunk_len.to_be_bytes());
    output.extend_from_slice(&chunk_type);
    output.extend_from_slice(chunk_data);

    let mut crc_input = Vec::with_capacity(4 + chunk_data.len());
    crc_input.extend_from_slice(&chunk_type);
    crc_input.extend_from_slice(chunk_data);
    output.extend_from_slice(&crc32(&crc_input).to_be_bytes());
    Ok(())
}

fn zlib_store_compress(input: &[u8]) -> Result<Vec<u8>, ScreenCaptureError> {
    let mut output = Vec::with_capacity(input.len() + (input.len() / 65_535 + 1) * 5 + 6);
    output.extend_from_slice(&[0x78, 0x01]); // zlib header: deflate + fastest algorithm

    let mut offset = 0_usize;
    while offset < input.len() {
        let remaining = input.len() - offset;
        let block_len = remaining.min(65_535);
        let is_last = offset + block_len >= input.len();
        output.push(if is_last { 0x01 } else { 0x00 });
        let len = u16::try_from(block_len)
            .map_err(|_| ScreenCaptureError::EncodeFailed("deflate block too large"))?;
        output.extend_from_slice(&len.to_le_bytes());
        output.extend_from_slice(&(!len).to_le_bytes());
        output.extend_from_slice(&input[offset..offset + block_len]);
        offset += block_len;
    }

    output.extend_from_slice(&adler32(input).to_be_bytes());
    Ok(output)
}

fn checked_pixel_count(size: PixelSize) -> Result<usize, ScreenCaptureError> {
    let width = usize::try_from(size.width).map_err(|_| ScreenCaptureError::BufferTooLarge)?;
    let height = usize::try_from(size.height).map_err(|_| ScreenCaptureError::BufferTooLarge)?;
    width
        .checked_mul(height)
        .ok_or(ScreenCaptureError::BufferTooLarge)
}

fn adler32(bytes: &[u8]) -> u32 {
    const MOD_ADLER: u32 = 65_521;
    let mut a = 1_u32;
    let mut b = 0_u32;
    for &byte in bytes {
        a = (a + u32::from(byte)) % MOD_ADLER;
        b = (b + a) % MOD_ADLER;
    }
    (b << 16) | a
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFF_u32;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = if crc & 1 == 1 { 0xEDB8_8320 } else { 0 };
            crc = (crc >> 1) ^ mask;
        }
    }
    !crc
}

#[cfg(target_os = "windows")]
mod gdi {
    use super::{checked_pixel_count, PixelPoint, PixelSize, ScreenCaptureError};
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::ptr::null_mut;

    type Hdc = *mut c_void;
    type Hbitmap = *mut c_void;
    type Hgdiobj = *mut c_void;
    type Hwnd = *mut c_void;

    const BI_RGB: u32 = 0;
    const DIB_RGB_COLORS: u32 = 0;
    const SM_CXSCREEN: i32 = 0;
    const SM_CYSCREEN: i32 = 1;
    const SRCCOPY: u32 = 0x00CC_0020;
    const CAPTUREBLT: u32 = 0x4000_0000;

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct RgbQuad {
        rgb_blue: u8,
        rgb_green: u8,
        rgb_red: u8,
        rgb_reserved: u8,
    }

    #[repr(C)]
    struct BitmapInfo {
        bmi_header: BitmapInfoHeader,
        bmi_colors: [RgbQuad; 1],
    }

    unsafe extern "system" {
        fn GetDC(hwnd: Hwnd) -> Hdc;
        fn ReleaseDC(hwnd: Hwnd, hdc: Hdc) -> i32;
        fn CreateCompatibleDC(hdc: Hdc) -> Hdc;
        fn DeleteDC(hdc: Hdc) -> i32;
        fn CreateDIBSection(
            hdc: Hdc,
            pbmi: *const BitmapInfo,
            usage: u32,
            ppv_bits: *mut *mut c_void,
            section: *mut c_void,
            offset: u32,
        ) -> Hbitmap;
        fn SelectObject(hdc: Hdc, hgdiobj: Hgdiobj) -> Hgdiobj;
        fn DeleteObject(ho: Hgdiobj) -> i32;
        fn BitBlt(
            hdc: Hdc,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            hdc_src: Hdc,
            x1: i32,
            y1: i32,
            rop: u32,
        ) -> i32;
        fn GetSystemMetrics(index: i32) -> i32;
    }

    pub(super) struct RawPrimaryMonitorCapture {
        pub display_origin: PixelPoint,
        pub display_size: PixelSize,
        pub bgra_bytes: Vec<u8>,
    }

    struct ScreenDc(Hdc);
    impl Drop for ScreenDc {
        fn drop(&mut self) {
            unsafe {
                let _ = ReleaseDC(null_mut(), self.0);
            }
        }
    }

    struct MemoryDc(Hdc);
    impl Drop for MemoryDc {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteDC(self.0);
            }
        }
    }

    struct Bitmap(Hbitmap);
    impl Drop for Bitmap {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(self.0);
            }
        }
    }

    struct SelectedObject {
        hdc: Hdc,
        previous: Hgdiobj,
    }

    impl Drop for SelectedObject {
        fn drop(&mut self) {
            unsafe {
                let _ = SelectObject(self.hdc, self.previous);
            }
        }
    }

    pub(super) fn capture_primary_monitor_bgra(
    ) -> Result<RawPrimaryMonitorCapture, ScreenCaptureError> {
        let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        if width <= 0 || height <= 0 {
            return Err(ScreenCaptureError::CaptureFailed(
                "primary monitor returned an invalid size",
            ));
        }

        let display_size = PixelSize::new(width as u32, height as u32)?;
        let pixel_count = checked_pixel_count(display_size)?;
        let byte_count = pixel_count
            .checked_mul(4)
            .ok_or(ScreenCaptureError::BufferTooLarge)?;

        unsafe {
            let screen_dc = GetDC(null_mut());
            if screen_dc.is_null() {
                return Err(ScreenCaptureError::CaptureFailed("GetDC returned null"));
            }
            let screen_dc = ScreenDc(screen_dc);

            let memory_dc = CreateCompatibleDC(screen_dc.0);
            if memory_dc.is_null() {
                return Err(ScreenCaptureError::CaptureFailed(
                    "CreateCompatibleDC returned null",
                ));
            }
            let memory_dc = MemoryDc(memory_dc);

            let mut bitmap_info = BitmapInfo {
                bmi_header: BitmapInfoHeader {
                    bi_size: size_of::<BitmapInfoHeader>() as u32,
                    bi_width: width,
                    bi_height: -height, // top-down DIB so rows match screen coordinates
                    bi_planes: 1,
                    bi_bit_count: 32,
                    bi_compression: BI_RGB,
                    bi_size_image: 0,
                    bi_x_pels_per_meter: 0,
                    bi_y_pels_per_meter: 0,
                    bi_clr_used: 0,
                    bi_clr_important: 0,
                },
                bmi_colors: [RgbQuad {
                    rgb_blue: 0,
                    rgb_green: 0,
                    rgb_red: 0,
                    rgb_reserved: 0,
                }],
            };

            let mut bits = null_mut();
            let bitmap = CreateDIBSection(
                screen_dc.0,
                &bitmap_info,
                DIB_RGB_COLORS,
                &mut bits,
                null_mut(),
                0,
            );
            if bitmap.is_null() || bits.is_null() {
                return Err(ScreenCaptureError::CaptureFailed(
                    "CreateDIBSection failed to allocate capture surface",
                ));
            }
            let bitmap = Bitmap(bitmap);

            let previous = SelectObject(memory_dc.0, bitmap.0);
            if previous.is_null() {
                return Err(ScreenCaptureError::CaptureFailed(
                    "SelectObject failed to attach capture surface",
                ));
            }
            let _selected = SelectedObject {
                hdc: memory_dc.0,
                previous,
            };

            let bitblt_ok = BitBlt(
                memory_dc.0,
                0,
                0,
                width,
                height,
                screen_dc.0,
                0,
                0,
                SRCCOPY | CAPTUREBLT,
            );
            if bitblt_ok == 0 {
                return Err(ScreenCaptureError::CaptureFailed(
                    "BitBlt failed to copy the primary monitor",
                ));
            }

            let bgra_bytes = std::slice::from_raw_parts(bits as *const u8, byte_count).to_vec();
            Ok(RawPrimaryMonitorCapture {
                display_origin: PixelPoint { x: 0, y: 0 },
                display_size,
                bgra_bytes,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        capture_primary_monitor_for_realtime, crc32, encode_rgba_as_png, fit_within_bounds,
        map_capture_pixel_to_display_point, PixelPoint, PixelSize, ScreenCaptureError,
    };

    #[test]
    fn fit_within_bounds_preserves_aspect_ratio_without_upscaling() {
        let original = PixelSize::new(1920, 1080).unwrap();
        let bounded = fit_within_bounds(original, 1280).unwrap();
        assert_eq!(bounded, PixelSize::new(1280, 720).unwrap());

        let already_small = PixelSize::new(640, 360).unwrap();
        assert_eq!(
            fit_within_bounds(already_small, 1280).unwrap(),
            already_small
        );
    }

    #[test]
    fn map_capture_pixel_to_display_point_scales_across_coordinate_spaces() {
        let capture_size = PixelSize::new(1280, 720).unwrap();
        let display_size = PixelSize::new(2560, 1440).unwrap();
        let mapped = map_capture_pixel_to_display_point(
            PixelPoint { x: 640, y: 360 },
            capture_size,
            PixelPoint { x: 100, y: 200 },
            display_size,
        )
        .unwrap();

        assert_eq!(mapped, PixelPoint { x: 1380, y: 920 });
    }

    #[test]
    fn png_encoder_writes_valid_signature_and_header() {
        let image_size = PixelSize::new(2, 1).unwrap();
        let rgba = vec![
            255, 0, 0, 255, // red
            0, 255, 0, 255, // green
        ];
        let png = encode_rgba_as_png(&rgba, image_size).unwrap();

        assert_eq!(&png[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
        assert_eq!(&png[12..16], b"IHDR");
        assert_eq!(u32::from_be_bytes([png[16], png[17], png[18], png[19]]), 2);
        assert_eq!(u32::from_be_bytes([png[20], png[21], png[22], png[23]]), 1);
        assert_eq!(&png[png.len() - 8..png.len() - 4], b"IEND");
    }

    #[test]
    fn crc32_matches_png_reference_value() {
        assert_eq!(crc32(b"IHDR"), 0xA8A1_AE0A);
    }

    #[test]
    fn rejects_zero_max_dimension() {
        let result = capture_primary_monitor_for_realtime(0);
        assert_eq!(result.unwrap_err(), ScreenCaptureError::InvalidMaxDimension);
    }
}
