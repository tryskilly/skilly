use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{Display, Formatter};
use std::sync::Mutex;

const CRED_TYPE_GENERIC: u32 = 1;
const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;
const CRED_MAX_CREDENTIAL_BLOB_SIZE: usize = 5 * 512;
const ERROR_NOT_FOUND: u32 = 1168;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialStoreError {
    InvalidArgument(&'static str),
    Serialization(String),
    Os(String),
    NotSupported(&'static str),
}

impl Display for CredentialStoreError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            CredentialStoreError::InvalidArgument(message)
            | CredentialStoreError::NotSupported(message) => formatter.write_str(message),
            CredentialStoreError::Serialization(message) | CredentialStoreError::Os(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl std::error::Error for CredentialStoreError {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialEntry {
    pub target_name: String,
    pub user_name: Option<String>,
    pub secret: Vec<u8>,
}

impl CredentialEntry {
    pub fn new(
        target_name: impl Into<String>,
        user_name: Option<String>,
        secret: Vec<u8>,
    ) -> Result<Self, CredentialStoreError> {
        let target_name = target_name.into();
        if target_name.trim().is_empty() {
            return Err(CredentialStoreError::InvalidArgument(
                "credential target name is required",
            ));
        }
        if secret.is_empty() {
            return Err(CredentialStoreError::InvalidArgument(
                "credential secret is required",
            ));
        }
        if secret.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE {
            return Err(CredentialStoreError::InvalidArgument(
                "credential secret exceeds the Windows Credential Manager size limit",
            ));
        }
        Ok(Self {
            target_name,
            user_name,
            secret,
        })
    }
}

impl Drop for CredentialEntry {
    fn drop(&mut self) {
        for byte in &mut self.secret {
            *byte = 0;
        }
    }
}

pub trait CredentialStore {
    fn save(&self, entry: &CredentialEntry) -> Result<(), CredentialStoreError>;
    fn load(&self, target_name: &str) -> Result<Option<CredentialEntry>, CredentialStoreError>;
    fn delete(&self, target_name: &str) -> Result<(), CredentialStoreError>;

    fn save_json<T: Serialize>(
        &self,
        target_name: &str,
        user_name: Option<String>,
        value: &T,
    ) -> Result<(), CredentialStoreError> {
        let secret = serde_json::to_vec(value).map_err(|error| {
            CredentialStoreError::Serialization(format!(
                "failed to serialize credential json: {error}"
            ))
        })?;
        let entry = CredentialEntry::new(target_name, user_name, secret)?;
        self.save(&entry)
    }

    fn load_json<T: DeserializeOwned>(
        &self,
        target_name: &str,
    ) -> Result<Option<T>, CredentialStoreError> {
        let Some(entry) = self.load(target_name)? else {
            return Ok(None);
        };
        serde_json::from_slice::<T>(&entry.secret)
            .map(Some)
            .map_err(|error| {
                CredentialStoreError::Serialization(format!(
                    "failed to parse credential json: {error}"
                ))
            })
    }
}

#[cfg(target_os = "windows")]
#[derive(Default)]
pub struct WindowsCredentialStore;

#[cfg(target_os = "windows")]
impl CredentialStore for WindowsCredentialStore {
    fn save(&self, entry: &CredentialEntry) -> Result<(), CredentialStoreError> {
        let target_name = to_utf16(&entry.target_name);
        let user_name = entry.user_name.as_deref().map(to_utf16);

        let mut credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target_name.as_ptr() as *mut u16,
            Comment: std::ptr::null_mut(),
            LastWritten: FILETIME::default(),
            CredentialBlobSize: entry.secret.len() as u32,
            CredentialBlob: entry.secret.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: user_name
                .as_ref()
                .map(|value| value.as_ptr() as *mut u16)
                .unwrap_or(std::ptr::null_mut()),
        };

        let ok = unsafe { CredWriteW(&mut credential, 0) };
        if ok == 0 {
            return Err(CredentialStoreError::Os(format!(
                "CredWriteW failed with Win32 error {}",
                unsafe { GetLastError() }
            )));
        }
        Ok(())
    }

    fn load(&self, target_name: &str) -> Result<Option<CredentialEntry>, CredentialStoreError> {
        if target_name.trim().is_empty() {
            return Err(CredentialStoreError::InvalidArgument(
                "credential target name is required",
            ));
        }

        let target_name = to_utf16(target_name);
        let mut credential_ptr: *mut CREDENTIALW = std::ptr::null_mut();
        let ok = unsafe {
            CredReadW(
                target_name.as_ptr(),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            )
        };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            if error == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(CredentialStoreError::Os(format!(
                "CredReadW failed with Win32 error {error}"
            )));
        }

        let credential = unsafe { &*credential_ptr };
        let secret = unsafe {
            std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            )
        }
        .to_vec();
        let entry = CredentialEntry::new(
            from_utf16_ptr(credential.TargetName),
            nullable_utf16_ptr(credential.UserName),
            secret,
        )?;
        unsafe { CredFree(credential_ptr.cast()) };
        Ok(Some(entry))
    }

    fn delete(&self, target_name: &str) -> Result<(), CredentialStoreError> {
        if target_name.trim().is_empty() {
            return Err(CredentialStoreError::InvalidArgument(
                "credential target name is required",
            ));
        }
        let target_name = to_utf16(target_name);
        let ok = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            if error == ERROR_NOT_FOUND {
                return Ok(());
            }
            return Err(CredentialStoreError::Os(format!(
                "CredDeleteW failed with Win32 error {error}"
            )));
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
#[derive(Default)]
pub struct WindowsCredentialStore;

#[cfg(not(target_os = "windows"))]
impl CredentialStore for WindowsCredentialStore {
    fn save(&self, _entry: &CredentialEntry) -> Result<(), CredentialStoreError> {
        Err(CredentialStoreError::NotSupported(
            "Windows Credential Manager is only available on Windows",
        ))
    }

    fn load(&self, _target_name: &str) -> Result<Option<CredentialEntry>, CredentialStoreError> {
        Err(CredentialStoreError::NotSupported(
            "Windows Credential Manager is only available on Windows",
        ))
    }

    fn delete(&self, _target_name: &str) -> Result<(), CredentialStoreError> {
        Err(CredentialStoreError::NotSupported(
            "Windows Credential Manager is only available on Windows",
        ))
    }
}

#[derive(Default)]
pub struct InMemoryCredentialStore {
    entries: Mutex<HashMap<String, CredentialEntry>>,
}

impl CredentialStore for InMemoryCredentialStore {
    fn save(&self, entry: &CredentialEntry) -> Result<(), CredentialStoreError> {
        self.entries
            .lock()
            .map_err(|_| {
                CredentialStoreError::Os("in-memory credential store lock poisoned".to_owned())
            })?
            .insert(entry.target_name.clone(), entry.clone());
        Ok(())
    }

    fn load(&self, target_name: &str) -> Result<Option<CredentialEntry>, CredentialStoreError> {
        Ok(self
            .entries
            .lock()
            .map_err(|_| {
                CredentialStoreError::Os("in-memory credential store lock poisoned".to_owned())
            })?
            .get(target_name)
            .cloned())
    }

    fn delete(&self, target_name: &str) -> Result<(), CredentialStoreError> {
        self.entries
            .lock()
            .map_err(|_| {
                CredentialStoreError::Os("in-memory credential store lock poisoned".to_owned())
            })?
            .remove(target_name);
        Ok(())
    }
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Default)]
struct FILETIME {
    dwLowDateTime: u32,
    dwHighDateTime: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct CREDENTIAL_ATTRIBUTEW {
    Keyword: *mut u16,
    Flags: u32,
    ValueSize: u32,
    Value: *mut u8,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct CREDENTIALW {
    Flags: u32,
    Type: u32,
    TargetName: *mut u16,
    Comment: *mut u16,
    LastWritten: FILETIME,
    CredentialBlobSize: u32,
    CredentialBlob: *mut u8,
    Persist: u32,
    AttributeCount: u32,
    Attributes: *mut CREDENTIAL_ATTRIBUTEW,
    TargetAlias: *mut u16,
    UserName: *mut u16,
}

#[cfg(target_os = "windows")]
#[link(name = "advapi32")]
extern "system" {
    fn CredWriteW(credential: *mut CREDENTIALW, flags: u32) -> i32;
    fn CredReadW(
        target_name: *const u16,
        credential_type: u32,
        flags: u32,
        credential: *mut *mut CREDENTIALW,
    ) -> i32;
    fn CredDeleteW(target_name: *const u16, credential_type: u32, flags: u32) -> i32;
    fn CredFree(buffer: *mut std::ffi::c_void);
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn GetLastError() -> u32;
}

#[cfg(target_os = "windows")]
fn to_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn nullable_utf16_ptr(pointer: *mut u16) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    Some(from_utf16_ptr(pointer))
}

#[cfg(target_os = "windows")]
fn from_utf16_ptr(pointer: *mut u16) -> String {
    if pointer.is_null() {
        return String::new();
    }
    let mut length = 0usize;
    unsafe {
        while *pointer.add(length) != 0 {
            length += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(pointer, length))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    struct SessionPayload {
        user_id: String,
        email: String,
    }

    #[test]
    fn in_memory_store_roundtrips_binary_credentials() {
        let store = InMemoryCredentialStore::default();
        let entry = CredentialEntry::new(
            "skilly/windows/session",
            Some("person@example.com".to_owned()),
            vec![1, 2, 3, 4],
        )
        .expect("entry");

        store.save(&entry).expect("save");
        let loaded = store.load("skilly/windows/session").expect("load");
        assert_eq!(loaded, Some(entry));

        store.delete("skilly/windows/session").expect("delete");
        assert_eq!(store.load("skilly/windows/session").expect("load"), None);
    }

    #[test]
    fn in_memory_store_roundtrips_json_payloads() {
        let store = InMemoryCredentialStore::default();
        let payload = SessionPayload {
            user_id: "user_123".to_owned(),
            email: "person@example.com".to_owned(),
        };

        store
            .save_json("skilly/windows/auth", Some(payload.email.clone()), &payload)
            .expect("save json");
        let loaded: Option<SessionPayload> =
            store.load_json("skilly/windows/auth").expect("load json");
        assert_eq!(loaded, Some(payload));
    }

    #[test]
    fn credential_entry_rejects_invalid_inputs() {
        assert!(matches!(
            CredentialEntry::new("", None, vec![1]),
            Err(CredentialStoreError::InvalidArgument(_))
        ));
        assert!(matches!(
            CredentialEntry::new("target", None, vec![]),
            Err(CredentialStoreError::InvalidArgument(_))
        ));
    }
}
