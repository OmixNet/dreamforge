import { describe, expect, it } from 'vitest'
import { parseDreamRunSummary } from './dreamRunSummary'

describe('parseDreamRunSummary', () => {
  it('parses a completed Dream run with raw and integrated counts plus report path', () => {
    const output = [
      'dream 完成:',
      '  - 收集 raw: 4',
      '  - 通过整合: 4（durable 0 / candidate 7）',
      '  - 已 git commit',
      '  - dream-report: /Users/biomatrix/Desktop/APP/dreamforge-test-vault/.dream/reports/dream-report-2026-06-22-031930.md',
      'budget: today 5 call(s), $0.0000 used',
    ].join('\n')

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'completed',
      rawCollected: 4,
      integrated: 4,
      reportPath:
        '/Users/biomatrix/Desktop/APP/dreamforge-test-vault/.dream/reports/dream-report-2026-06-22-031930.md',
    })
  })

  it('classifies zero-work output as no-op', () => {
    const output = [
      'dream 完成:',
      '  - 收集 raw: 0',
      '  - 通过整合: 0（durable 7 / candidate 0）',
      '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
    ].join('\n')

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'noop',
      rawCollected: 0,
      integrated: 0,
      reportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
    })
  })

  it('classifies the real Chinese no-work line as no-op', () => {
    const output = [
      'dream: 无需事项（无新 raw, 无矛盾需解决）',
      'budget: today 0 call(s), $0.0000 used',
    ].join('\n')

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'noop',
      rawCollected: 0,
      integrated: 0,
      reportPath: null,
    })
  })

  it('parses English-style output when the CLI emits English labels', () => {
    const output = [
      'dream completed:',
      '  - collected raw: 2',
      '  - integrated: 1',
      '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
    ].join('\n')

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'completed',
      rawCollected: 2,
      integrated: 1,
      reportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
    })
  })

  it('returns unknown when counts are absent but keeps the report path', () => {
    const output = 'dream-report: .dream/reports/dream-report-2026-06-25-090000.md'

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'unknown',
      rawCollected: null,
      integrated: null,
      reportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
    })
  })

  it('returns null reportPath when no report line exists', () => {
    const output = 'dream completed:\n  - collected raw: 1\n  - integrated: 1'

    expect(parseDreamRunSummary(output)).toEqual({
      kind: 'completed',
      rawCollected: 1,
      integrated: 1,
      reportPath: null,
    })
  })
})
