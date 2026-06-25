// src/lib/dreamRunSummary.ts
//
// PR 53: pure parser for `dreamvault_run` stdout. Owns the
// "completed vs no-op vs unknown" classification and report-path
// extraction that drives the DreamPanel run-state UI (Running /
// Completed / No new work / Open latest report). Pure function —
// no React, no Tauri, no side effects. Easy to unit-test against
// realistic dream CLI output snapshots (English + 中文 labels,
// absolute + vault-relative paths, zero-work + no-counts edge
// cases).
//
// The dream CLI's text output is a debug aid, not a stable
// contract (per §42 606df99 doc-as-code pattern). When the CLI
// adds a field or relabels a count, this parser is the one place
// to update. The PR 50 typed JSON contract (PR 50b `DreamVault-
// StatusReport`) is the durable wire; this parser is the
// best-effort text-parse bridge for the live "Run Dream" flow.

export type DreamRunSummaryKind = 'completed' | 'noop' | 'unknown'

export interface DreamRunSummary {
  /**
   * Classification of the run:
   *   - 'completed' : at least one count > 0, the dream cycle
   *                   produced new work.
   *   - 'noop'      : both raw and integrated are present and
   *                   both 0 — there was nothing new to organize.
   *                   UX-wise this is "success with nothing to
   *                   show", not a failure.
   *   - 'unknown'   : counts are absent (parser couldn't find
   *                   them). UI falls back to the raw <pre>
   *                   text output and doesn't claim success or
   *                   no-op. Usually means the dream binary is
   *   not PR-50-aware or the stdout is a different shape.
   */
  kind: DreamRunSummaryKind
  /**
   * Number of raw entries the dream cycle collected
   * (the "收集 raw" / "collected raw" line). null when the
   * line is missing or unparseable.
   */
  rawCollected: number | null
  /**
   * Number of memories integrated this cycle
   * (the "通过整合" / "integrated" line). null when missing.
   */
  integrated: number | null
  /**
   * Path to the most recent dream-report, if the CLI emitted a
   * `dream-report: <path>` line. Absolute paths from the
   * user's terminal, vault-relative paths from the dream CLI's
   * own output — we don't normalize; the caller decides.
   */
  reportPath: string | null
}

/**
 * Find the first integer value that follows any of the supplied
 * regex patterns. Returns null if no pattern matches or the
 * captured value isn't a finite integer. Tolerant of whitespace
 * and case (English / 中文 labels are both supported).
 */
function firstNumberAfter(patterns: RegExp[], output: string): number | null {
  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (!match) continue
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value)) return value
  }
  return null
}

/**
 * Extract the path from the most recent `dream-report: <path>`
 * line. Case-insensitive, multiline (so a stray "Dream-Report"
 * header doesn't match). Returns null when no line is present.
 */
function parseReportPath(output: string): string | null {
  const match = output.match(/dream-report:\s*(.+)\s*$/im)
  const path = match?.[1]?.trim()
  return path ? path : null
}

function isExplicitNoWorkOutput(output: string): boolean {
  return /无需事项|无新\s*raw|no\s+new\s+raw|nothing\s+to\s+do/i.test(output)
}

/**
 * Parse the stdout of `dreamvault_run` and return a structured
 * summary. The function is pure: no IO, no exceptions thrown on
 * malformed input. A malformed / partial output yields an
 * 'unknown' kind with whatever fields could be extracted.
 */
export function parseDreamRunSummary(output: string): DreamRunSummary {
  const rawCollected = firstNumberAfter(
    [
      /收集\s*raw:\s*(\d+)/i,
      /collected\s+raw:\s*(\d+)/i,
      /raw\s+collected:\s*(\d+)/i,
    ],
    output,
  )
  const integrated = firstNumberAfter(
    [
      /通过整合:\s*(\d+)/i,
      /integrated:\s*(\d+)/i,
      /consolidated:\s*(\d+)/i,
    ],
    output,
  )
  const reportPath = parseReportPath(output)

  let kind: DreamRunSummaryKind = 'unknown'
  let normalizedRawCollected = rawCollected
  let normalizedIntegrated = integrated
  if (rawCollected === null && integrated === null && isExplicitNoWorkOutput(output)) {
    normalizedRawCollected = 0
    normalizedIntegrated = 0
    kind = 'noop'
  } else if (rawCollected !== null || integrated !== null) {
    // Both counts are 0 → "no new work" (success, but nothing to show).
    // Either count > 0 → completed (something was processed).
    kind = (rawCollected ?? 0) === 0 && (integrated ?? 0) === 0 ? 'noop' : 'completed'
  }

  return {
    kind,
    rawCollected: normalizedRawCollected,
    integrated: normalizedIntegrated,
    reportPath,
  }
}
