import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts/dreamx-e2e-output-check.mjs')

function runCheck(output: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dreamx-e2e-output-'))
  const file = path.join(dir, 'dream-output.txt')
  writeFileSync(file, output)
  return spawnSync(process.execPath, [scriptPath, file], {
    encoding: 'utf8',
  })
}

describe('dreamx-e2e-output-check', () => {
  it('passes when output proves a provider call happened', () => {
    const result = runCheck(`
dream 完成
provider: openai-compatible
budget 2 call(s)
`)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('provider call count > 0')
  })

  it('passes when output uses real dream CLI format (budget: today N call(s))', () => {
    // v0.5 P2c-3: real dream CLI output is `budget: today N call(s), $X used`
    // — not `budget N call(s)`. The gate regex must accept the real shape
    // or every valid E2E run gets rejected.
    const result = runCheck(`
dream 完成:
  - 收集 raw: 1
  - 已 git commit
budget: today 1 call(s), $0.0000 used
`)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('provider call count > 0 (1)')
  })

  it('passes for bare N call(s) without budget/provider prefix', () => {
    // Defensive: if BudgetManager ever drops the "budget:" prefix, the
    // bare "N call(s)" pattern still passes.
    const result = runCheck('1 call(s) made this run')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('provider call count > 0 (1)')
  })

  it('fails when output is the idle no-op path', () => {
    const result = runCheck(`
一无事事
budget 0 call(s)
`)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('idle no-op detected')
  })

  it('fails when output lacks provider call evidence', () => {
    const result = runCheck(`
dream 完成
processed raw candidates
`)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing provider call evidence')
  })
})
