import { describe, expect, it } from 'vitest'
import { formatLastDreamRelative, parseDreamStatus } from './dreamCliStatus'

describe('parseDreamStatus', () => {
  it('extracts the Last dream ISO timestamp from a typical dream status stdout', () => {
    const stdout = [
      'Vault: /tmp/vault',
      'Raw candidates: 1',
      'Notes: 3',
      'Wiki: 1',
      'Memory: present',
      'Last dream: 2026-06-15T10:30:00Z',
    ].join('\n')
    expect(parseDreamStatus(stdout)).toEqual({ lastDreamAt: '2026-06-15T10:30:00Z' })
  })

  it('returns null when the Last dream line is missing', () => {
    const stdout = ['Vault: /tmp/vault', 'Notes: 3', 'Wiki: 1'].join('\n')
    expect(parseDreamStatus(stdout)).toEqual({ lastDreamAt: null })
  })

  it('returns null when the Last dream value is not a valid date string', () => {
    const stdout = 'Last dream: not-a-date'
    expect(parseDreamStatus(stdout)).toEqual({ lastDreamAt: null })
  })

  it('tolerates non-string input (defensive — callers pass unknown shapes)', () => {
    // The dream CLI output is a string, but the parsed type is
    // tolerant so a future schema change doesn't crash the UI.
    expect(parseDreamStatus(undefined as unknown as string)).toEqual({ lastDreamAt: null })
    expect(parseDreamStatus(null as unknown as string)).toEqual({ lastDreamAt: null })
  })

  it('handles CRLF line endings (Windows-style stdout from dream CLI on some hosts)', () => {
    const stdout = 'Vault: /tmp/vault\r\nLast dream: 2026-06-15T10:30:00Z\r\n'
    expect(parseDreamStatus(stdout)).toEqual({ lastDreamAt: '2026-06-15T10:30:00Z' })
  })

  it('is case-insensitive on the Last dream label (defensive against dream CLI capitalization changes)', () => {
    const stdout = 'last dream: 2026-06-15T10:30:00Z'
    expect(parseDreamStatus(stdout)).toEqual({ lastDreamAt: '2026-06-15T10:30:00Z' })
  })
})

describe('formatLastDreamRelative', () => {
  // Fixed "now" so the tests are deterministic. The dreams happened
  // in 2026; we pick a known post-cutoff timestamp.
  const NOW_MS = Date.parse('2026-06-22T10:00:00Z')

  it('returns "just now" for timestamps within 1 minute of now', () => {
    const iso = '2026-06-22T09:59:30Z' // 30 seconds before
    expect(formatLastDreamRelative(iso, NOW_MS)).toBe('just now')
  })

  it('returns "just now" for future timestamps (clock skew / DST)', () => {
    const iso = '2026-06-22T10:30:00Z' // 30 min after now
    expect(formatLastDreamRelative(iso, NOW_MS)).toBe('just now')
  })

  it('formats minutes for diffs under 1 hour', () => {
    const iso = '2026-06-22T09:55:00Z' // 5 min before
    expect(formatLastDreamRelative(iso, NOW_MS)).toBe('5 minutes ago')
  })

  it('formats hours for diffs under 1 day', () => {
    const iso = '2026-06-22T08:00:00Z' // 2 hours before
    expect(formatLastDreamRelative(iso, NOW_MS)).toBe('2 hours ago')
  })

  it('formats days for diffs under 30 days', () => {
    const iso = '2026-06-19T10:00:00Z' // 3 days before
    expect(formatLastDreamRelative(iso, NOW_MS)).toBe('3 days ago')
  })

  it('returns empty string for invalid input (defensive)', () => {
    expect(formatLastDreamRelative('not-a-date', NOW_MS)).toBe('')
    expect(formatLastDreamRelative('', NOW_MS)).toBe('')
  })

  it('uses Intl.RelativeTimeFormat (locale-aware)', () => {
    // Chinese: "5 minutes ago" = "5分钟前"
    const iso = '2026-06-22T09:55:00Z'
    expect(formatLastDreamRelative(iso, NOW_MS, 'zh-CN')).toBe('5分钟前')
  })
})
