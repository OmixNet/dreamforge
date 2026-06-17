// DREAMFORGE_SLIM: telemetry.rs Sentry 物理删除 (PR 4)
// - SENTRY_GUARD / scrub_paths / normalize_embedded_env / normalize_http_like_value
//   parse_embedded_sentry_dsn / is_stable_calendar_release / sentry_release_for_version
//   sentry_release_kind / init_sentry_from_settings / reinit_sentry 全删
// - 9 个 test 全删
//
// v0.1 关闭 Sentry crash reporting；trackEvent 在前端已是 no-op（DREAMFORGE_SLIM_MODE guard）

/// v0.1 stub: Sentry disabled. 保留模块路径便于 lib.rs 中 `telemetry::init_sentry_from_settings()` 不报 unresolvable。
/// Returns `false` 表示"未初始化"，调用方据此跳过上报分支。
pub fn init_sentry_from_settings() -> bool {
    false
}

/// v0.1 stub: reinit no-op。保留供 commands/system.rs 中 reinit_telemetry 引用（PR 4 该 command 也已删）。
pub fn reinit_sentry() {}
