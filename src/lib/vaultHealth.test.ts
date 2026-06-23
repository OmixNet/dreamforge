import { describe, expect, it } from 'vitest'
import { computeVaultHealth, type VaultHealth } from './vaultHealth'

// Fixed "now" so the tests are deterministic. Dreams in 2026; we
// pick a known post-cutoff timestamp.
const NOW_MS = Date.parse('2026-06-22T10:00:00Z')

function iso(ageMs: number): string {
  return new Date(NOW_MS - ageMs).toISOString()
}

describe('computeVaultHealth', () => {
  describe('healthy bucket', () => {
    it('returns healthy for a recent dream + low candidates', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(2 * 60 * 60_000), // 2 hours ago
        candidates: 0,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('healthy')
    })

    it('returns healthy for a dream just under 24h old + 5 candidates (boundary)', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(23 * 60 * 60_000), // 23 hours ago
        candidates: 5,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('healthy')
    })
  })

  describe('stale bucket', () => {
    it('returns stale when dream is between 24h and 7 days old', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(3 * 24 * 60 * 60_000), // 3 days ago
        candidates: 0,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('stale')
    })

    it('returns stale when candidates count is 6-15 even with a fresh dream', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(1 * 60 * 60_000), // 1 hour ago
        candidates: 10,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('stale')
    })
  })

  describe('critical bucket', () => {
    it('returns critical when dream is older than 7 days', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(8 * 24 * 60 * 60_000), // 8 days ago
        candidates: 0,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('critical')
    })

    it('returns critical when candidates count exceeds 15', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(1 * 60 * 60_000), // 1 hour ago
        candidates: 20,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('critical')
    })

    it('returns critical when both signals fire', () => {
      const result = computeVaultHealth({
        lastDreamAt: iso(10 * 24 * 60 * 60_000), // 10 days ago
        candidates: 100,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('critical')
    })
  })

  describe('unknown bucket', () => {
    it('returns unknown when no last dream and zero candidates', () => {
      const result = computeVaultHealth({
        lastDreamAt: null,
        candidates: 0,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('unknown')
    })

    it('returns stale (not unknown) when last dream is missing but candidates exist', () => {
      // Edge case: never run Dream but raw/ folder has stuff. The
      // candidate count is the primary signal here.
      const result = computeVaultHealth({
        lastDreamAt: null,
        candidates: 3,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('stale')
    })
  })

  describe('defensive', () => {
    it('treats invalid lastDreamAt the same as missing (default 3d age → stale)', () => {
      // Invalid timestamp is parsed as NaN, which we treat the same
      // as missing. The default age is 3 days (between healthy 1d
      // and stale 7d thresholds), so this lands in 'stale' rather
      // than 'critical'. The alternative (Infinity age → critical)
      // would be alarmist when the actual cause is a parse error,
      // not a real 7-day gap.
      const result = computeVaultHealth({
        lastDreamAt: 'not-a-date',
        candidates: 0,
        nowMs: NOW_MS,
      })
      expect(result).toBe<VaultHealth>('stale')
    })

    it('returns healthy with the default nowMs when no explicit now is given', () => {
      // Use a very recent timestamp (1 minute ago) to guarantee
      // the call lands in the "healthy" bucket regardless of the
      // actual Date.now() at test time.
      const recent = new Date(Date.now() - 60_000).toISOString()
      const result = computeVaultHealth({
        lastDreamAt: recent,
        candidates: 0,
      })
      expect(result).toBe<VaultHealth>('healthy')
    })
  })
})
