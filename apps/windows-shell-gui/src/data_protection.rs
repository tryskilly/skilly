use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub struct DataProtectionError(String);

impl Display for DataProtectionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for DataProtectionError {}

#[cfg(target_os = "windows")]
pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, DataProtectionError> {
    dpapi(plaintext, true)
}

#[cfg(target_os = "windows")]
pub fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, DataProtectionError> {
    dpapi(ciphertext, false)
}

#[cfg(target_os = "windows")]
fn dpapi(input: &[u8], encrypt: bool) -> Result<Vec<u8>, DataProtectionError> {
    use std::ffi::c_void;
    #[repr(C)]
    struct DataBlob {
        size: u32,
        data: *mut u8,
    }
    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut DataBlob,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
        fn GetLastError() -> u32;
    }
    if input.is_empty() || input.len() > u32::MAX as usize {
        return Err(DataProtectionError(
            "invalid protected data length".to_owned(),
        ));
    }
    let input_blob = DataBlob {
        size: input.len() as u32,
        data: input.as_ptr().cast_mut(),
    };
    let mut output = DataBlob {
        size: 0,
        data: std::ptr::null_mut(),
    };
    let succeeded = unsafe {
        if encrypt {
            CryptProtectData(
                &input_blob,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input_blob,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        }
    };
    if succeeded == 0 {
        return Err(DataProtectionError(format!(
            "Windows data protection failed with error {}",
            unsafe { GetLastError() }
        )));
    }
    let protected =
        unsafe { std::slice::from_raw_parts(output.data, output.size as usize) }.to_vec();
    unsafe { LocalFree(output.data.cast()) };
    Ok(protected)
}

#[cfg(not(target_os = "windows"))]
pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, DataProtectionError> {
    Ok(plaintext.to_vec())
}

#[cfg(not(target_os = "windows"))]
pub fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, DataProtectionError> {
    Ok(ciphertext.to_vec())
}
