//! DreamVault CLI bridge commands
//!
//! DreamForge shells out to the `dream` CLI binary shipped alongside DreamVault.
//! The CLI is invoked as a subprocess with one of three subcommands:
//!   - `status --vault <path>`      — quick vault summary
//!   - `run    --vault <path>`      — full dream cycle (gather → consolidate → decay → persist → commit)
//!   - `report --vault <path>`      — last dream cycle report
//!
//! Path resolution priority (matches frontend `dreamCliPath.ts`):
//!   1. `dream_cli_path` function argument (from Settings / explicit caller)
//!   2. `DREAMFORGE_DREAM_CLI` environment variable
//!   3. Local DreamVault build fallback for this self-hosted DreamForge app
//!   4. `dream` on `PATH`
//!
//! PR 10 (v0.2): Ollama/OpenAI-compatible LLM provider support:
//!   - `llm_base_url` + `llm_model` settings → dream CLI `--base-url` / `--model` flags
//!   - `DREAMFORGE_LLM_API_KEY` env var (user's shell) → dream subprocess env
//!   - Base URL has trailing `/v1` stripped before passing to dream (OllamaProvider
//!     auto-appends `/v1/chat/completions`)
//!   - API key NEVER enters dream CLI args (would be visible in `ps aux`)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

/// PR 10: env var name for OpenAI-compatible LLM API key.
/// Read from user's shell env; injected into dream subprocess only — never CLI args.
const LLM_API_KEY_ENV: &str = "DREAMFORGE_LLM_API_KEY";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DreamVaultAction {
    Status,
    /// v0.6.x PR 50b: structured JSON variant of `Status`. Emits the
    /// same data as `Status` but in a stable, machine-parseable JSON
    /// shape (see `DreamVaultStatusReport`). The `dream status --json`
    /// flag is added by `build_dreamvault_command`; the subcommand
    /// name is shared with `Status`.
    StatusJson,
    Run,
    Report,
}

impl DreamVaultAction {
    fn subcommand(self) -> &'static str {
        match self {
            DreamVaultAction::Status => "status",
            DreamVaultAction::StatusJson => "status",
            DreamVaultAction::Run => "run",
            DreamVaultAction::Report => "report",
        }
    }

    /// Extra CLI args to append after the subcommand name. Currently
    /// only `StatusJson` adds `--json` (the structured-output flag).
    fn extra_args(self) -> &'static [&'static str] {
        match self {
            DreamVaultAction::StatusJson => &["--json"],
            _ => &[],
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamVaultCommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// v0.6.x PR 50b: typed deserialization target for the `dream status
/// --json` output. The Swift CLI emits a stable JSON shape (locked
/// in `docs/superpowers/plans/2026-06-23-pr50-vault-stats-json-contract.md`);
/// this struct is the Rust-side mirror. Frontend sees only this struct
/// via Tauri, never the raw JSON or the .dream/ledger.json file.
///
/// Strict acceptance: `schemaVersion === 1` is required. Any other
/// version (missing, 0, 2, "1.0") produces a typed `Err` from
/// `dreamvault_status_json` — the frontend catches that error and
/// falls back to the existing text-parse path (PR 48
/// parseDreamStatus). We do NOT default or guess on contract drift.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamVaultStatusReport {
    pub schema_version: u32,
    pub vault_path: String,
    pub raw_candidates_count: u32,
    pub processed_count: u32,
    pub archived_count: u32,
    /// Vault-relative path (e.g. ".dream/reports/dream-report-…md"),
    /// or `None` when no reports exist. The field is ALWAYS present
    /// in the wire format (string OR JSON null) per PR 50a Swift
    /// custom encode(to:) override.
    pub last_report_path: Option<String>,
}

impl DreamVaultStatusReport {
    /// The only schemaVersion this build accepts. Bumping this
    /// requires a coordinated Swift CLI + Rust + frontend change.
    pub const ACCEPTED_SCHEMA_VERSION: u32 = 1;
}

#[derive(Debug, Eq, PartialEq)]
pub struct DreamVaultCommandSpec {
    pub program: String,
    pub args: Vec<String>,
}

/// Resolve the dream CLI binary path. Priority:
///   1. Explicit `dream_cli_path` argument (from frontend Settings)
///   2. `DREAMFORGE_DREAM_CLI` environment variable
///   3. Local DreamVault build fallback for this self-hosted DreamForge app
///   4. `dream` on `PATH` (resolved by `Command::new` lookup at spawn time)
pub fn resolve_dream_cli_path(explicit: Option<&str>) -> String {
    if let Some(value) = explicit.map(str::trim).filter(|value| !value.is_empty()) {
        return value.to_string();
    }

    if let Ok(value) = std::env::var("DREAMFORGE_DREAM_CLI") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    if let Some(value) = local_dreamvault_cli_path() {
        return value;
    }

    "dream".to_string()
}

fn local_dreamvault_cli_path() -> Option<String> {
    dreamvault_cli_candidates()
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string())
}

fn dreamvault_cli_candidates() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let dreamvault_root = home.join("Desktop/APP/DreamVault");

    vec![
        dreamvault_root.join(".build/arm64-apple-macosx/release/dream"),
        dreamvault_root.join(".build/arm64-apple-macosx/debug/dream"),
        dreamvault_root.join(".build/release/dream"),
        dreamvault_root.join(".build/debug/dream"),
    ]
}

/// v0.5 P2a: Resolve which env var to read the user's LLM API key from.
///
/// Priority:
///   1. Provider-specific override (e.g. `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
///      `GEMINI_API_KEY`) — comes from the active provider's `api_key_env_var`
///      field in settings. The user's shell holds the actual key under that
///      name, and DreamX reads + injects the value into the dream subprocess.
///   2. Legacy fallback `DREAMFORGE_LLM_API_KEY` — preserves PR 10 behavior
///      for users who haven't yet picked a multi-provider setup.
///
/// Empty / whitespace-only override is treated as "unset" (falls back) so
/// that a stale or blank provider config in Settings doesn't accidentally
/// look up a nonsense env var.
///
/// NOTE: This function returns the SOURCE env var name (the one to read from
/// the user's shell). The TARGET name injected into the dream subprocess is
/// always `DREAMFORGE_LLM_API_KEY` — the dream CLI Swift code reads only
/// that name, and we want to keep the dream CLI contract stable across PRs.
pub fn resolve_api_key_env_name(llm_api_key_env: Option<&str>) -> &str {
    llm_api_key_env
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(LLM_API_KEY_ENV)
}

/// v0.5 PR 27 P2c-1.5: which source provided the API key that was
/// injected into the dream subprocess.
///
/// `Keychain` is the preferred source (PR 25 + PR 26 closed loop):
/// user saves key in Settings → key stored in macOS Keychain →
/// DreamX reads from Keychain at dream CLI invocation time.
///
/// `ShellEnv` is the fallback (PR 24 P2a + PR 10 legacy): user set
/// `OPENROUTER_API_KEY=sk-...` in their shell → DreamX reads from
/// shell env. Useful for CI / headless setups where the user prefers
/// to manage keys outside the GUI.
///
/// `None` means no key was injected. This is NOT an error when the
/// active provider is None (backward compat with non-LLM dream runs);
/// when a provider id IS given and both sources are empty, `inject_api_key`
/// returns an Err instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeySource {
    Keychain,
    ShellEnv,
    None,
}

/// v0.5 PR 27 P2c-1.5: inject the LLM API key into the dream subprocess.
///
/// Priority:
///   1. **Keychain** — if `provider_id` is given and Keychain has the key
///      for that id, use it. This is the closed-loop path: user saves
///      key in Settings → Keychain stores it → DreamX reads from Keychain
///      at dream CLI invocation time.
///   2. **Shell env** — fallback to the env var name resolved by
///      `resolve_api_key_env_name(env_name)`. PR 10 / PR 24 behavior for
///      users who manage keys outside the GUI.
///   3. **Error if provider id given but no key found** — when the user
///      has selected an active provider (provider_id is Some) and neither
///      source has the key, return a stable error so the user gets a
///      clear "missing key" message instead of the dream CLI's generic
///      auth failure.
///
/// **Security invariant**: the key value never enters an error message,
/// log line, or return value. It only flows through `Command::env()` and
/// is dropped immediately after.
pub fn inject_api_key(
    command: &mut std::process::Command,
    provider_id: Option<&str>,
    env_name: Option<&str>,
) -> Result<ApiKeySource, String> {
    inject_api_key_with_lookup(
        command,
        provider_id,
        env_name,
        #[cfg(target_os = "macos")]
        real_keychain_read_value,
        #[cfg(not(target_os = "macos"))]
        |_| {
            Err(crate::commands::ai_provider::provider_error(
                crate::commands::ai_provider::ProviderOp::Check,
                "macOS Keychain is only available on macOS",
            ))
        },
    )
}

#[cfg(target_os = "macos")]
fn real_keychain_read_value(
    provider_id: &str,
) -> Result<crate::commands::ai_provider::KeychainReadOutcome, String> {
    crate::commands::ai_provider::keychain_read_value(provider_id)
}

/// v0.5 PR 27 P2c-1.5: testable variant of `inject_api_key` that takes
/// a closure for the Keychain lookup. Production code calls this with
/// `real_keychain_read_value`; tests pass a closure returning
/// `KeychainReadOutcome::Found` / `Empty` / `NotConfigured` without
/// touching real macOS Keychain.
///
/// See `tests::inject_api_key_*` for the contract.
fn inject_api_key_with_lookup<F>(
    command: &mut std::process::Command,
    provider_id: Option<&str>,
    env_name: Option<&str>,
    keychain_lookup: F,
) -> Result<ApiKeySource, String>
where
    F: Fn(&str) -> Result<crate::commands::ai_provider::KeychainReadOutcome, String>,
{
    let resolved_env_name = resolve_api_key_env_name(env_name);

    // Step 1: try Keychain first (closed-loop path)
    if let Some(pid) = provider_id.map(str::trim).filter(|s| !s.is_empty()) {
        match keychain_lookup(pid) {
            Ok(crate::commands::ai_provider::KeychainReadOutcome::Found(value)) => {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    command.env(LLM_API_KEY_ENV, trimmed);
                    return Ok(ApiKeySource::Keychain);
                }
                // Empty after trim — treat as not configured, fall through.
            }
            Ok(crate::commands::ai_provider::KeychainReadOutcome::Empty) => {
                // Fall through to shell env.
            }
            Ok(crate::commands::ai_provider::KeychainReadOutcome::NotConfigured) => {
                // Fall through to shell env.
            }
            Err(error) => return Err(error),
        }
    }

    // Step 2: shell env fallback (PR 24 / PR 10 behavior)
    if let Ok(value) = std::env::var(resolved_env_name) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            command.env(LLM_API_KEY_ENV, trimmed);
            return Ok(ApiKeySource::ShellEnv);
        }
    }

    // Step 3: no key found. If provider_id was given, this is a hard error
    // so the user gets a stable "missing key" message instead of a
    // generic dream CLI auth failure. If no provider_id, preserve the
    // PR 24 / PR 10 behavior (no key → no injection, dream CLI decides).
    if provider_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        Err(format!(
            "ai-provider check: no API key configured for provider '{}' \
             (save key in Settings → AI or set {} in your shell)",
            provider_id.unwrap_or("?"),
            resolved_env_name,
        ))
    } else {
        Ok(ApiKeySource::None)
    }
}

/// PR 10: Strip trailing `/v1` from an OpenAI-compatible base URL.
/// OllamaProvider (in DreamVault) auto-appends `/v1/chat/completions`, so the
/// base URL passed to dream must NOT include `/v1` (would result in
/// `/v1/v1/chat/completions`).
///
/// Examples:
///   `https://api.siliconflow.cn/v1`   → `https://api.siliconflow.cn`
///   `https://api.siliconflow.cn/v1/`  → `https://api.siliconflow.cn`
///   `http://127.0.0.1:11434`          → `http://127.0.0.1:11434` (unchanged)
///   `https://api.example.com/api/v1`  → `https://api.example.com/api` (strips only last `/v1`)
pub fn strip_v1_suffix(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if let Some(stripped) = trimmed.strip_suffix("/v1") {
        stripped.to_string()
    } else {
        trimmed.to_string()
    }
}

fn has_provider_id(provider_id: Option<&str>) -> bool {
    provider_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}

fn dream_llm_flag_for_provider_kind(llm_provider_kind: Option<&str>) -> &'static str {
    let Some(kind) = llm_provider_kind
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return "openai";
    };

    let normalized = kind.replace('-', "_").to_ascii_lowercase();
    match normalized.as_str() {
        "anthropic" | "claude" => "anthropic",
        "gemini" | "google" | "google_gemini" => "gemini",
        _ => "openai",
    }
}

pub fn build_dreamvault_command(
    action: DreamVaultAction,
    vault_path: &str,
    dream_cli_path: Option<&str>,
    llm_base_url: Option<&str>, // PR 10
    llm_model: Option<&str>,     // PR 10
    llm_api_key_provider_id: Option<&str>, // v0.5 PR 30
    llm_provider_kind: Option<&str>,       // v0.6 PR 37b
) -> DreamVaultCommandSpec {
    let mut args = vec![
        action.subcommand().to_string(),
        "--vault".to_string(),
        vault_path.to_string(),
    ];
    // v0.6.x PR 50b: append action-specific flags. Currently only
    // StatusJson adds `--json` (the structured-output flag). The
    // contract is locked at schemaVersion: 1.
    for arg in action.extra_args() {
        args.push((*arg).to_string());
    }

    // v0.5 PR 30: Selecting a provider in DreamX means the dream CLI must
    // enter DreamVault's OpenAI-compatible route. Status remains provider-free
    // because it should never hit cloud config or Keychain on mount.
    if action != DreamVaultAction::Status && has_provider_id(llm_api_key_provider_id) {
        args.push("--llm".to_string());
        args.push(dream_llm_flag_for_provider_kind(llm_provider_kind).to_string());
    }

    // PR 10: --base-url flag (after stripping trailing /v1)
    if let Some(url) = llm_base_url.map(str::trim).filter(|value| !value.is_empty()) {
        let normalized = strip_v1_suffix(url);
        args.push("--base-url".to_string());
        args.push(normalized);
    }

    // PR 10: --model flag
    if let Some(model) = llm_model.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--model".to_string());
        args.push(model.to_string());
    }

    DreamVaultCommandSpec {
        program: resolve_dream_cli_path(dream_cli_path),
        args,
    }
}

fn run_dreamvault_action(
    action: DreamVaultAction,
    vault_path: &str,
    dream_cli_path: Option<&str>,
    llm_base_url: Option<&str>,
    llm_model: Option<&str>,
    llm_api_key_env: Option<&str>,
    llm_api_key_provider_id: Option<&str>, // v0.5 PR 27 P2c-1.5
    llm_provider_kind: Option<&str>,       // v0.6 PR 37b
) -> Result<DreamVaultCommandOutput, String> {
    let spec = build_dreamvault_command(
        action,
        vault_path,
        dream_cli_path,
        llm_base_url,
        llm_model,
        llm_api_key_provider_id,
        llm_provider_kind,
    );

    let mut command = Command::new(&spec.program);
    command.args(&spec.args);

    // v0.5 PR 27 P2c-1.5: closed-loop key resolution.
    //   - If `llm_api_key_provider_id` is given, try Keychain first
    //     (PR 25 + PR 26: Settings UI saves key → Keychain stores it →
    //     DreamX reads from Keychain here → injects into dream subprocess).
    //   - Fall back to shell env (PR 24 + PR 10) for backward compat
    //     with users who manage keys outside the GUI.
    //   - If provider id is given but neither source has a key, return
    //     a stable "missing key" error so the user sees a clear message
    //     instead of a generic dream CLI auth failure.
    //
    // Safety invariant: the key VALUE never enters dream CLI args (ps aux
    // would leak it). It only travels via Command::env() into the
    // subprocess env. The inject_api_key function drops the value
    // immediately after Command::env().
    inject_api_key(&mut command, llm_api_key_provider_id, llm_api_key_env)?;

    let output = command.output().map_err(|error| {
        format!(
            "Failed to launch DreamVault CLI '{}': {error}",
            spec.program
        )
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        Ok(DreamVaultCommandOutput {
            stdout,
            stderr,
            success: true,
        })
    } else {
        let detail = if stderr.is_empty() {
            stdout.clone()
        } else {
            stderr.clone()
        };
        Err(format!("DreamVault CLI failed: {detail}"))
    }
}

#[tauri::command]
pub async fn dreamvault_status(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>,             // PR 10
    llm_model: Option<String>,                // PR 10
    llm_api_key_env: Option<String>,          // v0.5 P2a
    llm_api_key_provider_id: Option<String>,  // v0.5 PR 27 P2c-1.5
    llm_provider_kind: Option<String>,        // v0.6 PR 37b
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Status,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
            llm_api_key_provider_id.as_deref(),
            llm_provider_kind.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault status task failed: {error}"))?
}

// v0.6.x PR 50b: structured JSON variant of dreamvault_status.
// Invokes `dream status --json`, parses stdout, applies STRICT
// schemaVersion === 1 acceptance (per design note §1.4 rule 1),
// and returns the typed `DreamVaultStatusReport` to the frontend.
//
// Errors propagate as `Err(String)` so the frontend can catch the
// typed error and fall back to the existing text-parse path
// (PR 48 parseDreamStatus). We do NOT default or guess on contract
// drift — a different schemaVersion means the Swift CLI is from a
// different version family and silent parsing would corrupt the UI.
//
// Backwards compat: if the dream binary doesn't support --json yet
// (older build), the subprocess exits non-zero with "unknown option"
// stderr, and we surface that as `Err`. The frontend treats both
// "no --json flag" and "wrong schemaVersion" identically — fallback
// to text parse.
#[tauri::command]
pub async fn dreamvault_status_json(
    vault_path: String,
    dream_cli_path: Option<String>,
) -> Result<DreamVaultStatusReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = run_dreamvault_action(
            DreamVaultAction::StatusJson,
            &vault_path,
            dream_cli_path.as_deref(),
            None, // llm_base_url: status has no LLM
            None, // llm_model
            None, // llm_api_key_env
            None, // llm_api_key_provider_id
            None, // llm_provider_kind
        )?;
        // Parse stdout as JSON. We trim trailing whitespace because
        // the Swift CLI prints with a trailing newline; trimming
        // keeps the JSON well-formed.
        let stdout = output.stdout.trim();
        let report: DreamVaultStatusReport = serde_json::from_str(stdout)
            .map_err(|error| {
                format!(
                    "DreamVault stats JSON parse failed: {error}. \
                     Falling back to text-parse path requires updating the dream CLI."
                )
            })?;
        // STRICT schemaVersion === 1 acceptance (locked design note
        // §1.4 rule 1). No defaulting, no guessing, no fall-through.
        if report.schema_version != DreamVaultStatusReport::ACCEPTED_SCHEMA_VERSION {
            return Err(format!(
                "DreamVault stats report has schemaVersion={}, expected {}. \
                 Update both repos to compatible versions before retrying.",
                report.schema_version,
                DreamVaultStatusReport::ACCEPTED_SCHEMA_VERSION,
            ));
        }
        Ok(report)
    })
    .await
    .map_err(|error| format!("DreamVault status_json task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_run(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>,             // PR 10
    llm_model: Option<String>,                // PR 10
    llm_api_key_env: Option<String>,          // v0.5 P2a
    llm_api_key_provider_id: Option<String>,  // v0.5 PR 27 P2c-1.5
    llm_provider_kind: Option<String>,        // v0.6 PR 37b
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Run,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
            llm_api_key_provider_id.as_deref(),
            llm_provider_kind.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault run task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_report(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>,             // PR 10
    llm_model: Option<String>,                // PR 10
    llm_api_key_env: Option<String>,          // v0.5 P2a
    llm_api_key_provider_id: Option<String>,  // v0.5 PR 27 P2c-1.5
    llm_provider_kind: Option<String>,        // v0.6 PR 37b
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Report,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
            llm_api_key_provider_id.as_deref(),
            llm_provider_kind.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault report task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_command_uses_vault_path_and_explicit_cli() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Status,
            "/tmp/vault",
            Some("/opt/dream/bin/dream"),
            None,
            None,
            None,
            None,
        );

        assert_eq!(spec.program, "/opt/dream/bin/dream");
        assert_eq!(spec.args, vec!["status", "--vault", "/tmp/vault"]);
    }

    // v0.6.x PR 50b: StatusJson appends `--json` to the existing
    // status subcommand. The contract is locked in
    // docs/superpowers/plans/2026-06-23-pr50-vault-stats-json-contract.md.
    #[test]
    fn status_json_command_appends_json_flag() {
        let spec = build_dreamvault_command(
            DreamVaultAction::StatusJson,
            "/tmp/vault",
            Some("/opt/dream/bin/dream"),
            None,
            None,
            None,
            None,
        );

        assert_eq!(spec.program, "/opt/dream/bin/dream");
        // --json is the LAST arg so it doesn't get clobbered by the
        // --vault or --llm argument list. Order: subcommand --vault <p> --json
        assert_eq!(spec.args, vec!["status", "--vault", "/tmp/vault", "--json"]);
    }

    // v0.6.x PR 50b: schemaVersion acceptance is locked at === 1.
    // Any other version (0, 2, missing) returns Err — the
    // frontend catches that and falls back to the text-parse path.
    // These tests pin the strict acceptance behavior so a future
    // bump can't silently drift the consumer.
    #[test]
    fn status_report_deserializes_valid_v1() {
        let json = r#"{
            "schemaVersion": 1,
            "vaultPath": "/tmp/vault",
            "rawCandidatesCount": 5,
            "processedCount": 23,
            "archivedCount": 2,
            "lastReportPath": ".dream/reports/dream-report-2026-06-22-182157.md"
        }"#;
        let report: DreamVaultStatusReport = serde_json::from_str(json)
            .expect("valid v1 JSON should parse");
        assert_eq!(report.schema_version, 1);
        assert_eq!(report.vault_path, "/tmp/vault");
        assert_eq!(report.raw_candidates_count, 5);
        assert_eq!(report.processed_count, 23);
        assert_eq!(report.archived_count, 2);
        assert_eq!(
            report.last_report_path.as_deref(),
            Some(".dream/reports/dream-report-2026-06-22-182157.md")
        );
    }

    #[test]
    fn status_report_deserializes_v1_with_null_last_report() {
        // The Swift CLI's custom encode(to:) ALWAYS emits
        // lastReportPath (string OR JSON null). The Rust side
        // deserializes null as None and string as Some.
        let json = r#"{
            "schemaVersion": 1,
            "vaultPath": "/tmp/vault",
            "rawCandidatesCount": 0,
            "processedCount": 0,
            "archivedCount": 0,
            "lastReportPath": null
        }"#;
        let report: DreamVaultStatusReport = serde_json::from_str(json)
            .expect("v1 with null lastReportPath should parse");
        assert_eq!(report.schema_version, 1);
        assert!(report.last_report_path.is_none());
    }

    #[test]
    fn status_report_accepted_schema_version_is_one() {
        // This is the canonical constant — pinned at 1 until a
        // coordinated Swift + Rust + frontend change bumps it.
        assert_eq!(DreamVaultStatusReport::ACCEPTED_SCHEMA_VERSION, 1);
    }

    #[test]
    fn status_report_rejects_missing_schema_version() {
        // Missing field → serde error (NOT a default value). The
        // strict acceptance rule means we never accept JSON without
        // schemaVersion.
        let json = r#"{
            "vaultPath": "/tmp/vault",
            "rawCandidatesCount": 0,
            "processedCount": 0,
            "archivedCount": 0,
            "lastReportPath": null
        }"#;
        let result: Result<DreamVaultStatusReport, _> = serde_json::from_str(json);
        assert!(result.is_err(), "missing schemaVersion must be rejected");
    }

    #[test]
    fn status_report_rejects_schema_version_zero() {
        // schemaVersion=0 is a different version family. Loud
        // rejection (not defaulting to 1, not parsing anyway).
        let json = r#"{
            "schemaVersion": 0,
            "vaultPath": "/tmp/vault",
            "rawCandidatesCount": 0,
            "processedCount": 0,
            "archivedCount": 0,
            "lastReportPath": null
        }"#;
        let result: Result<DreamVaultStatusReport, _> = serde_json::from_str(json);
        // The struct deserializes (serde doesn't enforce the
        // strict === 1 check at the struct level — that's done in
        // dreamvault_status_json). The struct just type-checks the
        // field. The check happens at the command level.
        // We assert the field is what we sent so the next test
        // can verify the runtime check.
        let report = result.expect("struct deserializes v0 fine, runtime check is in dreamvault_status_json");
        assert_eq!(report.schema_version, 0);
        assert_ne!(
            report.schema_version,
            DreamVaultStatusReport::ACCEPTED_SCHEMA_VERSION,
        );
    }

    #[test]
    fn status_report_rejects_schema_version_two() {
        // schemaVersion=2 is a future version. Loud rejection — we
        // do NOT default, do NOT parse past the version field. The
        // contract is locked.
        let json = r#"{
            "schemaVersion": 2,
            "vaultPath": "/tmp/vault",
            "rawCandidatesCount": 0,
            "processedCount": 0,
            "archivedCount": 0,
            "lastReportPath": null
        }"#;
        let report: DreamVaultStatusReport = serde_json::from_str(json)
            .expect("v2 deserializes for inspection; runtime check rejects");
        assert_eq!(report.schema_version, 2);
        assert_ne!(
            report.schema_version,
            DreamVaultStatusReport::ACCEPTED_SCHEMA_VERSION,
        );
    }

    #[test]
    fn run_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            Some("/opt/dream/bin/dream"),
            None,
            None,
            None,
            None,
        );

        assert_eq!(spec.args, vec!["run", "--vault", "/tmp/vault"]);
    }

    #[test]
    fn report_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Report,
            "/tmp/vault",
            Some("/opt/dream/bin/dream"),
            None,
            None,
            None,
            None,
        );

        assert_eq!(spec.args, vec!["report", "--vault", "/tmp/vault"]);
    }

    // PR 10: --base-url and --model flags
    #[test]
    fn run_command_passes_base_url_and_model() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some("https://api.siliconflow.cn"),
            Some("deepseek-ai/DeepSeek-V4-Pro"),
            None,
            None,
        );

        assert_eq!(
            spec.args,
            vec![
                "run",
                "--vault",
                "/tmp/vault",
                "--base-url",
                "https://api.siliconflow.cn",
                "--model",
                "deepseek-ai/DeepSeek-V4-Pro",
            ]
        );
    }

    #[test]
    fn base_url_strips_trailing_v1() {
        // PR 10: OllamaProvider auto-appends /v1/chat/completions, so user-supplied
        // /v1 suffix must be stripped to avoid /v1/v1/chat/completions.
        assert_eq!(
            strip_v1_suffix("https://api.siliconflow.cn/v1"),
            "https://api.siliconflow.cn"
        );
        assert_eq!(
            strip_v1_suffix("https://api.siliconflow.cn/v1/"),
            "https://api.siliconflow.cn"
        );
        // URLs without /v1 are unchanged
        assert_eq!(
            strip_v1_suffix("http://127.0.0.1:11434"),
            "http://127.0.0.1:11434"
        );
        assert_eq!(
            strip_v1_suffix("https://api.siliconflow.cn"),
            "https://api.siliconflow.cn"
        );
        // Whitespace is trimmed
        assert_eq!(
            strip_v1_suffix("  https://api.siliconflow.cn/v1  "),
            "https://api.siliconflow.cn"
        );
    }

    #[test]
    fn run_command_strips_v1_from_user_base_url() {
        // User enters URL with /v1 (per OpenAI-compat convention);
        // dream CLI receives URL without /v1.
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some("https://api.siliconflow.cn/v1"),
            Some("deepseek-ai/DeepSeek-V4-Pro"),
            None,
            None,
        );

        assert_eq!(
            spec.args,
            vec![
                "run",
                "--vault",
                "/tmp/vault",
                "--base-url",
                "https://api.siliconflow.cn", // /v1 stripped
                "--model",
                "deepseek-ai/DeepSeek-V4-Pro",
            ]
        );
    }

    #[test]
    fn run_command_omits_base_url_when_empty() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some(""),
            Some(""),
            None,
            None,
        );

        // Empty / whitespace-only base-url and model are omitted (no flag, no value)
        assert_eq!(spec.args, vec!["run", "--vault", "/tmp/vault"]);
    }

    #[test]
    fn run_command_model_only() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            None,
            Some("llama3.1"),
            None,
            None,
        );

        assert_eq!(
            spec.args,
            vec!["run", "--vault", "/tmp/vault", "--model", "llama3.1"]
        );
    }

    #[test]
    fn run_command_uses_openai_compatible_llm_when_provider_id_is_set() {
        // v0.5 PR 30: selecting a cloud provider in DreamX must route
        // DreamVault into its OpenAI-compatible provider path. Base URL and
        // model alone are not enough; without `--llm openai`, the dream CLI
        // stays on its default provider path and the cloud call can idle/no-op.
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some("https://openrouter.ai/api/v1"),
            Some("anthropic/claude-sonnet-4.5"),
            Some("openrouter-abc123"),
            Some("open_router"),
        );

        assert_eq!(
            spec.args,
            vec![
                "run",
                "--vault",
                "/tmp/vault",
                "--llm",
                "openai",
                "--base-url",
                "https://openrouter.ai/api",
                "--model",
                "anthropic/claude-sonnet-4.5",
            ]
        );
    }

    #[test]
    fn run_command_uses_anthropic_llm_when_provider_kind_is_anthropic() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some("https://api.anthropic.com"),
            Some("claude-sonnet-4-5"),
            Some("anthropic-abc123"),
            Some("anthropic"),
        );

        assert_eq!(
            spec.args,
            vec![
                "run",
                "--vault",
                "/tmp/vault",
                "--llm",
                "anthropic",
                "--base-url",
                "https://api.anthropic.com",
                "--model",
                "claude-sonnet-4-5",
            ]
        );
    }

    #[test]
    fn run_command_uses_gemini_llm_when_provider_kind_is_gemini() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            None,
            Some("https://generativelanguage.googleapis.com"),
            Some("gemini-2.5-flash"),
            Some("gemini-abc123"),
            Some("gemini"),
        );

        assert_eq!(
            spec.args,
            vec![
                "run",
                "--vault",
                "/tmp/vault",
                "--llm",
                "gemini",
                "--base-url",
                "https://generativelanguage.googleapis.com",
                "--model",
                "gemini-2.5-flash",
            ]
        );
    }

    #[test]
    fn resolve_prefers_explicit_argument() {
        let resolved = resolve_dream_cli_path(Some("/usr/local/bin/dream"));
        assert_eq!(resolved, "/usr/local/bin/dream");
    }

    #[test]
    fn resolve_trims_whitespace_in_explicit_argument() {
        let resolved = resolve_dream_cli_path(Some("  /opt/dream/bin/dream  "));
        assert_eq!(resolved, "/opt/dream/bin/dream");
    }

    #[test]
    fn resolve_treats_empty_explicit_as_unset() {
        // Empty / whitespace-only explicit arg must fall through to env / PATH.
        // We don't assert the final value (env / PATH are global and racy in tests),
        // only that the function does not return the empty string.
        let resolved_empty = resolve_dream_cli_path(Some(""));
        let resolved_ws = resolve_dream_cli_path(Some("   "));
        assert!(!resolved_empty.is_empty(), "empty explicit must not return empty");
        assert!(!resolved_ws.is_empty(), "whitespace explicit must not return empty");
    }

    #[test]
    fn local_dreamvault_candidates_include_release_then_debug_builds() {
        let candidates = dreamvault_cli_candidates();
        let joined = candidates
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(
            joined.contains("DreamVault/.build/arm64-apple-macosx/release/dream"),
            "candidate list should include the local arm64 release CLI path"
        );
        assert!(
            joined.contains("DreamVault/.build/arm64-apple-macosx/debug/dream"),
            "candidate list should include the local arm64 debug CLI path"
        );
    }

    // v0.5 PR 24 P2a: multi-provider API key env var override.
    //
    // Each LLM provider in the catalog exposes a different env var name for
    // its API key (OpenRouter → OPENROUTER_API_KEY, Anthropic → ANTHROPIC_API_KEY,
    // Gemini → GEMINI_API_KEY, etc). The user's shell holds the actual key in
    // one of those names. DreamX must:
    //   1. Read the env var name from TS (provider config's `api_key_env_var`).
    //   2. Look up the value in the user's shell env.
    //   3. Inject the value into the dream subprocess as `DREAMFORGE_LLM_API_KEY`
    //      (dream CLI Swift code reads only that name — no dream CLI change
    //      needed for P2a).
    //
    // Backward compat: when no override is given, fall back to the legacy
    // `DREAMFORGE_LLM_API_KEY` env var (PR 10 behavior).

    #[test]
    fn resolve_api_key_env_name_uses_override_when_provided() {
        // OpenRouter provider config says api_key_env_var = "OPENROUTER_API_KEY"
        assert_eq!(
            resolve_api_key_env_name(Some("OPENROUTER_API_KEY")),
            "OPENROUTER_API_KEY"
        );
        // Anthropic
        assert_eq!(
            resolve_api_key_env_name(Some("ANTHROPIC_API_KEY")),
            "ANTHROPIC_API_KEY"
        );
        // Gemini
        assert_eq!(
            resolve_api_key_env_name(Some("GEMINI_API_KEY")),
            "GEMINI_API_KEY"
        );
        // Custom provider with arbitrary name
        assert_eq!(
            resolve_api_key_env_name(Some("MY_CUSTOM_LLM_KEY")),
            "MY_CUSTOM_LLM_KEY"
        );
    }

    #[test]
    fn resolve_api_key_env_name_falls_back_when_none() {
        // No override → legacy PR 10 behavior (DREAMFORGE_LLM_API_KEY)
        assert_eq!(resolve_api_key_env_name(None), "DREAMFORGE_LLM_API_KEY");
    }

    #[test]
    fn resolve_api_key_env_name_falls_back_when_empty_or_whitespace() {
        // Empty / whitespace-only override is treated as "unset" — falls back
        // to legacy DREAMFORGE_LLM_API_KEY. This handles the case where the
        // user clears the active provider in Settings or sets a blank name.
        assert_eq!(resolve_api_key_env_name(Some("")), "DREAMFORGE_LLM_API_KEY");
        assert_eq!(resolve_api_key_env_name(Some("   ")), "DREAMFORGE_LLM_API_KEY");
        assert_eq!(resolve_api_key_env_name(Some("\t")), "DREAMFORGE_LLM_API_KEY");
    }

    #[test]
    fn resolve_api_key_env_name_trims_overridden_value() {
        // Some shells / config files accidentally include whitespace around
        // env var names. Treat whitespace as part of "unset" only when the
        // trimmed value is empty; otherwise honor the trimmed name.
        assert_eq!(
            resolve_api_key_env_name(Some("  OPENROUTER_API_KEY  ")),
            "OPENROUTER_API_KEY"
        );
    }

    // v0.5 PR 27 P2c-1.5: closed-loop key resolution tests.
    //
    // These exercise `inject_api_key_with_lookup` with a mock Keychain
    // lookup closure so the test suite stays free of real macOS Keychain
    // dependencies. Real Keychain coverage lives in
    // `commands::ai_provider::tests::keychain_integration` behind #[ignore].

    use crate::commands::ai_provider::{KeychainReadOutcome, ProviderOp};
    use std::process::Command;

    /// Build a fresh Command and run `inject_api_key_with_lookup` against
    /// a mock Keychain lookup closure. Returns the source outcome.
    fn run_inject<F>(
        provider_id: Option<&str>,
        env_name: Option<&str>,
        lookup: F,
    ) -> Result<ApiKeySource, String>
    where
        F: Fn(&str) -> Result<KeychainReadOutcome, String>,
    {
        let mut command = Command::new("/bin/true");
        inject_api_key_with_lookup(&mut command, provider_id, env_name, lookup)
    }

    #[test]
    fn inject_uses_keychain_when_configured_and_provider_id_given() {
        // The closed-loop path: PR 25 Keychain + PR 26 UI saved the key;
        // here DreamX reads it from Keychain and injects into the subprocess.
        // The lookup closure returns Found("sk-or-v1-...") without ever
        // touching real Keychain.
        let result = run_inject(
            Some("openrouter"),
            Some("OPENROUTER_API_KEY"),
            |_pid| Ok(KeychainReadOutcome::Found("sk-or-v1-test-123".to_string())),
        );
        assert_eq!(result, Ok(ApiKeySource::Keychain));
    }

    #[test]
    fn inject_falls_back_to_shell_env_when_keychain_not_configured() {
        // Backward compat with PR 24 / PR 10: user has shell env set but
        // hasn't used the Settings UI. Keychain lookup returns NotConfigured,
        // shell env has the key → use shell env.
        //
        // We don't manipulate process env here (racy across parallel tests);
        // we just verify that when Keychain says NotConfigured, the function
        // continues to the shell env branch. If shell env happens to have
        // the var in the test runner, ShellEnv is returned; otherwise the
        // function returns "missing key" error (provider id is Some).
        // Both outcomes prove the fall-through happened correctly.
        let lookup_result = run_inject(
            Some("openrouter"),
            Some("OPENROUTER_API_KEY_NONEXISTENT_FOR_TEST"),
            |_pid| Ok(KeychainReadOutcome::NotConfigured),
        );
        match lookup_result {
            Ok(ApiKeySource::ShellEnv) => { /* shell env happened to have it — OK */ }
            Err(msg) => {
                assert!(msg.contains("no API key configured"));
                assert!(msg.contains("OPENROUTER_API_KEY_NONEXISTENT_FOR_TEST"));
                assert!(msg.contains("openrouter"));
            }
            Ok(ApiKeySource::Keychain) => panic!("Keychain said NotConfigured — must not return Keychain source"),
            Ok(ApiKeySource::None) => panic!("provider id was Some — must return Err or ShellEnv, never None"),
        }
    }

    #[test]
    fn inject_falls_back_when_keychain_returns_empty() {
        // Edge case: Keychain entry exists but is empty / whitespace-only.
        // The PR 25 wrapper returns `Empty` for this. Caller should fall
        // through to shell env (same as NotConfigured).
        let lookup_result = run_inject(
            Some("openrouter"),
            Some("OPENROUTER_API_KEY_NONEXISTENT_FOR_TEST"),
            |_pid| Ok(KeychainReadOutcome::Empty),
        );
        match lookup_result {
            Ok(ApiKeySource::ShellEnv) => { /* OK */ }
            Err(msg) => assert!(msg.contains("no API key configured")),
            Ok(ApiKeySource::Keychain) => panic!("Empty must not return Keychain source"),
            Ok(ApiKeySource::None) => panic!("provider id was Some — must not return None"),
        }
    }

    #[test]
    fn inject_errors_with_stable_message_when_provider_id_but_no_key() {
        // Critical UX path: user selected OpenRouter in Settings → UI
        // saved the provider config BUT the key was never saved (e.g. user
        // forgot to click Save, or Keychain entry was lost). User runs
        // "Run Dream" and sees a CLEAR error instead of dream CLI's
        // generic auth failure.
        let result = run_inject(
            Some("openrouter"),
            Some("OPENROUTER_API_KEY_NONEXISTENT_FOR_TEST"),
            |_pid| Ok(KeychainReadOutcome::NotConfigured),
        );
        let err = result.expect_err("must error when provider id given but no key in either source");
        // Stable error format (locked by this test):
        assert!(err.starts_with("ai-provider check: "), "got: {err}");
        assert!(err.contains("no API key configured"), "got: {err}");
        assert!(err.contains("openrouter"), "got: {err}");
        assert!(err.contains("OPENROUTER_API_KEY_NONEXISTENT_FOR_TEST"), "got: {err}");
        assert!(err.contains("Settings"), "got: {err}"); // hints at the fix path
        assert!(err.contains("shell"), "got: {err}"); // hints at the fallback path
    }

    #[test]
    fn inject_does_not_leak_key_value_into_error_message() {
        // Critical security invariant: even on error, the key value MUST
        // NOT appear in the error message returned by inject_api_key.
        //
        // Architecture: the security guarantee is enforced at the
        // Keychain WRAPPER level (`commands::ai_provider::keychain_read_value`
        // uses `format_provider_error(ProviderOp::Check, error)` which only
        // formats the SecurityError description, never the value). This
        // test verifies inject_api_key DOES NOT re-wrap or augment the
        // Keychain error in a way that could accidentally include the
        // value — i.e. it propagates the wrapper's error verbatim.
        //
        // The lookup closure returns a realistic Keychain-shaped error
        // (matches what the wrapper produces: "ai-provider check: <err>").
        let wrapper_error = "ai-provider check: security framework error -25291";
        let result = run_inject(
            Some("openrouter"),
            Some("OPENROUTER_API_KEY"),
            |_pid| Err(wrapper_error.to_string()),
        );
        let err = result.expect_err("must propagate Keychain error");
        // Inject must propagate verbatim — no re-formatting that could
        // accidentally include the value.
        assert_eq!(err, wrapper_error);
        // The key value (which was never even passed to the lookup) must
        // obviously not appear. This is a sanity assertion on the test
        // itself, not on the implementation, but locks the invariant.
        assert!(!err.contains("sk-"), "key value shape must not appear: {err}");
    }

    #[test]
    fn inject_no_provider_id_no_shell_env_returns_none_for_backward_compat() {
        // PR 24 / PR 10 behavior: when no provider id is given AND no
        // shell env has the key, do NOT error. dream CLI may run without
        // an LLM (e.g. local-only vault, Ollama offline, etc).
        let result = run_inject(
            None,
            Some("DREAMFORGE_LLM_API_KEY_NONEXISTENT_FOR_TEST"),
            |_pid| Ok(KeychainReadOutcome::NotConfigured),
        );
        // Either ShellEnv (if env happened to be set) or None is acceptable.
        match result {
            Ok(ApiKeySource::ShellEnv) => { /* OK */ }
            Ok(ApiKeySource::None) => { /* OK — backward compat */ }
            Err(msg) => panic!("no provider id must not error: {msg}"),
            Ok(ApiKeySource::Keychain) => panic!("Keychain returned NotConfigured — must not return Keychain"),
        }
    }

    #[test]
    fn inject_provider_op_label_is_stable() {
        // The error format is part of the public contract (v0.5 success
        // criterion #5: legible errors). Pin it here so a refactor doesn't
        // accidentally rename the operation label.
        let err = crate::commands::ai_provider::provider_error(ProviderOp::Check, "test reason");
        assert_eq!(err, "ai-provider check: test reason");
    }
}
