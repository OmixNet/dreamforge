import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { AiModelProvider } from '../lib/aiTargets'

/**
 * v0.5 PR 26 P2c-1: TS wrappers around the PR 25 Keychain tauri commands.
 *
 * Key invariants:
 *   - `apiKey` parameter is the actual key VALUE (forwarded to Keychain via
 *     the tauri command). It is NEVER stored, logged, or returned.
 *   - `hasAiModelProviderApiKey` returns only a bool — the key VALUE is
 *     fetched by the Rust side and immediately dropped, never crossing the
 *     IPC boundary as a value.
 *
 * v0.5 scope (per user 2026-06-19): NO `testAiModelProvider` impl — HTTP
 * smoke test deferred. Test connection button is hidden in the UI.
 */

export async function saveAiModelProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  if (!isTauri()) return
  await invoke('save_ai_model_provider_api_key', { providerId, apiKey })
}

export async function deleteAiModelProviderApiKey(providerId: string): Promise<void> {
  if (!isTauri()) return
  await invoke('delete_ai_model_provider_api_key', { providerId })
}

export interface ProviderKeyStatus {
  providerId: string
  configured: boolean
}

/**
 * Returns whether the given provider has an API key configured in
 * macOS Keychain. The KEY VALUE never leaves the Rust process — this
 * fn only receives `{ provider_id, configured: bool }`.
 */
export async function hasAiModelProviderApiKey(providerId: string): Promise<boolean> {
  if (!isTauri()) {
    // In mock / browser mode, surface a sensible default so the UI
    // renders without errors. Test suites should override via
    // `mockInvoke.mockResolvedValueOnce({ provider_id, configured: true })`.
    const result = await mockInvoke<ProviderKeyStatus>('has_ai_model_provider_api_key', { providerId })
    return result?.configured ?? false
  }
  const result = await invoke<ProviderKeyStatus>('has_ai_model_provider_api_key', { providerId })
  return result?.configured ?? false
}

/**
 * v0.5 scope: HTTP smoke test is explicitly deferred (per user
 * 2026-06-19 — security boundary / network noise split). The Rust
 * `test_ai_model_provider` command does NOT exist in this build. This
 * stub is kept so callers that conditionally use it (e.g. an
 * `AiProviderSettings.testProvider` button gated behind a future
 * flag) fail loudly rather than silently no-op.
 *
 * Do NOT call this from v0.5 P2c-1 UI — the test button is hidden
 * in the Settings panel.
 *
 * @deprecated v0.5 scope discipline: HTTP smoke test removed.
 */
export async function testAiModelProvider(
  _provider: AiModelProvider,
  _modelId: string,
  _apiKeyOverride: string | null,
): Promise<string> {
  throw new Error(
    'testAiModelProvider: HTTP smoke test is deferred in v0.5 (PR 25 scope discipline). ' +
      'See src/utils/aiProviderSecrets.ts.',
  )
}
