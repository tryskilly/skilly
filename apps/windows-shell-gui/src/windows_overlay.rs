use std::fmt;

const DEFAULT_CURSOR_RADIUS_PX: i32 = 10;
const DEFAULT_MARGIN_PX: i32 = 20;
const DEFAULT_TEXT_PADDING_PX: i32 = 12;
const DEFAULT_LINE_HEIGHT_PX: i32 = 20;
const DEFAULT_BUBBLE_OFFSET_X_PX: i32 = 18;
const DEFAULT_BUBBLE_OFFSET_Y_PX: i32 = 22;
const DEFAULT_MIN_BUBBLE_WIDTH_PX: i32 = 160;
const DEFAULT_MAX_BUBBLE_WIDTH_PX: i32 = 340;
const MAX_TRANSCRIPT_LEN: usize = 320;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

    pub fn right(self) -> i32 {
        self.origin_x
            .saturating_add(self.width.saturating_sub(1) as i32)
    }

    pub fn bottom(self) -> i32 {
        self.origin_y
            .saturating_add(self.height.saturating_sub(1) as i32)
    }

    pub fn clamp(self, point: ScreenPoint) -> ScreenPoint {
        ScreenPoint {
            x: point.x.clamp(self.origin_x, self.right()),
            y: point.y.clamp(self.origin_y, self.bottom()),
        }
    }

    pub fn to_client_point(self, point: ScreenPoint) -> ClientPoint {
        let clamped = self.clamp(point);
        ClientPoint {
            x: clamped.x.saturating_sub(self.origin_x),
            y: clamped.y.saturating_sub(self.origin_y),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClientPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClientRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl ClientRect {
    pub fn width(self) -> i32 {
        self.right.saturating_sub(self.left)
    }

    pub fn height(self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CursorPoint {
    pub point: ScreenPoint,
    pub radius_px: i32,
    pub label: Option<String>,
}

impl CursorPoint {
    pub fn new(point: ScreenPoint, radius_px: i32, label: Option<impl Into<String>>) -> Self {
        Self {
            point,
            radius_px: radius_px.max(2),
            label: label.map(|value| sanitize_text(&value.into(), 96)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptBubble {
    pub anchor: ScreenPoint,
    pub text: String,
    pub max_width_px: i32,
}

impl TranscriptBubble {
    pub fn new(anchor: ScreenPoint, text: impl Into<String>) -> Self {
        Self {
            anchor,
            text: sanitize_text(&text.into(), MAX_TRANSCRIPT_LEN),
            max_width_px: DEFAULT_MAX_BUBBLE_WIDTH_PX,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OverlayFrame {
    pub cursor: Option<CursorPoint>,
    pub transcript: Option<TranscriptBubble>,
}

impl OverlayFrame {
    pub fn visible(&self) -> bool {
        self.cursor.is_some() || self.transcript.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayInitOptions {
    pub screen: ScreenBounds,
    pub class_name: String,
    pub window_title: String,
}

impl OverlayInitOptions {
    pub fn new(screen: ScreenBounds) -> Self {
        Self {
            screen,
            class_name: "SkillyWindowsOverlay".to_string(),
            window_title: "Skilly Overlay".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BubbleLayout {
    pub bubble_rect: ClientRect,
    pub text_rect: ClientRect,
    pub anchor_client_point: ClientPoint,
}

pub fn layout_transcript_bubble(
    screen: ScreenBounds,
    transcript: &TranscriptBubble,
) -> BubbleLayout {
    let anchor_client_point = screen.to_client_point(transcript.anchor);
    let max_width = transcript.max_width_px.clamp(
        DEFAULT_MIN_BUBBLE_WIDTH_PX,
        screen.width as i32 - (DEFAULT_MARGIN_PX * 2).max(1),
    );

    let estimated_chars_per_line =
        ((max_width - (DEFAULT_TEXT_PADDING_PX * 2)).max(48) / 8).max(10) as usize;
    let line_count = wrapped_line_count(&transcript.text, estimated_chars_per_line).max(1);
    let estimated_text_width = (transcript
        .text
        .chars()
        .count()
        .min(estimated_chars_per_line) as i32
        * 8)
    .clamp(72, max_width - (DEFAULT_TEXT_PADDING_PX * 2));
    let bubble_width = (estimated_text_width + (DEFAULT_TEXT_PADDING_PX * 2))
        .clamp(DEFAULT_MIN_BUBBLE_WIDTH_PX, max_width);
    let bubble_height = DEFAULT_TEXT_PADDING_PX * 2 + line_count as i32 * DEFAULT_LINE_HEIGHT_PX;

    let preferred_left = anchor_client_point
        .x
        .saturating_add(DEFAULT_BUBBLE_OFFSET_X_PX);
    let preferred_top = anchor_client_point
        .y
        .saturating_sub(DEFAULT_BUBBLE_OFFSET_Y_PX);

    let max_left = (screen.width as i32)
        .saturating_sub(DEFAULT_MARGIN_PX + bubble_width)
        .max(DEFAULT_MARGIN_PX);
    let left = preferred_left.clamp(DEFAULT_MARGIN_PX, max_left);

    let max_top = (screen.height as i32)
        .saturating_sub(DEFAULT_MARGIN_PX + bubble_height)
        .max(DEFAULT_MARGIN_PX);

    let mut top = preferred_top.saturating_sub(bubble_height);
    if top < DEFAULT_MARGIN_PX {
        top = preferred_top
            .saturating_add(DEFAULT_CURSOR_RADIUS_PX * 2)
            .clamp(DEFAULT_MARGIN_PX, max_top);
    } else {
        top = top.clamp(DEFAULT_MARGIN_PX, max_top);
    }

    let bubble_rect = ClientRect {
        left,
        top,
        right: left.saturating_add(bubble_width),
        bottom: top.saturating_add(bubble_height),
    };
    let text_rect = ClientRect {
        left: bubble_rect.left.saturating_add(DEFAULT_TEXT_PADDING_PX),
        top: bubble_rect.top.saturating_add(DEFAULT_TEXT_PADDING_PX),
        right: bubble_rect.right.saturating_sub(DEFAULT_TEXT_PADDING_PX),
        bottom: bubble_rect.bottom.saturating_sub(DEFAULT_TEXT_PADDING_PX),
    };

    BubbleLayout {
        bubble_rect,
        text_rect,
        anchor_client_point,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NativeOverlayAvailability {
    Available,
    Unavailable { reason: String },
}

impl NativeOverlayAvailability {
    pub fn available(&self) -> bool {
        matches!(self, Self::Available)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayCommandError(pub String);

impl fmt::Display for OverlayCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for OverlayCommandError {}

#[cfg(target_os = "windows")]
mod imp {
    use super::*;
    use std::ffi::{c_void, OsStr};
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::{null, null_mut};
    use std::sync::{Arc, Mutex};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;

    type BOOL = i32;
    type UINT = u32;
    type DWORD = u32;
    type WORD = u16;
    type LONG = i32;
    type LPARAM = isize;
    type WPARAM = usize;
    type LRESULT = isize;
    type ATOM = WORD;
    type COLORREF = DWORD;
    type HINSTANCE = *mut c_void;
    type HWND = *mut c_void;
    type HBRUSH = *mut c_void;
    type HCURSOR = *mut c_void;
    type HICON = *mut c_void;
    type HMENU = *mut c_void;
    type HDC = *mut c_void;
    type HGDIOBJ = *mut c_void;
    type LPCWSTR = *const u16;
    type LPVOID = *mut c_void;

    const CS_HREDRAW: UINT = 0x0002;
    const CS_VREDRAW: UINT = 0x0001;
    const WS_POPUP: DWORD = 0x8000_0000;
    const WS_EX_LAYERED: DWORD = 0x0008_0000;
    const WS_EX_TRANSPARENT: DWORD = 0x0000_0020;
    const WS_EX_TOPMOST: DWORD = 0x0000_0008;
    const WS_EX_TOOLWINDOW: DWORD = 0x0000_0080;
    const WS_EX_NOACTIVATE: DWORD = 0x0800_0000;
    const SW_HIDE: i32 = 0;
    const SW_SHOWNOACTIVATE: i32 = 4;
    const LWA_COLORKEY: DWORD = 0x0000_0001;
    const LWA_ALPHA: DWORD = 0x0000_0002;
    const TRANSPARENT: i32 = 1;
    const DT_LEFT: UINT = 0x0000;
    const DT_TOP: UINT = 0x0000;
    const DT_WORDBREAK: UINT = 0x0010;
    const DT_NOPREFIX: UINT = 0x0800;
    const WM_APP: UINT = 0x8000;
    const WM_PAINT: UINT = 0x000F;
    const WM_DESTROY: UINT = 0x0002;
    const WM_NCCREATE: UINT = 0x0081;
    const WM_NCDESTROY: UINT = 0x0082;
    const WM_APP_UPDATE: UINT = WM_APP + 1;
    const WM_APP_SHUTDOWN: UINT = WM_APP + 2;
    const GWLP_USERDATA: i32 = -21;
    const SWP_NOACTIVATE: UINT = 0x0010;
    const SWP_NOOWNERZORDER: UINT = 0x0200;
    const HWND_TOPMOST: HWND = -1isize as HWND;
    const COLOR_KEY: COLORREF = rgb(255, 0, 255);
    const CURSOR_COLOR: COLORREF = rgb(0, 170, 255);
    const BUBBLE_COLOR: COLORREF = rgb(16, 24, 39);
    const TEXT_COLOR: COLORREF = rgb(255, 255, 255);

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct POINT {
        x: LONG,
        y: LONG,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RECT {
        left: LONG,
        top: LONG,
        right: LONG,
        bottom: LONG,
    }

    #[repr(C)]
    struct MSG {
        hwnd: HWND,
        message: UINT,
        wParam: WPARAM,
        lParam: LPARAM,
        time: DWORD,
        pt: POINT,
        lPrivate: DWORD,
    }

    #[repr(C)]
    struct PAINTSTRUCT {
        hdc: HDC,
        fErase: BOOL,
        rcPaint: RECT,
        fRestore: BOOL,
        fIncUpdate: BOOL,
        rgbReserved: [u8; 32],
    }

    #[repr(C)]
    struct WNDCLASSEXW {
        cbSize: UINT,
        style: UINT,
        lpfnWndProc: Option<unsafe extern "system" fn(HWND, UINT, WPARAM, LPARAM) -> LRESULT>,
        cbClsExtra: i32,
        cbWndExtra: i32,
        hInstance: HINSTANCE,
        hIcon: HICON,
        hCursor: HCURSOR,
        hbrBackground: HBRUSH,
        lpszMenuName: LPCWSTR,
        lpszClassName: LPCWSTR,
        hIconSm: HICON,
    }

    #[repr(C)]
    struct CREATESTRUCTW {
        lpCreateParams: LPVOID,
        hInstance: HINSTANCE,
        hMenu: HMENU,
        hwndParent: HWND,
        cy: i32,
        cx: i32,
        y: i32,
        x: i32,
        style: LONG,
        lpszName: LPCWSTR,
        lpszClass: LPCWSTR,
        dwExStyle: DWORD,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(module_name: LPCWSTR) -> HINSTANCE;
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterClassExW(window_class: *const WNDCLASSEXW) -> ATOM;
        fn CreateWindowExW(
            ex_style: DWORD,
            class_name: LPCWSTR,
            window_name: LPCWSTR,
            style: DWORD,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: HWND,
            menu: HMENU,
            instance: HINSTANCE,
            param: LPVOID,
        ) -> HWND;
        fn DefWindowProcW(hwnd: HWND, message: UINT, wparam: WPARAM, lparam: LPARAM) -> LRESULT;
        fn DestroyWindow(hwnd: HWND) -> BOOL;
        fn ShowWindow(hwnd: HWND, cmd_show: i32) -> BOOL;
        fn UpdateWindow(hwnd: HWND) -> BOOL;
        fn SetLayeredWindowAttributes(
            hwnd: HWND,
            color_key: COLORREF,
            alpha: u8,
            flags: DWORD,
        ) -> BOOL;
        fn PostMessageW(hwnd: HWND, message: UINT, wparam: WPARAM, lparam: LPARAM) -> BOOL;
        fn GetMessageW(message: *mut MSG, hwnd: HWND, min: UINT, max: UINT) -> BOOL;
        fn TranslateMessage(message: *const MSG) -> BOOL;
        fn DispatchMessageW(message: *const MSG) -> LRESULT;
        fn BeginPaint(hwnd: HWND, paint: *mut PAINTSTRUCT) -> HDC;
        fn EndPaint(hwnd: HWND, paint: *const PAINTSTRUCT) -> BOOL;
        fn FillRect(hdc: HDC, rect: *const RECT, brush: HBRUSH) -> i32;
        fn InvalidateRect(hwnd: HWND, rect: *const RECT, erase: BOOL) -> BOOL;
        fn SetWindowPos(
            hwnd: HWND,
            insert_after: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: UINT,
        ) -> BOOL;
        fn PostQuitMessage(exit_code: i32);
        fn SetWindowLongPtrW(hwnd: HWND, index: i32, new_long: isize) -> isize;
        fn GetWindowLongPtrW(hwnd: HWND, index: i32) -> isize;
        fn DrawTextW(hdc: HDC, text: LPCWSTR, count: i32, rect: *mut RECT, format: UINT) -> i32;
        fn SetBkMode(hdc: HDC, mode: i32) -> i32;
        fn SetTextColor(hdc: HDC, color: COLORREF) -> COLORREF;
        fn RoundRect(
            hdc: HDC,
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
            width: i32,
            height: i32,
        ) -> BOOL;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateSolidBrush(color: COLORREF) -> HBRUSH;
        fn DeleteObject(object: HGDIOBJ) -> BOOL;
        fn SelectObject(hdc: HDC, object: HGDIOBJ) -> HGDIOBJ;
        fn Ellipse(hdc: HDC, left: i32, top: i32, right: i32, bottom: i32) -> BOOL;
    }

    pub struct WindowsOverlayAdapter {
        availability: NativeOverlayAvailability,
        runtime: Option<OverlayRuntime>,
    }

    struct OverlayRuntime {
        hwnd: HWND,
        state: Arc<Mutex<SharedOverlayState>>,
        thread_handle: Option<JoinHandle<()>>,
    }

    #[derive(Clone)]
    struct SharedOverlayState {
        screen: ScreenBounds,
        frame: OverlayFrame,
    }

    struct WindowUserData {
        state: Arc<Mutex<SharedOverlayState>>,
    }

    impl WindowsOverlayAdapter {
        pub fn new(options: OverlayInitOptions) -> Self {
            match OverlayRuntime::spawn(options) {
                Ok(runtime) => Self {
                    availability: NativeOverlayAvailability::Available,
                    runtime: Some(runtime),
                },
                Err(reason) => Self {
                    availability: NativeOverlayAvailability::Unavailable { reason },
                    runtime: None,
                },
            }
        }

        pub fn availability(&self) -> &NativeOverlayAvailability {
            &self.availability
        }

        pub fn show(&self, frame: OverlayFrame) -> Result<(), OverlayCommandError> {
            self.set_frame(frame)
        }

        pub fn update(&self, frame: OverlayFrame) -> Result<(), OverlayCommandError> {
            self.set_frame(frame)
        }

        pub fn hide(&self) -> Result<(), OverlayCommandError> {
            self.set_frame(OverlayFrame::default())
        }

        fn set_frame(&self, frame: OverlayFrame) -> Result<(), OverlayCommandError> {
            let runtime = self
                .runtime
                .as_ref()
                .ok_or_else(|| OverlayCommandError("Native overlay is unavailable".to_string()))?;

            {
                let mut shared = runtime
                    .state
                    .lock()
                    .map_err(|_| OverlayCommandError("Overlay state lock poisoned".to_string()))?;
                shared.frame = frame;
            }

            let posted = unsafe { PostMessageW(runtime.hwnd, WM_APP_UPDATE, 0, 0) };
            if posted == 0 {
                return Err(OverlayCommandError(
                    "Failed to notify overlay thread".to_string(),
                ));
            }

            Ok(())
        }
    }

    impl Drop for WindowsOverlayAdapter {
        fn drop(&mut self) {
            let Some(runtime) = self.runtime.as_mut() else {
                return;
            };

            unsafe {
                PostMessageW(runtime.hwnd, WM_APP_SHUTDOWN, 0, 0);
            }

            if let Some(handle) = runtime.thread_handle.take() {
                let _ = handle.join();
            }
        }
    }

    impl OverlayRuntime {
        fn spawn(options: OverlayInitOptions) -> Result<Self, String> {
            let shared_state = Arc::new(Mutex::new(SharedOverlayState {
                screen: options.screen,
                frame: OverlayFrame::default(),
            }));
            let (init_tx, init_rx) = std::sync::mpsc::sync_channel(1);
            let state_for_thread = Arc::clone(&shared_state);
            let class_name = options.class_name.clone();
            let window_title = options.window_title.clone();
            let screen = options.screen;

            let thread_handle = thread::spawn(move || {
                let result = unsafe {
                    overlay_thread_main(state_for_thread, screen, class_name, window_title)
                };
                let _ = init_tx.send(result);
            });

            match init_rx.recv_timeout(Duration::from_secs(3)) {
                Ok(Ok(hwnd)) => Ok(Self {
                    hwnd,
                    state: shared_state,
                    thread_handle: Some(thread_handle),
                }),
                Ok(Err(reason)) => {
                    let _ = thread_handle.join();
                    Err(reason)
                }
                Err(_) => Err("Timed out initializing native overlay window".to_string()),
            }
        }
    }

    unsafe fn overlay_thread_main(
        state: Arc<Mutex<SharedOverlayState>>,
        screen: ScreenBounds,
        class_name: String,
        window_title: String,
    ) -> Result<HWND, String> {
        let instance = GetModuleHandleW(null());
        if instance.is_null() {
            return Err("GetModuleHandleW failed".to_string());
        }

        let class_name_w = utf16(&class_name);
        let window_title_w = utf16(&window_title);
        let class = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null(),
            lpszClassName: class_name_w.as_ptr(),
            hIconSm: null_mut(),
        };

        if RegisterClassExW(&class) == 0 {
            return Err("RegisterClassExW failed for overlay window".to_string());
        }

        let user_data = Box::new(WindowUserData { state });
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name_w.as_ptr(),
            window_title_w.as_ptr(),
            WS_POPUP,
            screen.origin_x,
            screen.origin_y,
            screen.width as i32,
            screen.height as i32,
            null_mut(),
            null_mut(),
            instance,
            Box::into_raw(user_data) as LPVOID,
        );

        if hwnd.is_null() {
            return Err("CreateWindowExW failed for overlay window".to_string());
        }

        if SetLayeredWindowAttributes(hwnd, COLOR_KEY, 255, LWA_COLORKEY | LWA_ALPHA) == 0 {
            DestroyWindow(hwnd);
            return Err("SetLayeredWindowAttributes failed".to_string());
        }

        ShowWindow(hwnd, SW_HIDE);
        UpdateWindow(hwnd);

        let mut message: MSG = zeroed();
        loop {
            let result = GetMessageW(&mut message, null_mut(), 0, 0);
            if result == 0 {
                break;
            }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }

        Ok(hwnd)
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: UINT,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match message {
            WM_NCCREATE => {
                let create_struct = &*(lparam as *const CREATESTRUCTW);
                let user_data = create_struct.lpCreateParams as *mut WindowUserData;
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, user_data as isize);
                1
            }
            WM_APP_UPDATE => {
                if let Some(user_data) = get_user_data(hwnd) {
                    if let Ok(shared) = user_data.state.lock() {
                        let screen = shared.screen;
                        SetWindowPos(
                            hwnd,
                            HWND_TOPMOST,
                            screen.origin_x,
                            screen.origin_y,
                            screen.width as i32,
                            screen.height as i32,
                            SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                        );
                        if shared.frame.visible() {
                            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                        } else {
                            ShowWindow(hwnd, SW_HIDE);
                        }
                        InvalidateRect(hwnd, null(), 1);
                    }
                }
                0
            }
            WM_APP_SHUTDOWN => {
                DestroyWindow(hwnd);
                0
            }
            WM_PAINT => {
                paint_overlay(hwnd);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            WM_NCDESTROY => {
                let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
                if raw != 0 {
                    let _ = Box::from_raw(raw as *mut WindowUserData);
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                }
                DefWindowProcW(hwnd, message, wparam, lparam)
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }

    unsafe fn paint_overlay(hwnd: HWND) {
        let mut paint: PAINTSTRUCT = zeroed();
        let hdc = BeginPaint(hwnd, &mut paint);
        if hdc.is_null() {
            return;
        }

        let Some(user_data) = get_user_data(hwnd) else {
            EndPaint(hwnd, &paint);
            return;
        };

        let shared = match user_data.state.lock() {
            Ok(shared) => shared.clone(),
            Err(_) => {
                EndPaint(hwnd, &paint);
                return;
            }
        };

        let background_brush = CreateSolidBrush(COLOR_KEY);
        FillRect(
            hdc,
            &client_rect_to_win32(ClientRect {
                left: 0,
                top: 0,
                right: shared.screen.width as i32,
                bottom: shared.screen.height as i32,
            }),
            background_brush,
        );
        DeleteObject(background_brush as HGDIOBJ);

        if let Some(cursor) = &shared.frame.cursor {
            draw_cursor(hdc, shared.screen, cursor);
        }
        if let Some(transcript) = &shared.frame.transcript {
            draw_transcript(hdc, shared.screen, transcript);
        }

        EndPaint(hwnd, &paint);
    }

    unsafe fn draw_cursor(hdc: HDC, screen: ScreenBounds, cursor: &CursorPoint) {
        let client_point = screen.to_client_point(cursor.point);
        let radius = cursor.radius_px.max(2);
        let brush = CreateSolidBrush(CURSOR_COLOR);
        let previous = SelectObject(hdc, brush as HGDIOBJ);
        Ellipse(
            hdc,
            client_point.x - radius,
            client_point.y - radius,
            client_point.x + radius,
            client_point.y + radius,
        );
        SelectObject(hdc, previous);
        DeleteObject(brush as HGDIOBJ);
    }

    unsafe fn draw_transcript(hdc: HDC, screen: ScreenBounds, transcript: &TranscriptBubble) {
        let layout = layout_transcript_bubble(screen, transcript);
        let bubble_brush = CreateSolidBrush(BUBBLE_COLOR);
        let previous = SelectObject(hdc, bubble_brush as HGDIOBJ);
        RoundRect(
            hdc,
            layout.bubble_rect.left,
            layout.bubble_rect.top,
            layout.bubble_rect.right,
            layout.bubble_rect.bottom,
            16,
            16,
        );
        SelectObject(hdc, previous);
        DeleteObject(bubble_brush as HGDIOBJ);

        let text = utf16(&transcript.text);
        let mut text_rect = client_rect_to_win32(layout.text_rect);
        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, TEXT_COLOR);
        DrawTextW(
            hdc,
            text.as_ptr(),
            -1,
            &mut text_rect,
            DT_LEFT | DT_TOP | DT_WORDBREAK | DT_NOPREFIX,
        );
    }

    unsafe fn get_user_data<'a>(hwnd: HWND) -> Option<&'a mut WindowUserData> {
        let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if raw == 0 {
            None
        } else {
            Some(&mut *(raw as *mut WindowUserData))
        }
    }

    fn utf16(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    const fn rgb(red: u8, green: u8, blue: u8) -> COLORREF {
        red as COLORREF | ((green as COLORREF) << 8) | ((blue as COLORREF) << 16)
    }

    fn client_rect_to_win32(rect: ClientRect) -> RECT {
        RECT {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::*;

    pub struct WindowsOverlayAdapter {
        availability: NativeOverlayAvailability,
    }

    impl WindowsOverlayAdapter {
        pub fn new(_options: OverlayInitOptions) -> Self {
            Self {
                availability: NativeOverlayAvailability::Unavailable {
                    reason: "Native overlay is only available on Windows.".to_string(),
                },
            }
        }

        pub fn availability(&self) -> &NativeOverlayAvailability {
            &self.availability
        }

        pub fn show(&self, _frame: OverlayFrame) -> Result<(), OverlayCommandError> {
            Err(OverlayCommandError(
                "Native overlay is unavailable on this platform".to_string(),
            ))
        }

        pub fn update(&self, _frame: OverlayFrame) -> Result<(), OverlayCommandError> {
            Err(OverlayCommandError(
                "Native overlay is unavailable on this platform".to_string(),
            ))
        }

        pub fn hide(&self) -> Result<(), OverlayCommandError> {
            Err(OverlayCommandError(
                "Native overlay is unavailable on this platform".to_string(),
            ))
        }
    }
}

pub use imp::WindowsOverlayAdapter;

fn sanitize_text(value: &str, max_len: usize) -> String {
    value.trim().chars().take(max_len).collect()
}

fn wrapped_line_count(text: &str, chars_per_line: usize) -> usize {
    if text.trim().is_empty() {
        return 1;
    }

    text.lines()
        .map(|line| {
            let len = line.chars().count().max(1);
            ((len - 1) / chars_per_line.max(1)) + 1
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_layout_clamps_inside_screen() {
        let screen = ScreenBounds::new(100, 200, 320, 200);
        let transcript = TranscriptBubble::new(
            ScreenPoint { x: 410, y: 390 },
            "Click the bevel modifier on the right side of the stack.",
        );

        let layout = layout_transcript_bubble(screen, &transcript);

        assert!(layout.bubble_rect.left >= DEFAULT_MARGIN_PX);
        assert!(layout.bubble_rect.top >= DEFAULT_MARGIN_PX);
        assert!(layout.bubble_rect.right <= screen.width as i32 - DEFAULT_MARGIN_PX);
        assert!(layout.bubble_rect.bottom <= screen.height as i32 - DEFAULT_MARGIN_PX);
    }

    #[test]
    fn transcript_layout_flips_below_anchor_when_needed() {
        let screen = ScreenBounds::new(0, 0, 420, 240);
        let transcript = TranscriptBubble::new(ScreenPoint { x: 20, y: 12 }, "Short hint.");

        let layout = layout_transcript_bubble(screen, &transcript);
        assert!(layout.bubble_rect.top > layout.anchor_client_point.y);
    }

    #[test]
    fn screen_bounds_clamp_and_client_conversion_respect_origin() {
        let screen = ScreenBounds::new(300, 400, 500, 300);
        let clamped = screen.clamp(ScreenPoint { x: 1200, y: 200 });
        assert_eq!(clamped, ScreenPoint { x: 799, y: 400 });

        let client = screen.to_client_point(ScreenPoint { x: 340, y: 455 });
        assert_eq!(client, ClientPoint { x: 40, y: 55 });
    }
}
