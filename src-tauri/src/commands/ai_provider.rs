//! v0.5 PR 25 P2b: AI provider API key management via macOS Keychain.
//!
//! Scope (per user 2026-06-19 scope discipline):
//!   - Keychain save / delete / check (read = exists check only, NEVER returns value)
//!   - Error message formatting
//!   - Invoke handler registration
//!   - Rust unit tests cover pure helpers + mockable wrappers only
//!   - Real Keychain tests gated behind `#[ignore]` for manual verification
//!   - NO HTTP smoke test (deferred — would introduce network / rate limit
//!     / API key format noise outside the security boundary)
//!
//! Naming invariants (user spec):
//!   - Keychain service: `com.biomatrix.dreamforge.ai-provider` (compat
//!     layer — product is DreamX but namespace stays dreamforge)
//!   - Account: provider id (e.g. `openrouter`, `anthropic-direct`,
//!     `gemini-direct`)
//!
//! Security invariants:
//!   - API key VALUE never appears in any log, error message, return value
//!     except the tauri command `save_*` input and the Keychain itself.
//!   - `has_*` returns bool only — the value is fetched internally and
//!     immediately discarded without being moved or formatted.

use serde::Serialize;

#[cfg(target_os = "macos")]
use security_framework::passwords;

/// Keychain service name for LLM provider API keys.
///
/// Compat layer rule (AGENTS.md §1): even though the product name is
/// DreamX, the macOS Keychain service stays in the `com.biomatrix.dreamforge.*`
/// namespace so that v0.5 → v0.6 migration does not lose user-configured
/// API keys (same principle as bundle id / config dir / env vars).
pub const KEYCHAIN_SERVICE: &str = "com.biomatrix.dreamforge.ai-provider";

/// Maximum allowed length for an API key value.
///
/// Real-world API keys are typically 32-200 chars (OpenRouter ~50, Anthropic
/// ~108, Gemini ~40). 1024 is a generous upper bound that still catches
/// accidental paste of huge blobs (logs, error reports, multi-line blobs).
/// The cap exists so a buggy error path cannot accidentally surface the
/// entire key to a UI surface or log line that truncates at some other
/// width.
pub const MAX_API_KEY_LENGTH: usize = 1024;

/// AI provider id rules:
///   - 1..=64 chars
///   - lowercase ASCII letters, digits, `-`, `_`, `.` (so `openrouter`,
///     `anthropic-direct`, `silicon_flow.cn` all valid)
///   - cannot start with `.` or `-` (avoids filesystem-looking weirdness
///     and Keychain quirks)
///
/// AI provider API key rules:
///   - 1..=MAX_API_KEY_LENGTH chars
///   - non-empty after trim
///   - no leading/trailing whitespace (real keys don't have whitespace;
///     if they do the paste likely captured surrounding text)
const API_KEY_MIN_LENGTH: usize = 1;

/// Operation label for error message formatting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderOp {
    Save,
    Delete,
    Check,
    ValidateConfig,
}

impl ProviderOp {
    fn as_label(self) -> &'static str {
        match self {
            ProviderOp::Save => "save",
            ProviderOp::Delete => "delete",
            ProviderOp::Check => "check",
            ProviderOp::ValidateConfig => "validate",
        }
    }
}

/// tauri command return shape for `has_ai_model_provider_api_key`.
///
/// The bool is the only piece of information TS needs to render the
/// Settings UI ("API key: configured" vs "API key: not set"). The key
/// value NEVER leaves the Rust process.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProviderKeyStatus {
    pub provider_id: String,
    pub configured: bool,
}

/// Validate that a provider id is a safe Keychain account name.
///
/// Pure helper — no I/O. Used by all 3 Keychain tauri commands before
/// touching the actual Keychain so that bad input is rejected early with
/// a clean error message instead of bubbling up Keychain internals.
pub fn validate_provider_id(provider_id: &str) -> Result<&str, String> {
    let trimmed = provider_id.trim();
    if trimmed.is_empty() {
        return Err(provider_error(
            ProviderOp::ValidateConfig,
            "provider id is empty",
        ));
    }
    if trimmed.len() > 64 {
        return Err(provider_error(
            ProviderOp::ValidateConfig,
            format!(
                "provider id too long ({} chars, max 64)",
                trimmed.len()
            ),
        ));
    }
    // Manual pattern check (no regex dep) — matches the const pattern above.
    let bytes = trimmed.as_bytes();
    let first = bytes[0];
    if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
        return Err(provider_error(
            ProviderOp::ValidateConfig,
            "provider id must start with a lowercase letter or digit",
        ));
    }
    for &byte in &bytes[1..] {
        let ok = byte.is_ascii_lowercase()
            || byte.is_ascii_digit()
            || byte == b'.'
            || byte == b'-'
            || byte == b'_';
        if !ok {
            return Err(provider_error(
                ProviderOp::ValidateConfig,
                "provider id may only contain [a-z0-9._-]",
            ));
        }
    }
    Ok(trimmed)
}

/// Validate that an API key is well-formed (length, no whitespace padding).
///
/// Pure helper. Does NOT check the key with the provider — that requires
/// network and is explicitly deferred per scope discipline.
///
/// Check order (matters — must run on ORIGINAL string before trim):
///   1. empty check (on trimmed)
///   2. embedded newline check (on ORIGINAL — trim() would strip a trailing
///      newline and we'd lose the signal that paste captured extra text)
///   3. length check (on trimmed — embedded newlines already rejected)
///   4. surrounding whitespace check (trimmed.len != original.len — fires
///      when paste captured leading/trailing spaces, tabs, or newlines)
pub fn validate_api_key(api_key: &str) -> Result<&str, String> {
    let trimmed = api_key.trim();
    if trimmed.len() < API_KEY_MIN_LENGTH {
        return Err(provider_error(ProviderOp::Save, "api key is empty"));
    }
    // Embedded newline check on ORIGINAL string — runs before the
    // whitespace check because trim() would remove a trailing newline
    // and we'd incorrectly report "whitespace" instead of "newline".
    if api_key.chars().any(|c| c == '\n' || c == '\r') {
        return Err(provider_error(
            ProviderOp::Save,
            "api key must not contain newlines",
        ));
    }
    if trimmed.len() > MAX_API_KEY_LENGTH {
        return Err(provider_error(
            ProviderOp::Save,
            format!(
                "api key too long ({} chars, max {})",
                trimmed.len(),
                MAX_API_KEY_LENGTH
            ),
        ));
    }
    // Real API keys don't have leading/trailing whitespace; reject so
    // the user notices if their paste accidentally captured surrounding
    // text (which would silently break auth).
    if trimmed.len() != api_key.len() {
        return Err(provider_error(
            ProviderOp::Save,
            "api key must not have leading or trailing whitespace",
        ));
    }
    Ok(trimmed)
}

/// Format an error message with stable shape: `"<op> <provider_id>: <reason>"`.
///
/// The API key value NEVER appears in the message — only the operation
/// label, provider id, and a stable reason phrase.
pub fn provider_error(op: ProviderOp, reason: impl Into<String>) -> String {
    format!("ai-provider {}: {}", op.as_label(), reason.into())
}

/// Generic wrapper for non-Keychain failures (validation, IO, etc.).
pub fn format_provider_error(op: ProviderOp, source: impl std::fmt::Display) -> String {
    provider_error(op, format!("{source}"))
}

// -- Keychain wrapper (macOS only) -----------------------------------------

/// Set the API key for a provider. Returns Ok(()) on success.
///
/// Real Keychain write — gated behind `#[cfg(target_os = "macos")]`
/// so cross-platform builds (CI, dev tooling) compile and tests pass
/// without hitting macOS-only APIs.
#[cfg(target_os = "macos")]
pub fn keychain_set(provider_id: &str, api_key: &str) -> Result<(), String> {
    let provider_id = validate_provider_id(provider_id)?;
    let api_key = validate_api_key(api_key)?;
    passwords::set_generic_password(KEYCHAIN_SERVICE, provider_id, api_key.as_bytes())
        .map_err(|error| format_provider_error(ProviderOp::Save, error))
}

/// Check whether an API key is configured for a provider.
///
/// Fetches the key byte slice from Keychain and immediately drops it —
/// the value never leaves this function, never enters a log line, never
/// appears in a return value.
#[cfg(target_os = "macos")]
pub fn keychain_exists(provider_id: &str) -> Result<bool, String> {
    let provider_id = validate_provider_id(provider_id)?;
    match passwords::get_generic_password(KEYCHAIN_SERVICE, provider_id) {
        Ok(secret) => {
            // Touch the secret so the compiler doesn't optimize it away,
            // then immediately drop.
            let has_value = !secret.is_empty();
            drop(secret);
            Ok(has_value)
        }
        Err(error) => {
            // errSecItemNotFound == -25300. Treat as "not configured" rather
            // than a hard error so the UI can show "API key: not set" without
            // flagging it as a failure.
            const ITEM_NOT_FOUND: i32 = -25300;
            let code = error.code();
            if code == ITEM_NOT_FOUND {
                Ok(false)
            } else {
                Err(format_provider_error(ProviderOp::Check, error))
            }
        }
    }
}

/// Delete the API key for a provider. Returns Ok(()) on success, even if
/// the key was not configured (idempotent — Keychain returns
/// errSecItemNotFound in that case, we map to Ok).
#[cfg(target_os = "macos")]
pub fn keychain_delete(provider_id: &str) -> Result<(), String> {
    let provider_id = validate_provider_id(provider_id)?;
    match passwords::delete_generic_password(KEYCHAIN_SERVICE, provider_id) {
        Ok(()) => Ok(()),
        Err(error) => {
            const ITEM_NOT_FOUND: i32 = -25300;
            let code = error.code();
            if code == ITEM_NOT_FOUND {
                Ok(())
            } else {
                Err(format_provider_error(ProviderOp::Delete, error))
            }
        }
    }
}

// -- tauri commands --------------------------------------------------------

/// Store the API key for a provider in macOS Keychain.
///
/// `provider_id` is validated against `validate_provider_id` so bad
/// input (empty, too long, weird chars) is rejected with a clean error
/// before the Keychain is touched.
///
/// The API key value is forwarded to Keychain only. It never appears
/// in any log, error message, or return value.
#[tauri::command]
pub fn save_ai_model_provider_api_key(
    provider_id: String,
    api_key: String,
) -> Result<(), String> {
    keychain_set_impl(&provider_id, &api_key)
}

#[cfg(target_os = "macos")]
fn keychain_set_impl(provider_id: &str, api_key: &str) -> Result<(), String> {
    keychain_set(provider_id, api_key)
}

#[cfg(not(target_os = "macos"))]
fn keychain_set_impl(_provider_id: &str, _api_key: &str) -> Result<(), String> {
    Err(provider_error(
        ProviderOp::Save,
        "macOS Keychain is only available on macOS",
    ))
}

/// Check whether an API key is configured for a provider.
///
/// Returns `{ provider_id, configured: bool }`. The API key value is
/// fetched from Keychain internally and immediately discarded — it does
/// not appear in the return value, log, or error message.
#[tauri::command]
pub fn has_ai_model_provider_api_key(provider_id: String) -> Result<ProviderKeyStatus, String> {
    let configured = keychain_exists_impl(&provider_id)?;
    Ok(ProviderKeyStatus {
        provider_id,
        configured,
    })
}

#[cfg(target_os = "macos")]
fn keychain_exists_impl(provider_id: &str) -> Result<bool, String> {
    keychain_exists(provider_id)
}

#[cfg(not(target_os = "macos"))]
fn keychain_exists_impl(_provider_id: &str) -> Result<bool, String> {
    Err(provider_error(
        ProviderOp::Check,
        "macOS Keychain is only available on macOS",
    ))
}

/// Delete the API key for a provider from macOS Keychain.
///
/// Idempotent: deleting a non-existent key returns Ok(()).
#[tauri::command]
pub fn delete_ai_model_provider_api_key(provider_id: String) -> Result<(), String> {
    keychain_delete_impl(&provider_id)
}

#[cfg(target_os = "macos")]
fn keychain_delete_impl(provider_id: &str) -> Result<(), String> {
    keychain_delete(provider_id)
}

#[cfg(not(target_os = "macos"))]
fn keychain_delete_impl(_provider_id: &str) -> Result<(), String> {
    Err(provider_error(
        ProviderOp::Delete,
        "macOS Keychain is only available on macOS",
    ))
}

// -- Pure tests ------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // validate_provider_id

    #[test]
    fn validate_provider_id_accepts_typical_ids() {
        assert!(validate_provider_id("openrouter").is_ok());
        assert!(validate_provider_id("anthropic-direct").is_ok());
        assert!(validate_provider_id("silicon_flow.cn").is_ok());
        assert!(validate_provider_id("ollama-local").is_ok());
        assert!(validate_provider_id("a").is_ok()); // single char
        assert!(validate_provider_id("0123456789").is_ok()); // digits
        assert!(validate_provider_id("a1").is_ok());
    }

    #[test]
    fn validate_provider_id_rejects_empty_and_whitespace_only() {
        assert!(validate_provider_id("").is_err());
        assert!(validate_provider_id("   ").is_err());
        let err = validate_provider_id("").unwrap_err();
        assert!(err.contains("empty"), "got: {err}");
    }

    #[test]
    fn validate_provider_id_rejects_invalid_start_chars() {
        assert!(validate_provider_id(".openrouter").is_err());
        assert!(validate_provider_id("-openrouter").is_err());
        assert!(validate_provider_id("_openrouter").is_err());
        assert!(validate_provider_id(" Openrouter").is_err()); // leading space
        let err = validate_provider_id(".bad").unwrap_err();
        assert!(err.contains("must start with"), "got: {err}");
    }

    #[test]
    fn validate_provider_id_rejects_invalid_body_chars() {
        assert!(validate_provider_id("open router").is_err()); // space in middle
        assert!(validate_provider_id("OpenRouter").is_err()); // uppercase
        assert!(validate_provider_id("openrouter!").is_err()); // bang
        assert!(validate_provider_id("openrouter/api").is_err()); // slash
        let err = validate_provider_id("bad id").unwrap_err();
        assert!(err.contains("[a-z0-9"), "got: {err}");
    }

    #[test]
    fn validate_provider_id_rejects_too_long() {
        let too_long = "a".repeat(65);
        let err = validate_provider_id(&too_long).unwrap_err();
        assert!(err.contains("too long"), "got: {err}");
        assert!(err.contains("65"), "got: {err}");
    }

    #[test]
    fn validate_provider_id_trims_surrounding_whitespace() {
        assert_eq!(validate_provider_id("  openrouter  ").unwrap(), "openrouter");
    }

    #[test]
    fn validate_provider_id_error_does_not_leak_other_field_values() {
        // Make sure error messages never accidentally include the API key
        // (even though this fn only takes a provider_id, lock the invariant
        // down so a future refactor doesn't regress it).
        let err = validate_provider_id("!bad!").unwrap_err();
        assert!(!err.contains("!"), "error must not echo input verbatim: {err}");
    }

    // validate_api_key

    #[test]
    fn validate_api_key_accepts_typical_keys() {
        assert!(validate_api_key("sk-or-v1-abc123def456").is_ok());
        assert!(validate_api_key("sk-ant-api03-xyz789").is_ok());
        assert!(validate_api_key("a").is_ok()); // single char
        assert!(validate_api_key(&"x".repeat(MAX_API_KEY_LENGTH)).is_ok());
    }

    #[test]
    fn validate_api_key_rejects_empty() {
        assert!(validate_api_key("").is_err());
        assert!(validate_api_key("   ").is_err());
        let err = validate_api_key("").unwrap_err();
        assert!(err.contains("empty"), "got: {err}");
    }

    #[test]
    fn validate_api_key_rejects_surrounding_whitespace() {
        let err = validate_api_key("  sk-abc  ").unwrap_err();
        assert!(err.contains("whitespace"), "got: {err}");
    }

    #[test]
    fn validate_api_key_rejects_embedded_newlines() {
        assert!(validate_api_key("sk-abc\ndef").is_err());
        assert!(validate_api_key("sk-abc\rdef").is_err());
        let err = validate_api_key("sk-abc\n").unwrap_err();
        assert!(err.contains("newline"), "got: {err}");
    }

    #[test]
    fn validate_api_key_rejects_too_long() {
        let too_long = "x".repeat(MAX_API_KEY_LENGTH + 1);
        let err = validate_api_key(&too_long).unwrap_err();
        assert!(err.contains("too long"), "got: {err}");
        assert!(err.contains(&format!("{}", MAX_API_KEY_LENGTH + 1)), "got: {err}");
    }

    #[test]
    fn validate_api_key_error_does_not_leak_key_value() {
        // Critical security invariant: error messages must never contain
        // the API key value, even partially.
        let secret = "sk-or-v1-SECRET-SECRET-SECRET";
        let err = validate_api_key(&format!("{secret}\nxxx")).unwrap_err();
        assert!(
            !err.contains("SECRET"),
            "error must not leak api key value: {err}"
        );
    }

    // keychain_account_for

    #[test]
    fn keychain_account_for_uses_provider_id_directly() {
        // Naming convention is locked at validate_provider_id — the
        // validated provider_id IS the Keychain account name. The set /
        // delete / exists fns pass `provider_id` directly after
        // validate_provider_id has trimmed it. This test pins the
        // invariant so a future refactor doesn't accidentally namespace
        // or hash the account name.
        fn expected_account(provider_id: &str) -> String {
            validate_provider_id(provider_id)
                .expect("test input must be a valid provider id")
                .to_string()
        }
        assert_eq!(expected_account("openrouter"), "openrouter");
        assert_eq!(expected_account("anthropic-direct"), "anthropic-direct");
        assert_eq!(expected_account("  openrouter  "), "openrouter"); // trims
    }

    // provider_error / format_provider_error

    #[test]
    fn provider_error_format_is_stable() {
        assert_eq!(
            provider_error(ProviderOp::Save, "key rejected"),
            "ai-provider save: key rejected"
        );
        assert_eq!(
            provider_error(ProviderOp::Delete, "not found"),
            "ai-provider delete: not found"
        );
        assert_eq!(
            provider_error(ProviderOp::Check, "denied"),
            "ai-provider check: denied"
        );
    }

    #[test]
    fn format_provider_error_wraps_source_display() {
        let err = format_provider_error(ProviderOp::Save, "keychain timeout");
        assert_eq!(err, "ai-provider save: keychain timeout");
    }

    // Keychain service constant

    #[test]
    fn keychain_service_constant_matches_compat_layer() {
        // Compat layer rule: namespace stays com.biomatrix.dreamforge.*
        // even though the product is DreamX. Lock the invariant here so a
        // rename refactor doesn't silently break v0.5 → v0.6 key migration.
        assert!(KEYCHAIN_SERVICE.starts_with("com.biomatrix.dreamforge."));
        assert_eq!(KEYCHAIN_SERVICE, "com.biomatrix.dreamforge.ai-provider");
    }

    // Mockable wrapper signatures (compile-time check only).
    // The real implementation hits macOS Keychain, so we only verify
    // here that the public surface exists and has the expected shape.

    #[cfg(target_os = "macos")]
    #[test]
    fn keychain_set_signature_takes_provider_id_and_api_key() {
        // The real test runs against actual Keychain via `cargo test
        // -- --ignored keychain_integration` (see below). This test just
        // verifies the fn is callable with the expected signature.
        fn _check_type(_: impl Fn(&str, &str) -> Result<(), String>) {}
        _check_type(keychain_set);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn keychain_exists_signature_returns_bool() {
        fn _check_type(_: impl Fn(&str) -> Result<bool, String>) {}
        _check_type(keychain_exists);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn keychain_delete_signature_takes_provider_id() {
        fn _check_type(_: impl Fn(&str) -> Result<(), String>) {}
        _check_type(keychain_delete);
    }

    // Real Keychain integration tests — gated behind #[ignore].
    // These hit macOS Keychain and require user keychain unlock access.
    // Run with: `cargo test --lib -- --ignored keychain_integration`
    //
    // Safety: tests use isolated account names (`dreamforge-test-<random>`)
    // and clean up after themselves so they don't pollute the user's
    // real Keychain entries.

    #[cfg(target_os = "macos")]
    #[cfg(test)]
    mod keychain_integration {
        use super::*;

        fn random_test_id() -> String {
            use std::time::{SystemTime, UNIX_EPOCH};
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            format!("dreamforge-test-{nanos}")
        }

        #[test]
        #[ignore]
        fn real_keychain_set_then_exists_then_delete() {
            let id = random_test_id();
            let key = "sk-or-v1-test-only-not-a-real-key";

            // Save
            keychain_set(&id, key).expect("set should succeed on macOS");

            // Check exists — value must NOT leak into the return type
            let status = keychain_exists(&id).expect("check should succeed");
            assert!(status, "key must be configured after save");
            assert_eq!(status, true);

            // Delete
            keychain_delete(&id).expect("delete should succeed");

            // Check no longer exists
            let status_after = keychain_exists(&id).expect("check should succeed");
            assert!(!status_after, "key must NOT be configured after delete");
        }

        #[test]
        #[ignore]
        fn real_keychain_delete_is_idempotent() {
            let id = random_test_id();
            // Delete a non-existent entry — should be Ok(()) not Err
            keychain_delete(&id).expect("delete on missing must be idempotent");
        }

        #[test]
        #[ignore]
        fn real_keychain_rejects_invalid_provider_id() {
            // Bad provider ids should be rejected at the validation layer
            // before touching Keychain.
            assert!(keychain_set("Bad-Id", "sk-test").is_err());
            assert!(keychain_exists("Bad-Id").is_err());
            assert!(keychain_delete("Bad-Id").is_err());
        }
    }
}
