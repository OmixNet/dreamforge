/**
 * DreamForge Slim mode flag (2026-06-17)
 *
 * When `DREAMFORGE_SLIM_MODE = true`:
 * - Hide AI / MCP / updater / clone-getting-started / feedback / release-channel UI entries
 * - Disable telemetry network calls (Sentry / PostHog)
 * - Keep all underlying hooks, imports, and code paths so test coverage is preserved
 *
 * The flag is intended to be flipped to `false` only at Phase 4 of the Slim roadmap
 * (after physical deletion of unused modules). Until then the Slim mode is the
 * shipping state of DreamForge v0.1.
 */
export const DREAMFORGE_SLIM_MODE = true
