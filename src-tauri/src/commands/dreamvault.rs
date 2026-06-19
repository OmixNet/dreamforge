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
    llm_api_key_env: Option<&str>,
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

    // v0.5 P2a: read the API key from the provider-specific env var (e.g.
    // OPENROUTER_API_KEY) when TS passes an override; otherwise fall back
    // to the legacy DREAMFORGE_LLM_API_KEY (PR 10). The value is injected
    // into the dream subprocess as DREAMFORGE_LLM_API_KEY — dream CLI Swift
    // code reads only that name, so the contract stays stable across PRs.
    //
    // Safety invariant: the key NEVER enters dream CLI args (ps aux would
    // leak it). It only travels via Command::env() into the subprocess env.
    let source_env = resolve_api_key_env_name(llm_api_key_env);
    if let Ok(key) = std::env::var(source_env) {
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
    llm_base_url: Option<String>,         // PR 10
    llm_model: Option<String>,            // PR 10
    llm_api_key_env: Option<String>,      // v0.5 P2a
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Status,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault status task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_run(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>,         // PR 10
    llm_model: Option<String>,            // PR 10
    llm_api_key_env: Option<String>,      // v0.5 P2a
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Run,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("DreamVault run task failed: {error}"))?
}

#[tauri::command]
pub async fn dreamvault_report(
    vault_path: String,
    dream_cli_path: Option<String>,
    llm_base_url: Option<String>,         // PR 10
    llm_model: Option<String>,            // PR 10
    llm_api_key_env: Option<String>,      // v0.5 P2a
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(
            DreamVaultAction::Report,
            &vault_path,
            dream_cli_path.as_deref(),
            llm_base_url.as_deref(),
            llm_model.as_deref(),
            llm_api_key_env.as_deref(),
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
}
