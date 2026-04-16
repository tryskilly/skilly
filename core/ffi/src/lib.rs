//! FFI boundary crate.
//!
//! This crate will expose a stable bridge layer for native platform shells
//! (Swift on macOS, WinUI/.NET on Windows, GTK on Linux).
//!
//! Initial scaffold intentionally keeps the API surface small until policy
//! extraction is fully integrated and validated.

pub use skilly_core_domain as domain;
pub use skilly_core_policy as policy;

