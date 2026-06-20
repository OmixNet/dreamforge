// src/lib/dreamProviderError.ts
//
// v0.6 PR 34: parse the dream CLI's stderr for the stable `[OPENAI_*]`
// error tag that OpenAICompatibleProvider (DreamVault Swift) writes, and
// surface a short actionable message + fix action to the DreamPanel UI.
//
// CRITICAL SECURITY INVARIANT: the original stderr may contain the API
// key value if a misconfigured server echoed it back. This module must
// NEVER propagate the body portion of the error string to the UI. We
// only consume the [OPENAI_*] tag prefix and a short category label.
//
// Cross-language contract (locked with DreamVault OpenAICompatibleProvider
// Swift code, see /Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamEngine/
// OpenAICompatibleProvider.swift):
//   [OPENAI_MISSING_KEY]     — env var unset, no HTTP request issued
//   [OPENAI_AUTH_FAILED]     — HTTP 401 / 403
//   [OPENAI_MODEL_NOT_FOUND] — HTTP 404
//   [OPENAI_TIMEOUT]         — URLError.timedOut
//   [OPENAI_MALFORMED]       — 2xx but shape doesn't match OpenAI-compat
//   [OPENAI_NETWORK_FAILED]  — 5xx / other 4xx / DNS / TCP / TLS / other URLError

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
 * The order matters for parseProviderError: we scan for the first
 * matching tag in stderr. Tags are kept unique, so order is purely
 * for deterministic test output.
 */
const TAG_TO_CATEGORY: ReadonlyArray<readonly [string, ProviderErrorCategory]> = [
  ['[OPENAI_MISSING_KEY]', 'missing-key'],
  ['[OPENAI_AUTH_FAILED]', 'auth-failed'],
  ['[OPENAI_MODEL_NOT_FOUND]', 'model-not-found'],
  ['[OPENAI_TIMEOUT]', 'timeout'],
  ['[OPENAI_MALFORMED]', 'malformed'],
  ['[OPENAI_NETWORK_FAILED]', 'network-failed'],
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
