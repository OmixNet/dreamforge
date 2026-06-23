// src/lib/dreamCliStatus.ts
//
// v0.6.x PR 48: parse the `dream status` stdout for the `Last dream:`
// line, surface the timestamp to the empty editor so the user can
// see "Last dream: 2h ago" at a glance.
//
// Why parse on the frontend (not Rust): the dream CLI Swift code
// already prints `Last dream: <ISO-8601-UTC>` as one of the status
// lines (per §42 606df99 + §44 re-test), so the data is already on
// the wire in the stdout. Adding a structured Rust field would
// require changing `DreamVaultCommandOutput` and the Swift provider;
// parsing on the frontend keeps PR 48 small and avoids a cross-
// language contract change for a single timestamp.
//
// Output format (from the dream CLI Swift `StatusCommand` + the mock
// handler in mock-handlers.ts):
//   Vault: <path>
//   Raw candidates: <N>
//   Notes: <N>
//   Wiki: <N>
//   Memory: present|missing
//   Last dream: <ISO-8601 UTC timestamp, e.g. 2026-06-15T10:30:00Z>
//
// The format is documented at §42 606df99 ("doc-as-code" pattern)
// so a future dream CLI change is the one place to update both
// the parser and the docs.

export interface ParsedDreamStatus {
  /** ISO-8601 UTC timestamp string of the last successful Dream run, or null if never run. */
  lastDreamAt: string | null
}

/**
 * Parse the stdout of `dream status` and return structured fields.
 * Returns `{ lastDreamAt: null }` when the line is missing or unparseable
 * so callers don't have to null-check every field.
 *
 * Tolerant: a missing line is null (not an error). A malformed line is
 * null (caller decides whether to surface a warning — we currently don't,
 * because the dream CLI contract is the source of truth and a malformed
 * line means the contract changed).
 */
export function parseDreamStatus(stdout: string): ParsedDreamStatus {
  if (typeof stdout !== 'string') return { lastDreamAt: null }
  const lines = stdout.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^Last dream:\s*(\S+)\s*$/i)
    if (match) {
      const candidate = match[1] ?? ''
      // Sanity check: must be a valid date string. Date.parse returns
      // NaN for invalid input, which we treat as "never" rather than
      // surfacing a bad value to the UI.
      const ms = Date.parse(candidate)
      if (Number.isFinite(ms)) {
        return { lastDreamAt: candidate }
      }
    }
  }
  return { lastDreamAt: null }
}

/**
 * Format an ISO-8601 timestamp as a relative time string suitable for
 * the empty editor's "Last dream: X ago" line.
 *
 * Examples (en):
 *   "just now"      (< 1 minute)
 *   "5 min ago"     (5-59 minutes)
 *   "2 h ago"       (1-23 hours)
 *   "3 days ago"    (>= 1 day)
 *   "2 mo ago"      (>= 1 month)
 *   "just now"      (future, e.g. clock skew)
 *
 * Uses Intl.RelativeTimeFormat with `numeric: 'auto'` so we get the
 * "yesterday" / "last week" forms where the locale supports them.
 *
 * @param iso ISO-8601 timestamp (UTC recommended, e.g. "2026-06-15T10:30:00Z")
 * @param nowMs Optional "now" in epoch ms. Tests pass a fixed value for
 *   determinism; production uses Date.now() implicitly.
 * @param locale BCP-47 locale tag. Defaults to 'en'.
 */
export function formatLastDreamRelative(iso: string, nowMs?: number, locale: string = 'en'): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const diffMs = now - ms
  // Intl.RelativeTimeFormat semantics: NEGATIVE value = past ("5 min ago"),
  // POSITIVE value = future ("in 5 min"). Since `diffMs = now - ms` is
  // positive for past timestamps and negative for future ones, we pass
  // `-diffMs` to flip the sign back so the resulting phrase matches the
  // wall-clock sense.
  //
  // Future (clock skew, DST edge case, or wrong timestamp format):
  // treat as "just now" rather than "in 30 min" which is confusing
  // — a "last dream" timestamp in the future doesn't make sense in
  // the wall-clock sense, regardless of how far in the future.
  if (diffMs < 0) return 'just now'
  // Recent past (< 1 minute): "this minute" sounds awkward, prefer
  // "just now" for the empty-state at-a-glance summary. The user
  // doesn't need to know it was 30 seconds ago vs 5 seconds ago.
  if (diffMs < 60_000) return 'just now'
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const signedForRtf = -diffMs
  const abs = Math.abs(diffMs)
  if (abs < 60 * 60_000) {
    const minutes = Math.round(signedForRtf / 60_000)
    return rtf.format(minutes, 'minute')
  }
  if (abs < 24 * 60 * 60_000) {
    const hours = Math.round(signedForRtf / (60 * 60_000))
    return rtf.format(hours, 'hour')
  }
  if (abs < 30 * 24 * 60 * 60_000) {
    const days = Math.round(signedForRtf / (24 * 60 * 60_000))
    return rtf.format(days, 'day')
  }
  if (abs < 365 * 24 * 60 * 60_000) {
    const months = Math.round(signedForRtf / (30 * 24 * 60 * 60_000))
    return rtf.format(months, 'month')
  }
  const years = Math.round(signedForRtf / (365 * 24 * 60 * 60_000))
  return rtf.format(years, 'year')
}
