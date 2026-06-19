#[cfg(desktop)]
use std::process::Command;

#[cfg(desktop)]
use crate::menu;
use crate::settings::Settings;
use crate::vault_list;
use crate::vault_list::VaultList;
use serde::Deserialize;
// DREAMFORGE_SLIM: tauri::ipc::Channel 物理删除 (PR 7, app_updater commands 已删)
// DREAMFORGE_SLIM: tauri::LogicalSize / tauri::Window 物理删除 (PR 7, 确认没 user)
#[cfg(desktop)]
use tauri::LogicalSize;
#[cfg(desktop)]
use tauri::Window;

use super::parse_build_label;

#[cfg(desktop)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TitleBarDoubleClickAction {
    Fill,
    Minimize,
    None,
}

#[cfg(desktop)]
fn parse_title_bar_double_click_action(value: &str) -> Option<TitleBarDoubleClickAction> {
    match value.trim().to_ascii_lowercase().as_str() {
        "fill" | "zoom" | "maximize" => Some(TitleBarDoubleClickAction::Fill),
        "minimize" => Some(TitleBarDoubleClickAction::Minimize),
        "none" | "no action" | "do nothing" => Some(TitleBarDoubleClickAction::None),
        _ => None,
    }
}

#[cfg(desktop)]
fn parse_legacy_title_bar_double_click_action(value: &str) -> Option<TitleBarDoubleClickAction> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" => Some(TitleBarDoubleClickAction::Minimize),
        "0" | "false" | "no" => Some(TitleBarDoubleClickAction::Fill),
        _ => None,
    }
}

#[cfg(desktop)]
fn read_global_defaults_value(key: &str) -> Option<String> {
    let output = Command::new("defaults")
        .args(["read", "-g", key])
        .output()
        .ok()?;
    parse_defaults_read_output(output)
}

#[cfg(desktop)]
fn resolve_title_bar_double_click_action(
    read_value: impl Fn(&str) -> Option<String>,
) -> TitleBarDoubleClickAction {
    read_value("AppleActionOnDoubleClick")
        .as_deref()
        .and_then(parse_title_bar_double_click_action)
        .or_else(|| {
            read_value("AppleMiniaturizeOnDoubleClick")
                .as_deref()
                .and_then(parse_legacy_title_bar_double_click_action)
        })
        .unwrap_or(TitleBarDoubleClickAction::Fill)
}

#[cfg(desktop)]
fn parse_defaults_read_output(output: std::process::Output) -> Option<String> {
    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8(output.stdout).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

#[cfg(desktop)]
fn apply_title_bar_double_click_action(
    action: TitleBarDoubleClickAction,
    is_maximized: impl FnOnce() -> Result<bool, String>,
    maximize: impl FnOnce() -> Result<(), String>,
    unmaximize: impl FnOnce() -> Result<(), String>,
    minimize: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    match action {
        TitleBarDoubleClickAction::Fill => {
            if is_maximized()? {
                unmaximize()
            } else {
                maximize()
            }
        }
        TitleBarDoubleClickAction::Minimize => minimize(),
        TitleBarDoubleClickAction::None => Ok(()),
    }
}

// DREAMFORGE_SLIM: 5 mcp commands (desktop + mobile) 物理删除 (PR 4)

// ── Menu commands ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuStateUpdate {
    has_active_note: bool,
    has_modified_files: Option<bool>,
    has_conflicts: Option<bool>,
    has_restorable_deleted_note: Option<bool>,
    has_no_remote: Option<bool>,
    note_list_search_enabled: Option<bool>,
    editor_find_enabled: Option<bool>,
}

#[cfg(desktop)]
#[tauri::command]
pub fn update_menu_state(
    app_handle: tauri::AppHandle,
    state: MenuStateUpdate,
) -> Result<(), String> {
    menu::set_note_items_enabled(&app_handle, state.has_active_note);
    if let Some(v) = state.has_modified_files {
        menu::set_git_commit_items_enabled(&app_handle, v);
    }
    if let Some(v) = state.has_conflicts {
        menu::set_git_conflict_items_enabled(&app_handle, v);
    }
    if let Some(v) = state.has_restorable_deleted_note {
        menu::set_restore_deleted_item_enabled(&app_handle, v);
    }
    if let Some(v) = state.has_no_remote {
        menu::set_git_no_remote_items_enabled(&app_handle, v);
    }
    if let Some(v) = state.note_list_search_enabled {
        menu::set_note_list_search_items_enabled(&app_handle, v);
    }
    if let Some(v) = state.editor_find_enabled {
        menu::set_editor_find_items_enabled(&app_handle, v);
    }
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub fn update_menu_state(
    _app_handle: tauri::AppHandle,
    _state: MenuStateUpdate,
) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub fn trigger_menu_command(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    menu::emit_custom_menu_event(&app_handle, &id)
}

#[cfg(mobile)]
#[tauri::command]
pub fn trigger_menu_command(_app_handle: tauri::AppHandle, _id: String) -> Result<(), String> {
    Err("Native menu commands are not available on mobile".into())
}

#[cfg(desktop)]
fn should_apply_window_min_size_constraints(
    is_windows: bool,
    is_fullscreen: bool,
    is_maximized: bool,
) -> bool {
    !(is_windows && (is_fullscreen || is_maximized))
}

#[cfg(desktop)]
fn should_skip_window_min_size_update(window: &Window) -> Result<bool, String> {
    if !cfg!(target_os = "windows") {
        return Ok(false);
    }

    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;

    Ok(!should_apply_window_min_size_constraints(
        true,
        is_fullscreen,
        is_maximized,
    ))
}

#[cfg(desktop)]
fn apply_window_min_size_update(
    window: &Window,
    min_width: f64,
    min_height: f64,
    grow_to_fit: bool,
) -> Result<(), String> {
    window
        .set_min_size(Some(LogicalSize::new(min_width, min_height)))
        .map_err(|e| e.to_string())?;

    if !grow_to_fit {
        return Ok(());
    }

    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let current_size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);

    let next_width = current_size.width.max(min_width);
    let next_height = current_size.height.max(min_height);
    if next_width == current_size.width && next_height == current_size.height {
        return Ok(());
    }

    window
        .set_size(LogicalSize::new(next_width, next_height))
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub fn update_current_window_min_size(
    window: Window,
    min_width: f64,
    min_height: f64,
    grow_to_fit: bool,
) -> Result<(), String> {
    if should_skip_window_min_size_update(&window)? {
        return Ok(());
    }

    apply_window_min_size_update(&window, min_width, min_height, grow_to_fit)
}

#[cfg(desktop)]
#[tauri::command]
pub fn perform_current_window_titlebar_double_click(window: Window) -> Result<(), String> {
    let action = resolve_title_bar_double_click_action(read_global_defaults_value);

    apply_title_bar_double_click_action(
        action,
        || window.is_maximized().map_err(|e| e.to_string()),
        || window.maximize().map_err(|e| e.to_string()),
        || window.unmaximize().map_err(|e| e.to_string()),
        || window.minimize().map_err(|e| e.to_string()),
    )
}

#[cfg(mobile)]
#[tauri::command]
pub fn update_current_window_min_size(
    _window: tauri::Window,
    _min_width: f64,
    _min_height: f64,
    _grow_to_fit: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub fn perform_current_window_titlebar_double_click(_window: tauri::Window) -> Result<(), String> {
    Ok(())
}

// ── Settings & config commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_build_number(app_handle: tauri::AppHandle) -> String {
    let version = app_handle.package_info().version.to_string();
    parse_build_label(&version)
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    crate::settings::get_settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    crate::settings::save_settings(settings)
}

// PR 17: Settings export/import. Envelope format:
//   { "version": 1, "kind": "dreamforge-settings",
//     "exported_at": "2026-06-18T21:47:37Z", "app_version": "0.3.0",
//     "settings": { ...17 fields... } }
// The envelope is forward-compatible (version field for future migrations)
// and rejects unrelated JSON files (kind discriminator).

const SETTINGS_ENVELOPE_KIND: &str = "dreamforge-settings";
const SETTINGS_ENVELOPE_VERSION: u32 = 1;

#[derive(serde::Serialize)]
struct SettingsExportEnvelope<'a> {
    version: u32,
    kind: &'a str,
    exported_at: String,
    app_version: &'a str,
    settings: &'a Settings,
}

#[derive(serde::Deserialize)]
struct SettingsImportEnvelope {
    #[serde(default)]
    version: Option<u32>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    settings: Option<Settings>,
}

fn envelope_error(message: impl Into<String>) -> String {
    format!("Invalid settings file: {}", message.into())
}

fn build_settings_export_json(
    settings: &Settings,
    app_version: &str,
    exported_at: String,
) -> Result<String, String> {
    let envelope = SettingsExportEnvelope {
        version: SETTINGS_ENVELOPE_VERSION,
        kind: SETTINGS_ENVELOPE_KIND,
        exported_at,
        app_version,
        settings,
    };
    serde_json::to_string_pretty(&envelope)
        .map_err(|e| format!("Failed to serialize settings envelope: {}", e))
}

fn parse_settings_import_json(content: &str) -> Result<Settings, String> {
    let envelope: SettingsImportEnvelope = serde_json::from_str(content)
        .map_err(|e| envelope_error(format!("could not parse JSON ({})", e)))?;
    let kind = envelope.kind.as_deref().unwrap_or("");
    if kind != SETTINGS_ENVELOPE_KIND {
        return Err(envelope_error(format!(
            "expected kind {:?} but found {:?}",
            SETTINGS_ENVELOPE_KIND, kind
        )));
    }
    let version = envelope.version.unwrap_or(0);
    if version == 0 || version > SETTINGS_ENVELOPE_VERSION {
        return Err(envelope_error(format!(
            "unsupported envelope version {} (this build supports up to {})",
            version, SETTINGS_ENVELOPE_VERSION
        )));
    }
    envelope
        .settings
        .ok_or_else(|| envelope_error("missing 'settings' field"))
}

#[tauri::command]
pub fn export_settings_to(path: String) -> Result<u64, String> {
    let settings = crate::settings::get_settings()?;
    let app_version = env!("CARGO_PKG_VERSION");
    let json = build_settings_export_json(&settings, app_version, current_iso8601_utc())?;
    let target = std::path::PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create export directory: {}", e))?;
        }
    }
    std::fs::write(&target, &json)
        .map_err(|e| format!("Failed to write settings export: {}", e))?;
    Ok(json.len() as u64)
}

#[tauri::command]
pub fn import_settings_from(path: String) -> Result<Settings, String> {
    let source = std::path::PathBuf::from(&path);
    let content = std::fs::read_to_string(&source)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    let settings = parse_settings_import_json(&content)?;
    crate::settings::save_settings(settings)?;
    crate::settings::get_settings()
}

fn current_iso8601_utc() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Minimal ISO 8601 (UTC) formatter — YYYY-MM-DDTHH:MM:SSZ.
    // Seconds precision is sufficient for an export timestamp.
    let secs_per_day = 86_400u64;
    let secs_per_hour = 3_600u64;
    let secs_per_min = 60u64;
    let days = now / secs_per_day;
    let secs_today = now % secs_per_day;
    let hour = secs_today / secs_per_hour;
    let secs_in_hour = secs_today % secs_per_hour;
    let minute = secs_in_hour / secs_per_min;
    let second = secs_in_hour % secs_per_min;
    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

// Civil-from-days algorithm by Howard Hinnant (public domain).
fn days_to_ymd(days_since_epoch: u64) -> (i32, u32, u32) {
    let z = days_since_epoch as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y } as i32;
    (y, m, d)
}

// DREAMFORGE_SLIM: get_ai_workspace_sessions / save_ai_workspace_sessions 物理删除 (PR 4)

// DREAMFORGE_SLIM: 2 app_updater commands (desktop + mobile) 物理删除 (PR 4)

// DREAMFORGE_SLIM: reinit_telemetry 物理删除 (PR 4, telemetry.rs Sentry 全 no-op)

#[tauri::command]
pub fn load_vault_list() -> Result<VaultList, String> {
    vault_list::load_vault_list()
}

#[tauri::command]
pub fn save_vault_list(list: VaultList) -> Result<(), String> {
    vault_list::save_vault_list(&list)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(desktop)]
    use std::cell::RefCell;
    #[cfg(desktop)]
    use std::os::unix::process::ExitStatusExt;
    #[cfg(desktop)]
    use std::process::{ExitStatus, Output};
    #[cfg(desktop)]
    use std::rc::Rc;

    #[test]
    fn parses_title_bar_action_values() {
        for (value, expected) in [
            ("Fill", Some(TitleBarDoubleClickAction::Fill)),
            ("zoom", Some(TitleBarDoubleClickAction::Fill)),
            ("Minimize", Some(TitleBarDoubleClickAction::Minimize)),
            ("No Action", Some(TitleBarDoubleClickAction::None)),
            ("tile", None),
        ] {
            assert_eq!(parse_title_bar_double_click_action(value), expected);
        }

        for (value, expected) in [
            ("1", Some(TitleBarDoubleClickAction::Minimize)),
            ("false", Some(TitleBarDoubleClickAction::Fill)),
            ("maybe", None),
        ] {
            assert_eq!(parse_legacy_title_bar_double_click_action(value), expected);
        }
    }

    #[test]
    fn resolves_title_bar_action_preferences() {
        assert_eq!(
            resolve_with(&[
                ("AppleActionOnDoubleClick", "No Action"),
                ("AppleMiniaturizeOnDoubleClick", "1"),
            ]),
            TitleBarDoubleClickAction::None
        );
        assert_eq!(
            resolve_with(&[("AppleMiniaturizeOnDoubleClick", "1")]),
            TitleBarDoubleClickAction::Minimize
        );
        assert_eq!(
            resolve_with(&[
                ("AppleActionOnDoubleClick", "tile"),
                ("AppleMiniaturizeOnDoubleClick", "1"),
            ]),
            TitleBarDoubleClickAction::Minimize
        );
        assert_eq!(resolve_with(&[]), TitleBarDoubleClickAction::Fill);
    }

    #[test]
    fn parses_defaults_output_variants() {
        for (code, stdout, expected) in [
            (0, b" Maximize \n".to_vec(), Some("Maximize")),
            (1, b"Minimize\n".to_vec(), None),
            (0, b"   \n".to_vec(), None),
            (0, vec![0xff], None),
        ] {
            assert_eq!(
                parse_defaults_read_output(output(code, stdout)),
                expected.map(str::to_string)
            );
        }
    }

    #[test]
    fn routes_title_bar_actions_to_expected_window_calls() {
        for (action, state, expected_calls) in [
            (
                TitleBarDoubleClickAction::Fill,
                Ok(false),
                vec!["is_maximized", "maximize"],
            ),
            (
                TitleBarDoubleClickAction::Fill,
                Ok(true),
                vec!["is_maximized", "unmaximize"],
            ),
            (
                TitleBarDoubleClickAction::Minimize,
                Ok(false),
                vec!["minimize"],
            ),
            (TitleBarDoubleClickAction::None, Ok(false), Vec::new()),
        ] {
            let (result, calls) = run_action(action, state, Ok(()), Ok(()), Ok(()));
            assert_eq!(result, Ok(()));
            assert_eq!(calls, expected_calls);
        }
    }

    #[test]
    fn skips_min_size_updates_for_windows_fullscreen_or_maximized_windows() {
        for (is_fullscreen, is_maximized) in [(true, false), (false, true), (true, true)] {
            assert!(!should_apply_window_min_size_constraints(
                true,
                is_fullscreen,
                is_maximized
            ));
        }

        assert!(should_apply_window_min_size_constraints(true, false, false));
        assert!(should_apply_window_min_size_constraints(false, true, true));
    }

    #[test]
    fn propagates_title_bar_action_errors() {
        for (state, maximize, unmaximize, expected) in [
            (Err("state"), Ok(()), Ok(()), "state"),
            (Ok(false), Err("maximize"), Ok(()), "maximize"),
            (Ok(true), Ok(()), Err("unmaximize"), "unmaximize"),
        ] {
            let (result, _) = run_action(
                TitleBarDoubleClickAction::Fill,
                state,
                maximize,
                unmaximize,
                Ok(()),
            );
            assert_eq!(result, Err(expected.to_string()));
        }
    }

    fn exit_status(code: i32) -> ExitStatus {
        ExitStatus::from_raw(code << 8)
    }

    fn output(code: i32, stdout: Vec<u8>) -> Output {
        Output {
            status: exit_status(code),
            stdout,
            stderr: Vec::new(),
        }
    }

    fn resolve_with(values: &[(&str, &str)]) -> TitleBarDoubleClickAction {
        resolve_title_bar_double_click_action(|key| {
            values
                .iter()
                .find(|(candidate, _)| *candidate == key)
                .map(|(_, value)| (*value).to_string())
        })
    }

    fn run_action(
        action: TitleBarDoubleClickAction,
        state: Result<bool, &'static str>,
        maximize: Result<(), &'static str>,
        unmaximize: Result<(), &'static str>,
        minimize: Result<(), &'static str>,
    ) -> (Result<(), String>, Vec<&'static str>) {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let state_calls = Rc::clone(&calls);
        let maximize_calls = Rc::clone(&calls);
        let unmaximize_calls = Rc::clone(&calls);
        let minimize_calls = Rc::clone(&calls);
        let result = apply_title_bar_double_click_action(
            action,
            move || {
                state_calls.borrow_mut().push("is_maximized");
                state.map_err(str::to_string)
            },
            move || {
                maximize_calls.borrow_mut().push("maximize");
                maximize.map_err(str::to_string)
            },
            move || {
                unmaximize_calls.borrow_mut().push("unmaximize");
                unmaximize.map_err(str::to_string)
            },
            move || {
                minimize_calls.borrow_mut().push("minimize");
                minimize.map_err(str::to_string)
            },
        );
        let call_log = calls.borrow().clone();
        (result, call_log)
    }

    // PR 17: settings export/import envelope round-trip + error paths.
    // These exercise the pure parse/build helpers without touching the
    // real APP_CONFIG_DIR settings file.

    fn sample_settings() -> Settings {
        let mut s = Settings::default();
        s.theme_mode = Some("dark".to_string());
        s.ui_language = Some("zh-CN".to_string());
        s.release_channel = Some("alpha".to_string());
        s.hide_gitignored_files = Some(false);
        s.anonymous_id = Some("test-anon-1234".to_string());
        s
    }

    #[test]
    fn export_envelope_round_trips_through_import() {
        let original = sample_settings();
        let json = build_settings_export_json(&original, "0.3.0", "2026-06-18T21:00:00Z".to_string())
            .expect("export should serialize");
        let restored = parse_settings_import_json(&json).expect("import should parse exported JSON");
        assert_eq!(restored.theme_mode, original.theme_mode);
        assert_eq!(restored.ui_language, original.ui_language);
        assert_eq!(restored.release_channel, original.release_channel);
        assert_eq!(restored.hide_gitignored_files, original.hide_gitignored_files);
        assert_eq!(restored.anonymous_id, original.anonymous_id);
    }

    #[test]
    fn export_envelope_round_trips_ai_provider_config_v0_5() {
        // v0.5 PR 23: the export/import envelope must preserve the new AI
        // provider config (`ai_model_providers` array + `default_ai_target`)
        // byte-for-byte so a user who exports settings, wipes settings.json,
        // and imports again lands on identical provider config. The fields
        // are opaque serde_json::Value on the Rust side — the envelope must
        // not flatten, drop, or rename them.
        let mut original = sample_settings();
        original.ai_model_providers = Some(vec![
            serde_json::json!({
                "id": "openrouter",
                "kind": "open_router",
                "api_key_env_var": "OPENROUTER_API_KEY",
                "base_url": "https://openrouter.ai/api/v1",
                "models": [
                    {"id": "anthropic/claude-sonnet-4.5", "label": "Claude Sonnet 4.5"},
                ],
            }),
            serde_json::json!({
                "id": "anthropic-direct",
                "kind": "anthropic",
                "api_key_env_var": "ANTHROPIC_API_KEY",
                "base_url": "https://api.anthropic.com",
            }),
        ]);
        original.default_ai_target = Some("openrouter".to_string());

        let json = build_settings_export_json(&original, "0.5.0", "2026-06-20T10:00:00Z".to_string())
            .expect("export should serialize");
        let restored = parse_settings_import_json(&json).expect("import should parse exported JSON");

        let restored_providers = restored
            .ai_model_providers
            .as_ref()
            .expect("ai_model_providers must round-trip");
        assert_eq!(restored_providers.len(), 2);
        assert_eq!(restored_providers[0]["id"], "openrouter");
        assert_eq!(restored_providers[0]["api_key_env_var"], "OPENROUTER_API_KEY");
        assert_eq!(restored_providers[0]["models"][0]["id"], "anthropic/claude-sonnet-4.5");
        assert_eq!(restored_providers[1]["kind"], "anthropic");
        assert_eq!(restored_providers[1]["base_url"], "https://api.anthropic.com");

        assert_eq!(restored.default_ai_target.as_deref(), Some("openrouter"));

        // Regression guard: the JSON envelope must surface the field under
        // its snake_case name and NOT collapse it into a sibling structure.
        let value: serde_json::Value = serde_json::from_str(&json).expect("envelope is JSON");
        let provider_arr = value["settings"]["ai_model_providers"]
            .as_array()
            .expect("settings.ai_model_providers must be an array");
        assert_eq!(provider_arr.len(), 2);
        assert_eq!(value["settings"]["default_ai_target"], "openrouter");
    }

    #[test]
    fn export_envelope_includes_metadata() {
        let json = build_settings_export_json(
            &Settings::default(),
            "0.3.0",
            "2026-06-18T21:00:00Z".to_string(),
        )
        .expect("export should serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("envelope is JSON");
        assert_eq!(value["version"], 1);
        assert_eq!(value["kind"], "dreamforge-settings");
        assert_eq!(value["app_version"], "0.3.0");
        assert_eq!(value["exported_at"], "2026-06-18T21:00:00Z");
        assert!(value["settings"].is_object());
    }

    #[test]
    fn import_rejects_wrong_kind() {
        let bad = serde_json::json!({
            "version": 1,
            "kind": "not-dreamforge",
            "settings": {}
        })
        .to_string();
        let err = parse_settings_import_json(&bad).expect_err("wrong kind must be rejected");
        assert!(err.contains("expected kind"), "got: {err}");
    }

    #[test]
    fn import_rejects_unsupported_version() {
        let bad = serde_json::json!({
            "version": 99,
            "kind": "dreamforge-settings",
            "settings": {}
        })
        .to_string();
        let err = parse_settings_import_json(&bad).expect_err("future version must be rejected");
        assert!(err.contains("unsupported envelope version"), "got: {err}");
    }

    #[test]
    fn import_rejects_zero_version() {
        let bad = serde_json::json!({
            "version": 0,
            "kind": "dreamforge-settings",
            "settings": {}
        })
        .to_string();
        let err = parse_settings_import_json(&bad).expect_err("version 0 must be rejected");
        assert!(err.contains("unsupported envelope version"), "got: {err}");
    }

    #[test]
    fn import_rejects_malformed_json() {
        let err = parse_settings_import_json("not json at all")
            .expect_err("malformed JSON must be rejected");
        assert!(err.starts_with("Invalid settings file:"), "got: {err}");
    }

    #[test]
    fn import_rejects_envelope_without_settings_field() {
        let bad = serde_json::json!({
            "version": 1,
            "kind": "dreamforge-settings",
            "exported_at": "2026-06-18T21:00:00Z"
        })
        .to_string();
        let err = parse_settings_import_json(&bad).expect_err("missing settings must be rejected");
        assert!(err.contains("missing 'settings' field"), "got: {err}");
    }

    #[test]
    fn days_to_ymd_known_dates() {
        // 2026-06-18 = epoch day 20622 (verified by hand: 56 years + 168 days from 1970-01-01).
        assert_eq!(days_to_ymd(20622), (2026, 6, 18));
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
        assert_eq!(days_to_ymd(365), (1971, 1, 1));
    }
}
