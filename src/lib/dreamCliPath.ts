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
// v0.5 PR 24 P2a: env var NAME (not value) for the active provider's API key.
// Stores e.g. "OPENROUTER_API_KEY" / "ANTHROPIC_API_KEY" / "GEMINI_API_KEY".
// v0.5 PR 27 P2c-1.5: the KEY VALUE lives in macOS Keychain (PR 25), so
// the user's shell env is now the FALLBACK (PR 24 behavior). DreamX Rust
// reads from Keychain first by provider id, falls back to this env var name.
const STORAGE_KEY_LLM_API_KEY_ENV = 'dreamforge.llmApiKeyEnv'
// v0.5 PR 27 P2c-1.5: provider id for the active provider. Written together
// with `llmApiKeyEnv` so DreamPanel can pass BOTH to `dreamvault_run` and
// the Rust side can look up the API key in macOS Keychain by provider id.
const STORAGE_KEY_LLM_API_KEY_PROVIDER_ID = 'dreamforge.llmApiKeyProviderId'

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

/**
 * v0.5 PR 24 P2a: returns the env var NAME (not the value) where the user's
 * shell holds the active provider's API key. DreamX reads this env var from
 * the user's shell and injects the value into the dream subprocess as
 * `DREAMFORGE_LLM_API_KEY` (dream CLI keeps its existing contract).
 *
 * The KEY VALUE never enters localStorage, settings.json, git, or CLI args —
 * only the env var NAME is stored here, mirroring how `dreamforge.llmBaseUrl`
 * and `dreamforge.llmModel` already work.
 *
 * Empty / unset → null (Rust falls back to the legacy `DREAMFORGE_LLM_API_KEY`
 * env var per PR 10).
 */
export function resolveLlmApiKeyEnvForInvoke(): string | null {
  const envName = readLlmApiKeyEnv()
  return envName.length > 0 ? envName : null
}

/**
 * v0.5 PR 27 P2c-1.5: returns the active provider id (e.g. "openrouter-abc123")
 * so the Rust side can look up the API key in macOS Keychain (PR 25 wrapper)
 * BEFORE falling back to the shell env var. Paired with
 * `resolveLlmApiKeyEnvForInvoke` — both are set together when the user saves
 * a provider in Settings and cleared together on delete.
 *
 * Empty / unset → null (Rust treats this as "no Keychain lookup; shell env only").
 */
export function resolveLlmApiKeyProviderIdForInvoke(): string | null {
  const providerId = readLlmApiKeyProviderIdPublic()
  return providerId.length > 0 ? providerId : null
}

// Internal helpers

function readLlmApiKeyEnv(): string {
  return readStringFromStorage(STORAGE_KEY_LLM_API_KEY_ENV)
}

export function writeLlmApiKeyEnv(value: string): void {
  writeStringToStorage(STORAGE_KEY_LLM_API_KEY_ENV, value)
}

export function readLlmApiKeyEnvPublic(): string {
  return readLlmApiKeyEnv()
}

/**
 * v0.5 PR 27 P2c-1.5: provider id of the active LLM provider. Paired
 * with `llmApiKeyEnv` — both are set together after a successful save
 * and cleared together after delete. Read by DreamPanel at dream CLI
 * invocation time so the Rust side can look up the API key in macOS
 * Keychain by provider id (PR 25 wrapper).
 */
export function writeLlmApiKeyProviderId(value: string): void {
  writeStringToStorage(STORAGE_KEY_LLM_API_KEY_PROVIDER_ID, value)
}

export function readLlmApiKeyProviderIdPublic(): string {
  return readStringFromStorage(STORAGE_KEY_LLM_API_KEY_PROVIDER_ID)
}

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
