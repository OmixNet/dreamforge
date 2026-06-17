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

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

/// PR 10: env var name for OpenAI-compatible LLM API key.
/// Read from user's shell env; injected into dream subprocess only — never CLI args.
const LLM_API_KEY_ENV: &str = "DREAMFORGE_LLM_API_KEY";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DreamVaultAction {
    Status,
    Run,
    Report,
}

impl DreamVaultAction {
    fn subcommand(self) -> &'static str {
        match self {
            DreamVaultAction::Status => "status",
            DreamVaultAction::Run => "run",
            DreamVaultAction::Report => "report",
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

pub fn build_dreamvault_command(
    action: DreamVaultAction,
    vault_path: &str,
    dream_cli_path: Option<&str>,
    llm_base_url: Option<&str>, // PR 10
    llm_model: Option<&str>,     // PR 10
) -> DreamVaultCommandSpec {
    let mut args = vec![
        action.subcommand().to_string(),
        "--vault".to_string(),
        vault_path.to_string(),
    ];

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
) -> Result<DreamVaultCommandOutput, String> {
    let spec = build_dreamvault_command(
        action,
        vault_path,
        dream_cli_path,
        llm_base_url,
        llm_model,
    );

    let mut command = Command::new(&spec.program);
    command.args(&spec.args);

    // PR 10: inject DREAMFORGE_LLM_API_KEY from user's shell env into dream subprocess
    // (key never enters CLI args; ps aux shows env var NAME only, not value)
    if let Ok(key) = std::env::var(LLM_API_KEY_ENV) {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            command.env(LLM_API_KEY_ENV, trimmed);
        }
    }

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
    llm_base_url: Option<String>, // PR 10
    llm_model: Option<String>,     // PR 10
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Status,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault status task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_run(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>, // PR 10
    llm_model: Option<String>,     // PR 10
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Run,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault run task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_report(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>, // PR 10
    llm_model: Option<String>,     // PR 10
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Report,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
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
        );

        assert_eq!(spec.program, "/opt/dream/bin/dream");
        assert_eq!(spec.args, vec!["status", "--vault", "/tmp/vault"]);
    }

    #[test]
    fn run_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            Some("/opt/dream/bin/dream"),
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
        );

        assert_eq!(
            spec.args,
            vec!["run", "--vault", "/tmp/vault", "--model", "llama3.1"]
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
}
