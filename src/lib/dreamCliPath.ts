/**
 * Dream CLI path resolution & persistence (2026-06-17)
 *
 * Path resolution priority (mirrors Rust side in `src-tauri/src/commands/dreamvault.rs`):
 *   1. User-configured path (Settings → localStorage)
 *   2. `DREAMFORGE_DREAM_CLI` environment variable
 *   3. Local DreamVault build fallback for this self-hosted DreamForge app
 *   4. `dream` on `PATH` (resolved by the OS when the Rust side spawns the subprocess)
 *
 * The Rust side receives the user-configured path as the `dream_cli_path` function
 * argument and falls back to env / PATH itself. This module only owns the persistence
 * and the dev-mode helper for the Settings panel.
 *
 * PR 10 (v0.2): also persists LLM provider config (base URL + model). The API key
 * is NEVER stored here — it comes from the user's shell env `DREAMFORGE_LLM_API_KEY`
 * at runtime and is injected into the dream subprocess only.
 */

const STORAGE_KEY = 'dreamforge.dreamCliPath'
const STORAGE_KEY_LLM_BASE_URL = 'dreamforge.llmBaseUrl'
const STORAGE_KEY_LLM_MODEL = 'dreamforge.llmModel'

export function readDreamCliPath(): string {
  return readStringFromStorage(STORAGE_KEY)
}

export function writeDreamCliPath(value: string): void {
  writeStringToStorage(STORAGE_KEY, value)
}

/**
 * Returns the most specific configured path to pass to the Rust side. The Rust
 * side is still authoritative for env / local build / PATH fallback; we never
 * need to know whether `dream` exists from JS.
 */
export function resolveDreamCliPathForInvoke(): string | null {
  const explicit = readDreamCliPath()
  return explicit.length > 0 ? explicit : null
}

// PR 10: LLM provider settings (base URL + model name).
// API key is NOT persisted — read from env at runtime.

export function readLlmBaseUrl(): string {
  return readStringFromStorage(STORAGE_KEY_LLM_BASE_URL)
}

export function writeLlmBaseUrl(value: string): void {
  writeStringToStorage(STORAGE_KEY_LLM_BASE_URL, value)
}

export function readLlmModel(): string {
  return readStringFromStorage(STORAGE_KEY_LLM_MODEL)
}

export function writeLlmModel(value: string): void {
  writeStringToStorage(STORAGE_KEY_LLM_MODEL, value)
}

/**
 * Returns LLM provider config to pass to the Rust side. Empty strings are
 * treated as "use dream CLI default" (no flag passed).
 */
export function resolveLlmConfigForInvoke(): { llmBaseUrl: string | null; llmModel: string | null } {
  const baseUrl = readLlmBaseUrl()
  const model = readLlmModel()
  return {
    llmBaseUrl: baseUrl.length > 0 ? baseUrl : null,
    llmModel: model.length > 0 ? model : null,
  }
}

// Internal helpers

function readStringFromStorage(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const value = window.localStorage.getItem(key)
    return value?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeStringToStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    if (value.trim().length === 0) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value.trim())
    }
  } catch {
    // localStorage may be disabled (private browsing, etc.) — silently ignore.
  }
}
