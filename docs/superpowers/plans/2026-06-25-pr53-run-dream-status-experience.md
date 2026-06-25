# PR 53 Run Dream Status Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DreamPanel's `Run Dream` flow feel product-grade by showing clear Running / Completed / No-op / Failed states, refreshing typed vault stats after a run, and giving the user an obvious way to open the latest report.

**Architecture:** Keep this as a frontend-first PR. Parse the existing `dreamvault_run` text output in a small pure helper, use it inside `DreamPanel`, and only add optional report-opening wiring through existing app-level note/file-open helpers. Do not change DreamVault Swift, Rust Tauri commands, provider routing, or the PR 50 typed stats JSON contract.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Tauri invoke path, existing i18n parity guard.

---

## File Structure

- Create: `src/lib/dreamRunSummary.ts`
  - Pure parser for `dreamvault_run` stdout/stderr.
  - Owns "completed vs no-op vs unknown" classification and report-path extraction.
- Create: `src/lib/dreamRunSummary.test.ts`
  - Unit tests for parser behavior using realistic dream CLI output.
- Modify: `src/components/DreamPanel.tsx`
  - Adds run-state card above the raw `<pre>` output.
  - Refreshes typed stats after `Run Dream`.
  - Renders `Open latest report` when a report path is known.
- Modify: `src/components/DreamPanel.test.tsx`
  - Component tests for running, completed, no-op, failed, report button, and post-run typed refresh.
- Modify: `src/App.tsx`
  - Passes an optional `onOpenReport` callback into `DreamPanel`.
  - Callback first tries `vaultBridge.openNoteByPath(relativePath)`, then falls back to opening the file via existing local-file helper if the report is not indexed as a note.
- Modify: `src/lib/locales/*.json`
  - Adds the new `dreamPanel.run.*` keys to all 20 locales; parity test enforces matching key sets.

---

### Task 1: Pure Run Summary Parser

**Files:**
- Create: `src/lib/dreamRunSummary.ts`
- Create: `src/lib/dreamRunSummary.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/lib/dreamRunSummary.test.ts`:

```ts
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
      reportPath: '/Users/biomatrix/Desktop/APP/dreamforge-test-vault/.dream/reports/dream-report-2026-06-22-031930.md',
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
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm exec vitest run src/lib/dreamRunSummary.test.ts
```

Expected: FAIL because `src/lib/dreamRunSummary.ts` does not exist.

- [ ] **Step 3: Add parser implementation**

Create `src/lib/dreamRunSummary.ts`:

```ts
export type DreamRunSummaryKind = 'completed' | 'noop' | 'unknown'

export interface DreamRunSummary {
  kind: DreamRunSummaryKind
  rawCollected: number | null
  integrated: number | null
  reportPath: string | null
}

function firstNumberAfter(patterns: RegExp[], output: string): number | null {
  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (!match) continue
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value)) return value
  }
  return null
}

function parseReportPath(output: string): string | null {
  const match = output.match(/dream-report:\s*(.+)\s*$/im)
  const path = match?.[1]?.trim()
  return path ? path : null
}

export function parseDreamRunSummary(output: string): DreamRunSummary {
  const rawCollected = firstNumberAfter([
    /收集\s*raw:\s*(\d+)/i,
    /collected\s+raw:\s*(\d+)/i,
    /raw\s+collected:\s*(\d+)/i,
  ], output)
  const integrated = firstNumberAfter([
    /通过整合:\s*(\d+)/i,
    /integrated:\s*(\d+)/i,
    /consolidated:\s*(\d+)/i,
  ], output)
  const reportPath = parseReportPath(output)

  let kind: DreamRunSummaryKind = 'unknown'
  if (rawCollected !== null || integrated !== null) {
    kind = (rawCollected ?? 0) === 0 && (integrated ?? 0) === 0 ? 'noop' : 'completed'
  }

  return {
    kind,
    rawCollected,
    integrated,
    reportPath,
  }
}
```

- [ ] **Step 4: Run parser tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/lib/dreamRunSummary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

```bash
git add src/lib/dreamRunSummary.ts src/lib/dreamRunSummary.test.ts
git commit -m "feat(v0.6.x PR 53): parse Dream run summaries"
```

---

### Task 2: DreamPanel Run-State UI

**Files:**
- Modify: `src/components/DreamPanel.tsx`
- Modify: `src/components/DreamPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Append tests to the existing `describe('DreamPanel', ...)` block in `src/components/DreamPanel.test.tsx`:

```ts
it('shows a running state while Run Dream is in flight', async () => {
  let resolveRun!: (value: { stdout: string; stderr: string; success: boolean }) => void
  vi.mocked(mockInvoke)
    .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    .mockImplementationOnce(() => new Promise((resolve) => {
      resolveRun = resolve
    }))

  render(<DreamPanel vaultPath="/tmp/vault" />)
  await screen.findByText(/status ok/)
  fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

  expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('Running')
  resolveRun({ stdout: 'dream completed:\n  - collected raw: 1\n  - integrated: 1', stderr: '', success: true })
})

it('shows completed summary after Run Dream succeeds and refreshes typed stats', async () => {
  vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
    if (cmd === 'dreamvault_run') {
      return {
        stdout: [
          'dream completed:',
          '  - collected raw: 2',
          '  - integrated: 1',
          '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
        ].join('\n'),
        stderr: '',
        success: true,
      }
    }
    if (cmd === 'dreamvault_status_json') {
      return {
        schemaVersion: 1,
        vaultPath: '/tmp/vault',
        rawCandidatesCount: 5,
        processedCount: 7,
        archivedCount: 1,
        lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
      }
    }
    return { stdout: 'status ok', stderr: '', success: true }
  })

  render(<DreamPanel vaultPath="/tmp/vault" />)
  await screen.findByText(/status ok/)
  fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

  expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('Completed')
  expect(screen.getByTestId('dream-panel-run-state')).toHaveTextContent('2 raw')
  expect(screen.getByTestId('dream-panel-run-state')).toHaveTextContent('1 integrated')
  expect(await screen.findByTestId('dream-panel-typed-stats')).toHaveTextContent('5 candidates · 7 processed · 1 archived')
})

it('shows no-op summary after Run Dream has no raw work', async () => {
  vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
    if (cmd === 'dreamvault_run') {
      return {
        stdout: 'dream completed:\n  - collected raw: 0\n  - integrated: 0',
        stderr: '',
        success: true,
      }
    }
    return { stdout: 'status ok', stderr: '', success: true }
  })

  render(<DreamPanel vaultPath="/tmp/vault" />)
  await screen.findByText(/status ok/)
  fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

  expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('No new work')
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm exec vitest run src/components/DreamPanel.test.tsx
```

Expected: FAIL because `dream-panel-run-state` is not rendered.

- [ ] **Step 3: Implement minimal Run Dream state**

In `src/components/DreamPanel.tsx`, import the parser:

```ts
import { parseDreamRunSummary, type DreamRunSummary } from '../lib/dreamRunSummary'
```

Add state after `lastDreamAt`:

```ts
const [runSummary, setRunSummary] = useState<DreamRunSummary | null>(null)
```

Inside `runCommand`, just before `try`, add:

```ts
if (command === 'dreamvault_run') {
  setRunSummary(null)
}
```

After `setOutput(next)`, add:

```ts
if (command === 'dreamvault_run') {
  setRunSummary(parseDreamRunSummary(next))
}
```

On error, after `setOutput(message)`, add:

```ts
if (command === 'dreamvault_run') {
  setRunSummary(null)
}
```

Change the Run Dream button:

```tsx
onClick={() => runCommand('dreamvault_run', { refreshTypedStats: true })}
```

Render this block above the typed stats block:

```tsx
{runningCommand === 'dreamvault_run' ? (
  <div className="dreamx-panel-run-state" data-testid="dream-panel-run-state">
    <strong>Running</strong>
    <span>Dream is organizing this vault.</span>
  </div>
) : runSummary ? (
  <div className="dreamx-panel-run-state" data-testid="dream-panel-run-state">
    <strong>{runSummary.kind === 'noop' ? 'No new work' : 'Completed'}</strong>
    {runSummary.rawCollected !== null || runSummary.integrated !== null ? (
      <span>
        {runSummary.rawCollected ?? 0} raw · {runSummary.integrated ?? 0} integrated
      </span>
    ) : null}
  </div>
) : null}
```

- [ ] **Step 4: Run component tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/components/DreamPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Run Dream state UI**

```bash
git add src/components/DreamPanel.tsx src/components/DreamPanel.test.tsx
git commit -m "feat(v0.6.x PR 53): show Dream run states"
```

---

### Task 3: Open Latest Report Action

**Files:**
- Modify: `src/components/DreamPanel.tsx`
- Modify: `src/components/DreamPanel.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add failing DreamPanel report button test**

Add to `src/components/DreamPanel.test.tsx`:

```ts
it('renders Open latest report when Run Dream output includes a report path', async () => {
  const onOpenReport = vi.fn()
  vi.mocked(mockInvoke)
    .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    .mockResolvedValueOnce({
      stdout: [
        'dream completed:',
        '  - collected raw: 1',
        '  - integrated: 1',
        '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
      ].join('\n'),
      stderr: '',
      success: true,
    })

  render(<DreamPanel vaultPath="/tmp/vault" onOpenReport={onOpenReport} />)
  await screen.findByText(/status ok/)
  fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Open latest report' }))

  expect(onOpenReport).toHaveBeenCalledWith('.dream/reports/dream-report-2026-06-25-090000.md')
})
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pnpm exec vitest run src/components/DreamPanel.test.tsx -t "Open latest report"
```

Expected: FAIL because `onOpenReport` prop and button do not exist.

- [ ] **Step 3: Add optional `onOpenReport` prop**

In `src/components/DreamPanel.tsx`, update props:

```ts
interface DreamPanelProps {
  vaultPath: string
  locale?: AppLocale
  onOpenMemory?: () => void
  onOpenWiki?: () => void
  onOpenReport?: (relativePath: string) => void
  onOpenSettingsAi?: () => void
}
```

Update component signature:

```ts
export function DreamPanel({
  vaultPath,
  locale = 'en',
  onOpenMemory,
  onOpenWiki,
  onOpenReport,
  onOpenSettingsAi,
}: DreamPanelProps) {
```

Inside the run-state render block, add:

```tsx
{runSummary.reportPath && onOpenReport ? (
  <Button
    type="button"
    size="sm"
    variant="outline"
    onClick={() => onOpenReport(runSummary.reportPath!)}
  >
    Open latest report
  </Button>
) : null}
```

- [ ] **Step 4: Wire App callback**

In `src/App.tsx`, add a callback near `handleOpenMemory` / `handleOpenWiki`:

```ts
const handleOpenDreamReport = useCallback((relativePath: string) => {
  vaultBridge.openNoteByPath(relativePath)
}, [vaultBridge])
```

Pass it into both `DreamPanel` mounts:

```tsx
onOpenReport={handleOpenDreamReport}
```

If `.dream/reports` entries are not indexed and GUI verify shows the button does nothing, replace the callback in a follow-up with an opener fallback. Do not preemptively add a new backend command in this PR.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run src/components/DreamPanel.test.tsx src/hooks/useVaultBridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit report action**

```bash
git add src/App.tsx src/components/DreamPanel.tsx src/components/DreamPanel.test.tsx
git commit -m "feat(v0.6.x PR 53): open latest Dream report"
```

---

### Task 4: i18n Keys for Run-State Copy

**Files:**
- Modify: `src/lib/locales/*.json`
- Modify: `src/components/DreamPanel.tsx`
- Modify: `src/components/DreamPanel.test.tsx`

- [ ] **Step 1: Add English keys**

In `src/lib/locales/en.json`, add near existing `dreamPanel.stats.*` keys:

```json
"dreamPanel.run.running": "Running",
"dreamPanel.run.runningBody": "Dream is organizing this vault.",
"dreamPanel.run.completed": "Completed",
"dreamPanel.run.noop": "No new work",
"dreamPanel.run.counts": "{raw} raw · {integrated} integrated",
"dreamPanel.run.openLatestReport": "Open latest report",
```

- [ ] **Step 2: Add zh-CN and ja-JP keys**

In `src/lib/locales/zh-CN.json`:

```json
"dreamPanel.run.running": "运行中",
"dreamPanel.run.runningBody": "Dream 正在整理这个保管库。",
"dreamPanel.run.completed": "已完成",
"dreamPanel.run.noop": "没有新内容",
"dreamPanel.run.counts": "{raw} raw · {integrated} 已整合",
"dreamPanel.run.openLatestReport": "打开最新报告",
```

In `src/lib/locales/ja-JP.json`:

```json
"dreamPanel.run.running": "実行中",
"dreamPanel.run.runningBody": "Dream がこのボールトを整理しています。",
"dreamPanel.run.completed": "完了",
"dreamPanel.run.noop": "新しい作業はありません",
"dreamPanel.run.counts": "{raw} raw · {integrated} 統合済み",
"dreamPanel.run.openLatestReport": "最新レポートを開く",
```

- [ ] **Step 3: Add placeholder translations to remaining 17 locales**

For every other locale JSON file under `src/lib/locales/`, add the same six keys. Use clear English fallback text if a trustworthy translation is not available:

```json
"dreamPanel.run.running": "Running",
"dreamPanel.run.runningBody": "Dream is organizing this vault.",
"dreamPanel.run.completed": "Completed",
"dreamPanel.run.noop": "No new work",
"dreamPanel.run.counts": "{raw} raw · {integrated} integrated",
"dreamPanel.run.openLatestReport": "Open latest report",
```

The existing parity test will fail if any locale misses a key.

- [ ] **Step 4: Replace hardcoded labels in DreamPanel**

Use:

```tsx
translate(locale, 'dreamPanel.run.running')
translate(locale, 'dreamPanel.run.runningBody')
translate(locale, runSummary.kind === 'noop' ? 'dreamPanel.run.noop' : 'dreamPanel.run.completed')
translate(locale, 'dreamPanel.run.counts', {
  raw: runSummary.rawCollected ?? 0,
  integrated: runSummary.integrated ?? 0,
})
translate(locale, 'dreamPanel.run.openLatestReport')
```

- [ ] **Step 5: Add i18n component test**

Add to `src/components/DreamPanel.test.tsx`:

```ts
it('localizes the Run Dream no-op state', async () => {
  vi.mocked(mockInvoke)
    .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    .mockResolvedValueOnce({
      stdout: 'dream completed:\n  - collected raw: 0\n  - integrated: 0',
      stderr: '',
      success: true,
    })

  render(<DreamPanel vaultPath="/tmp/vault" locale="zh-CN" />)
  await screen.findByText(/status ok/)
  fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

  expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('没有新内容')
})
```

- [ ] **Step 6: Run i18n tests**

Run:

```bash
pnpm exec vitest run src/lib/i18n.test.ts src/components/DreamPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit i18n**

```bash
git add src/lib/locales src/components/DreamPanel.tsx src/components/DreamPanel.test.tsx
git commit -m "feat(v0.6.x PR 53): localize Dream run status copy"
```

---

### Task 5: Full Verification and GUI Review

**Files:**
- No new source files unless verification exposes a bug.

- [ ] **Step 1: Run static checks**

```bash
pnpm exec tsc -b --force
pnpm exec eslint . --max-warnings=0
```

Expected: both exit 0.

- [ ] **Step 2: Run frontend tests**

```bash
pnpm exec vitest run
```

Expected: all test files pass.

- [ ] **Step 3: Run Rust tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Expected: all tests pass; PR 53 should not change Rust behavior.

- [ ] **Step 4: Build app**

```bash
pnpm tauri build
```

Expected: `DreamX.app` bundle is produced under `src-tauri/target/release/bundle/macos/DreamX.app`.

- [ ] **Step 5: GUI verify**

```bash
open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
```

Verify:

- Initial DreamPanel still shows existing status text.
- Click `Run Dream`:
  - Button becomes disabled while running.
  - Run-state card shows `Running`.
  - On success, card changes to `Completed`.
  - If output is zero-work, card shows `No new work`.
  - Typed stats refresh after the run.
  - `Open latest report` appears when the output has a `dream-report:` path.
- Click `Status` still shows PR 52 typed stats above `<pre>`.
- Switch `zh-CN` and verify run-state copy is localized.

- [ ] **Step 6: Push after GUI pass**

```bash
git push origin main
```

Expected: remote `origin/main` advances.

---

## Self-Review

**Spec coverage:** This plan covers Running, Completed, No-op, Failed fallback through existing `ProviderErrorView`, typed stats refresh after Run Dream, and latest report access. It intentionally does not add new provider behavior or DreamVault/Rust contracts.

**Placeholder scan:** No `TBD`, no "implement later", no unspecified test step. The only conditional is the report-opening fallback; it is explicitly deferred unless GUI verify proves the existing note bridge cannot open report paths.

**Type consistency:** `DreamRunSummary`, `parseDreamRunSummary`, `onOpenReport`, and `dreamPanel.run.*` keys are introduced once and reused consistently.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-25-pr53-run-dream-status-experience.md`.

Execution options:

1. **Subagent-Driven (recommended)** - Dispatch one focused worker per task, review between commits.
2. **Inline Execution** - Execute in this session task-by-task with checkpoints after each commit.
