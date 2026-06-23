// src/lib/vaultHealth.ts
//
// v0.6.x PR 49: derive a coarse "vault health" signal from the two
// signals we have on the frontend: last dream age + candidate count.
// The badge is a small inline visual (green/amber/red) shown next
// to the empty editor's counts line so the user can see at a glance
// whether the vault is being kept up to date.
//
// Why coarse: this is the empty-state at-a-glance summary, not a
// detailed dashboard. Three buckets (healthy / stale / critical) are
// enough for "do I need to run Dream?" decision making. Detailed
// "last dream failed because X" lives in DreamPanel (PR 41/46 error
// UI). Detailed "candidate / processed" breakdown is PR 50.
//
// Health logic (locked by tests):
//   healthy:  last dream < 24h ago AND candidates <= 5
//   stale:    last dream 1-7 days old OR candidates 6-15
//   critical: last dream > 7 days old OR candidates > 15
//   unknown:  no data (no last dream yet, no candidate count)
//
// These thresholds are arbitrary; the design decision is that the
// "stale" bucket should fire on either signal independently so a
// vault with many candidates and a recent dream still gets nudged.

export type VaultHealth = 'healthy' | 'stale' | 'critical' | 'unknown'

export interface VaultHealthInputs {
  /** ISO-8601 UTC timestamp of the last successful Dream run, or null if never. */
  lastDreamAt: string | null
  /** Number of unprocessed raw entries (the dream CLI "candidates"). */
  candidates: number
  /**
   * "Now" in epoch ms. Tests pass a fixed value for determinism;
   * production uses Date.now() implicitly.
   */
  nowMs?: number
}

const HEALTHY_DREAM_MAX_AGE_MS = 24 * 60 * 60_000 // 1 day
const STALE_DREAM_MAX_AGE_MS = 7 * 24 * 60 * 60_000 // 7 days
const STALE_CANDIDATE_THRESHOLD = 5
const CRITICAL_CANDIDATE_THRESHOLD = 15

export function computeVaultHealth({ lastDreamAt, candidates, nowMs }: VaultHealthInputs): VaultHealth {
  // If we have no signals, we can't say anything useful. UI hides
  // the badge entirely (per no-landing-page invariant locked in
  // PR 42/47/48). Returning 'unknown' here lets the renderer
  // distinguish "hide badge" from "show 'healthy' badge".
  if (lastDreamAt == null && candidates === 0) return 'unknown'

  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  // Missing OR invalid lastDreamAt: treat the dream as if it happened
  // 3 days ago (between the healthy 1d threshold and the stale 7d
  // threshold). This way "never run + low candidates" lands in 'stale'
  // (a nudge to run Dream) rather than 'critical' (panic). A high
  // candidate count pushes the vault to 'critical' independently.
  // An invalid timestamp is treated the same as missing — both mean
  // "we don't have reliable dream-recency data", so we apply the same
  // default. The alternative (treating invalid as Infinity) would
  // be alarmist when the actual cause is a parse error, not a real
  // 7-day gap.
  const lastDreamMs = lastDreamAt ? Date.parse(lastDreamAt) : Number.NaN
  const lastDreamAge = Number.isFinite(lastDreamMs)
    ? now - lastDreamMs
    : 3 * 24 * 60 * 60_000 // default: 3 days ago for "never run" or "invalid"

  // Critical: any of the failure signals is severe enough on its own.
  // We use OR so a vault with high candidates OR very old dream gets
  // critical regardless of the other signal.
  if (lastDreamAge > STALE_DREAM_MAX_AGE_MS || candidates > CRITICAL_CANDIDATE_THRESHOLD) {
    return 'critical'
  }
  // Stale: one of the warning signals fires.
  if (lastDreamAge > HEALTHY_DREAM_MAX_AGE_MS || candidates > STALE_CANDIDATE_THRESHOLD) {
    return 'stale'
  }
  return 'healthy'
}
