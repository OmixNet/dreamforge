// src/lib/dreamProviderError.ts
//
// v0.6 PR 34 + PR 36: parse the dream CLI's stderr for the stable
// provider-prefixed error tag that the DreamVault Swift providers
// write, and surface a short actionable message + fix action to the
// DreamPanel UI.
//
// CRITICAL SECURITY INVARIANT: the original stderr may contain the API
// key value if a misconfigured server echoed it back. This module must
// NEVER propagate the body portion of the error string to the UI. We
// only consume the tag prefix and a short category label.
//
// Cross-language contract (locked with DreamVault Swift providers, see
// /Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamEngine/):
//   [OPENAI_MISSING_KEY]     — OpenAI-compat: env var unset, no HTTP
//   [OPENAI_AUTH_FAILED]     — OpenAI-compat: HTTP 401 / 403
//   [OPENAI_MODEL_NOT_FOUND] — OpenAI-compat: HTTP 404
//   [OPENAI_TIMEOUT]         — OpenAI-compat: URLError.timedOut
//   [OPENAI_MALFORMED]       — OpenAI-compat: 2xx but bad shape
//   [OPENAI_NETWORK_FAILED]  — OpenAI-compat: 5xx / 4xx / transport
//
//   [ANTHROPIC_MISSING_KEY]     — Anthropic: same 6-category shape
//   [ANTHROPIC_AUTH_FAILED]     — Anthropic: HTTP 401 / 403
//   [ANTHROPIC_MODEL_NOT_FOUND] — Anthropic: HTTP 404
//   [ANTHROPIC_TIMEOUT]         — Anthropic: URLError.timedOut
//   [ANTHROPIC_MALFORMED]       — Anthropic: 2xx but no text block
//   [ANTHROPIC_NETWORK_FAILED]  — Anthropic: 5xx / 4xx / transport
//
//   [GEMINI_MISSING_KEY]     — Gemini: same 6-category shape
//   [GEMINI_AUTH_FAILED]     — Gemini: HTTP 401 / 403
//   [GEMINI_MODEL_NOT_FOUND] — Gemini: HTTP 404
//   [GEMINI_TIMEOUT]         — Gemini: URLError.timedOut
//   [GEMINI_MALFORMED]       — Gemini: 2xx but no text part
//   [GEMINI_NETWORK_FAILED]  — Gemini: 5xx / 4xx / transport
//
// All 3 providers share the same 6 categories; the prefix only
// identifies which provider threw. DreamX UI maps all 3 to the same
// short actionable copy because the user-facing fix is the same:
// re-check API key in Settings → AI, or retry.

export type ProviderErrorCategory =
  | 'missing-key'
  | 'auth-failed'
  | 'model-not-found'
  | 'timeout'
  | 'malformed'
  | 'network-failed'
  | 'unknown'

export type ProviderErrorFixAction =
  | 'open-settings-ai' // missing key, auth failed, model not found → fix in Settings → AI
  | 'retry' // timeout, malformed, network failed → re-run the dream command
  | 'none' // unknown / no specific fix

export interface ProviderErrorInfo {
  category: ProviderErrorCategory
  /** Short user-facing message (one sentence). NEVER contains the body. */
  shortMessage: string
  /** Fix action button label. */
  fixActionLabel: string
  /** Which fix action the user should take. */
  fixAction: ProviderErrorFixAction
}

/**
 * The 6 stable tags from DreamVault Swift OpenAICompatibleProvider.
 * v0.6 PR 36: 18 total tags (6 categories × 3 providers). The order
 * matters for parseProviderError: we scan for the first matching tag
 * in stderr. Tags are kept unique, so order is purely for deterministic
 * test output.
 *
 * Provider prefixes:
 *   - [OPENAI_*]    — OpenAI-compatible (SiliconFlow / DeepSeek / OpenRouter / vLLM)
 *   - [ANTHROPIC_*] — Anthropic Messages API (Claude)
 *   - [GEMINI_*]    — Google Gemini generateContent API
 *
 * All 3 providers share the same 6 categories. The category → UI copy
 * mapping is provider-agnostic (no need for separate "Anthropic auth
 * failed" vs "OpenAI auth failed" copy — both surface the same
 * actionable fix: re-check API key in Settings → AI).
 */
const TAG_TO_CATEGORY: ReadonlyArray<readonly [string, ProviderErrorCategory]> = [
  // OpenAI-compatible (v0.5 PR 28 + v0.6 PR 34)
  ['[OPENAI_MISSING_KEY]', 'missing-key'],
  ['[OPENAI_AUTH_FAILED]', 'auth-failed'],
  ['[OPENAI_MODEL_NOT_FOUND]', 'model-not-found'],
  ['[OPENAI_TIMEOUT]', 'timeout'],
  ['[OPENAI_MALFORMED]', 'malformed'],
  ['[OPENAI_NETWORK_FAILED]', 'network-failed'],
  // Anthropic (v0.6 PR 36)
  ['[ANTHROPIC_MISSING_KEY]', 'missing-key'],
  ['[ANTHROPIC_AUTH_FAILED]', 'auth-failed'],
  ['[ANTHROPIC_MODEL_NOT_FOUND]', 'model-not-found'],
  ['[ANTHROPIC_TIMEOUT]', 'timeout'],
  ['[ANTHROPIC_MALFORMED]', 'malformed'],
  ['[ANTHROPIC_NETWORK_FAILED]', 'network-failed'],
  // Gemini (v0.6 PR 36)
  ['[GEMINI_MISSING_KEY]', 'missing-key'],
  ['[GEMINI_AUTH_FAILED]', 'auth-failed'],
  ['[GEMINI_MODEL_NOT_FOUND]', 'model-not-found'],
  ['[GEMINI_TIMEOUT]', 'timeout'],
  ['[GEMINI_MALFORMED]', 'malformed'],
  ['[GEMINI_NETWORK_FAILED]', 'network-failed'],
]

/**
 * Map of category → user-facing copy. English only on purpose: the
 * error is technical (LLM provider issue) and the existing DreamPanel
 * already shows English-only error strings (the raw `err.message` from
 * the Tauri command). i18n parity is preserved by keeping en.json the
 * source of truth and other locales inheriting the English fallback
 * via the standard i18n.template ?? fallbackTemplate behavior.
 *
 * Locked by user 2026-06-21 (v0.6 PR 34 scope decision): error UX copy
 * is English-only for v0.6, i18n parity for error strings deferred.
 */
const PROVIDER_ERROR_MAP: Readonly<Record<ProviderErrorCategory, ProviderErrorInfo>> = {
  'missing-key': {
    category: 'missing-key',
    shortMessage: 'No API key configured for this provider.',
    fixActionLabel: 'Open Settings → AI',
    fixAction: 'open-settings-ai',
  },
  'auth-failed': {
    category: 'auth-failed',
    shortMessage: 'The API key was rejected. Check it in Settings → AI.',
    fixActionLabel: 'Open Settings → AI',
    fixAction: 'open-settings-ai',
  },
  'model-not-found': {
    category: 'model-not-found',
    shortMessage: 'The model does not exist on this provider.',
    fixActionLabel: 'Open Settings → AI',
    fixAction: 'open-settings-ai',
  },
  timeout: {
    category: 'timeout',
    shortMessage: 'The request timed out. Try again.',
    fixActionLabel: 'Retry',
    fixAction: 'retry',
  },
  malformed: {
    category: 'malformed',
    shortMessage: 'The provider returned an unexpected response.',
    fixActionLabel: 'Retry',
    fixAction: 'retry',
  },
  'network-failed': {
    category: 'network-failed',
    shortMessage: 'Could not reach the provider. Check your connection.',
    fixActionLabel: 'Retry',
    fixAction: 'retry',
  },
  unknown: {
    category: 'unknown',
    shortMessage: 'Dream run failed. See the output below for details.',
    fixActionLabel: 'Dismiss',
    fixAction: 'none',
  },
}

/**
 * Parse the dream CLI's stderr (or a thrown error message) and return a
 * structured ProviderErrorInfo. The first matching [OPENAI_*] tag wins;
 * anything else (no tag, or unknown tag) maps to 'unknown'.
 *
 * This function is intentionally a pure helper: it does not touch
 * i18n, settings, or any side-effectful module, so it's trivially
 * testable in isolation.
 */
export function parseProviderError(stderrOrMessage: string): ProviderErrorInfo {
  if (typeof stderrOrMessage !== 'string') {
    return PROVIDER_ERROR_MAP.unknown
  }
  for (const [tag, category] of TAG_TO_CATEGORY) {
    if (stderrOrMessage.includes(tag)) {
      return PROVIDER_ERROR_MAP[category]
    }
  }
  return PROVIDER_ERROR_MAP.unknown
}

/**
 * Strip the [OPENAI_*] tag prefix (and any provider-controlled text
 * around it) from a stderr string, leaving only the body. Useful for
 * the "unknown" fallback where we want to show *some* of the message
 * to the user, but not the tag itself.
 *
 * SECURITY: this returns the body verbatim. The caller is responsible
 * for deciding whether to show it. For the 'unknown' case, the UI
 * shows the body in a `<pre>` block but never in any user-facing
 * copy that could leak the key value to analytics / logs.
 */
export function stripOpenAITag(stderr: string): string {
  if (typeof stderr !== 'string') return ''
  // Strip leading "[OPENAI_*] " tag (if any) and trim.
  const match = stderr.match(/\[OPENAI_[A-Z_]+\]\s*(.*)$/s)
  return match ? (match[1] ?? '').trim() : stderr.trim()
}
