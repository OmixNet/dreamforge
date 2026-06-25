import { useCallback, useEffect, useState } from 'react'
import { isTauri, mockInvoke } from '../mock-tauri'
import { invoke } from '@tauri-apps/api/core'
import {
  resolveDreamCliPathForInvoke,
  resolveLlmConfigForInvoke,
  resolveLlmApiKeyEnvForInvoke,
  resolveLlmApiKeyProviderIdForInvoke,
  resolveLlmProviderKindForInvoke,
} from '../lib/dreamCliPath'
import {
  parseProviderError,
  stripOpenAITag,
  type ProviderErrorInfo,
} from '../lib/dreamProviderError'
import {
  parseDreamStatus,
  type DreamVaultStatusReport,
} from '../lib/dreamCliStatus'
import { parseDreamRunSummary, type DreamRunSummary } from '../lib/dreamRunSummary'
import { translate, type AppLocale } from '../lib/i18n'
import { ActionTooltip } from './ui/action-tooltip'
import { Button } from './ui/button'
import { TooltipProvider } from './ui/tooltip'

interface DreamVaultCommandOutput {
  stdout: string
  stderr: string
  success: boolean
}

interface DreamPanelProps {
  vaultPath: string
  locale?: AppLocale
  onOpenMemory?: () => void
  onOpenWiki?: () => void
  /**
   * v0.6 PR 34: open the Settings panel, optionally scrolled to the
   * AI section. Wired by App.tsx via `dialogs.openSettings()`. When
   * undefined, fix-action buttons that need it (missing key / auth
   * failed / model not found) are rendered as `disabled` with a
   * tooltip-style hint instead of a clickable button.
   */
  onOpenSettingsAi?: () => void
}

type DreamCommand = 'dreamvault_status' | 'dreamvault_run' | 'dreamvault_report'

async function runDreamCommand(
  command: DreamCommand,
  vaultPath: string,
  dreamCliPath: string | null,
  llmBaseUrl: string | null,
  llmModel: string | null,
  llmApiKeyEnv: string | null,
  llmApiKeyProviderId: string | null,
  llmProviderKind: string | null,
): Promise<DreamVaultCommandOutput> {
  // PR 10: pass llmBaseUrl + llmModel to Rust (Tauri auto-converts camelCase → snake_case)
  // v0.5 PR 24 P2a: pass llmApiKeyEnv — the NAME (not value) of the user's shell
  // env var where the active provider's API key lives. DreamX reads the value from
  // the shell env at dream-invoke time and injects it into the subprocess as
  // DREAMFORGE_LLM_API_KEY. The key value NEVER enters localStorage, settings,
  // or CLI args.
  // v0.5 PR 27 P2c-1.5: pass llmApiKeyProviderId so Rust can look up the
  // actual key value in macOS Keychain (PR 25 wrapper) BEFORE falling back
  // to shell env. This closes the loop: Settings → Keychain → dream CLI.
  const args: {
    vaultPath: string
    dreamCliPath?: string
    llmBaseUrl?: string
    llmModel?: string
    llmApiKeyEnv?: string
    llmApiKeyProviderId?: string
    llmProviderKind?: string
  } = { vaultPath }
  if (dreamCliPath) args.dreamCliPath = dreamCliPath
  const commandNeedsLlm = command !== 'dreamvault_status'
  if (commandNeedsLlm && llmBaseUrl) args.llmBaseUrl = llmBaseUrl
  if (commandNeedsLlm && llmModel) args.llmModel = llmModel
  if (commandNeedsLlm && llmApiKeyEnv) args.llmApiKeyEnv = llmApiKeyEnv
  if (commandNeedsLlm && llmApiKeyProviderId) args.llmApiKeyProviderId = llmApiKeyProviderId
  if (commandNeedsLlm && llmProviderKind) args.llmProviderKind = llmProviderKind
  return isTauri()
    ? invoke<DreamVaultCommandOutput>(command, args)
    : mockInvoke<DreamVaultCommandOutput>(command, args)
}

function formatDreamPanelLastDreamTime(iso: string, locale: AppLocale): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const diffMs = Date.now() - ms
  if (diffMs < 0 || diffMs < 60_000) return locale === 'en' ? 'just now' : '0 min'

  const abs = Math.abs(diffMs)
  if (abs < 60 * 60_000) {
    const minutes = Math.round(abs / 60_000)
    return locale === 'en' ? `${minutes} min ago` : `${minutes} min`
  }
  if (abs < 24 * 60 * 60_000) {
    const hours = Math.round(abs / (60 * 60_000))
    return locale === 'en' ? `${hours} h ago` : `${hours} h`
  }
  if (abs < 30 * 24 * 60 * 60_000) {
    const days = Math.round(abs / (24 * 60 * 60_000))
    return locale === 'en' ? `${days} days ago` : `${days} d`
  }
  if (abs < 365 * 24 * 60 * 60_000) {
    const months = Math.round(abs / (30 * 24 * 60 * 60_000))
    return locale === 'en' ? `${months} mo ago` : `${months} mo`
  }
  const years = Math.round(abs / (365 * 24 * 60 * 60_000))
  return locale === 'en' ? `${years} y ago` : `${years} y`
}

export function DreamPanel({ vaultPath, locale = 'en', onOpenMemory, onOpenWiki, onOpenSettingsAi }: DreamPanelProps) {
  const [output, setOutput] = useState('No Dream run yet.')
  const [error, setError] = useState<string | null>(null)
  const [runningCommand, setRunningCommand] = useState<DreamCommand | null>(null)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  // PR 52: typed stats from dreamvault_status_json (PR 50b). The
  // text-only "5 candidates · 7 processed · 1 archived" line + the
  // "Last dream: X ago" line + the "Last report: <path>" line are
  // rendered above the existing <pre> text output. Silent fallback
  // (old binary / IPC fail / schemaVersion mismatch) → typed stays
  // null → typed section is not rendered, the existing text path
  // keeps working unchanged. This preserves the no-landing-page
  // invariant (PR 42/47) and the silent-fallback pattern locked
  // by PR 50c.1.
  const [vaultStatsJson, setVaultStatsJson] = useState<DreamVaultStatusReport | null>(null)
  // PR 52: lastDreamAt comes from the text-parse path (PR 48). The
  // dream CLI text output now includes "Last dream: <ISO>" (added
  // in the PR 51a pre-req commit). Kept here as a parallel parse —
  // we don't need to wait for the typed JSON to know the last dream
  // time, and the text path is the same source as the existing
  // empty-editor "Last dream: X ago" line (PR 48).
  const [lastDreamAt, setLastDreamAt] = useState<string | null>(null)
  // PR 53: run-state card. Drives the "Running / Completed / No new
  // work" badge above the typed stats section. The parser
  // (parseDreamRunSummary) classifies the dream CLI stdout into
  // one of three kinds; failed runs don't update this state at
  // all (ProviderErrorView takes over the error path). Set on
  // dreamvault_run success, cleared on next run start + on error.
  const [runSummary, setRunSummary] = useState<DreamRunSummary | null>(null)
  const fetchVaultStatsJson = useCallback(async () => {
    try {
      const report = await (isTauri()
        ? invoke<DreamVaultStatusReport>('dreamvault_status_json', { vaultPath })
        : mockInvoke<DreamVaultStatusReport>('dreamvault_status_json', { vaultPath }))
      setVaultStatsJson(report)
    } catch {
      setVaultStatsJson(null)
    }
  }, [vaultPath])

  const runCommand = useCallback(
    async (command: DreamCommand, options: { refreshTypedStats?: boolean } = {}) => {
      setRunningCommand(command)
      setError(null)
      // PR 53: clear stale run summary when starting a new run so
      // the UI doesn't briefly show "Completed" from the previous
      // cycle while the new one is in flight.
      if (command === 'dreamvault_run') {
        setRunSummary(null)
      }
      try {
        const dreamCliPath = resolveDreamCliPathForInvoke()
        const { llmBaseUrl, llmModel } = resolveLlmConfigForInvoke()
        const llmApiKeyEnv = resolveLlmApiKeyEnvForInvoke()
        const llmApiKeyProviderId = resolveLlmApiKeyProviderIdForInvoke()
        const llmProviderKind = resolveLlmProviderKindForInvoke()
        const result = await runDreamCommand(
          command,
          vaultPath,
          dreamCliPath,
          llmBaseUrl,
          llmModel,
          llmApiKeyEnv,
          llmApiKeyProviderId,
          llmProviderKind,
        )
        const next = [result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'Command completed.'
        setOutput(next)
        setLastRunAt(new Date().toISOString())
        // PR 53: parse the run output into a structured summary
        // for the run-state card. Pure parser; falls back to
        // kind='unknown' when the CLI's text output doesn't match
        // any of the locked patterns.
        if (command === 'dreamvault_run') {
          setRunSummary(parseDreamRunSummary(next))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setOutput(message)
        // PR 53: failed runs don't get a run-state card —
        // ProviderErrorView renders the actionable error UX
        // instead. Clearing prevents the stale "Completed" badge
        // from showing after a transient error.
        if (command === 'dreamvault_run') {
          setRunSummary(null)
        }
      } finally {
        setRunningCommand(null)
      }
      if (options.refreshTypedStats) {
        await fetchVaultStatsJson()
      }
    },
    [fetchVaultStatsJson, vaultPath],
  )

  // Auto-fetch status on mount and whenever the active vault changes.
  useEffect(() => {
    if (!vaultPath) return
    void runCommand('dreamvault_status')
  }, [vaultPath, runCommand])

  useEffect(() => {
    // PR 52: DreamPanel typed stats are deliberately click-to-show.
    // Empty editor gets typed stats on mount from App.tsx (PR 50c),
    // but this side panel keeps the pre-existing text output until
    // the user explicitly clicks Status. Clear stale typed stats when
    // the active vault changes.
    setVaultStatsJson(null)
  }, [vaultPath])

  // PR 52: derive lastDreamAt from the most recent text output
  // (which contains the "Last dream: <ISO>" line added in the
  // PR 51a pre-req commit). This runs on every output change so
  // the relative time refreshes naturally when the user hits
  // Status / Run Dream. The parse is tolerant — a missing or
  // unparseable line leaves lastDreamAt as the previous value
  // (or null if it's never been seen).
  useEffect(() => {
    const parsed = parseDreamStatus(output)
    if (parsed.lastDreamAt) setLastDreamAt(parsed.lastDreamAt)
  }, [output])

  // PR 52: i18n is still partial in DreamPanel today (Run Dream / Status /
  // MEMORY.md / wiki/ remain English-only). Per the minimal-scope PR 52
  // spec, we add i18n for the new typed section only (3 keys: counts
  // via reused `editor.workspace.countsDetailed`, plus 2 new keys for
  // the "Last dream" / "Last report" labels). The existing English
  // buttons stay English-only — full DreamPanel i18n is a follow-up.
  const isBusy = runningCommand !== null
  const statusState = error ? 'error' : isBusy ? 'running' : 'ready'
  const statusLabel = error ? 'Issue' : isBusy ? 'Running' : 'Ready'

  return (
    <TooltipProvider>
      <section className="app__dream-panel" aria-label="Dream panel">
        <header className="dreamx-panel-header">
          <div className="min-w-0">
            <div className="dreamx-panel-kicker">Dream Engine</div>
            <h2 className="dreamx-panel-title">Dream</h2>
            {lastRunAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(lastRunAt).toLocaleString()}
              </p>
            )}
          </div>
          <span className="dreamx-panel-status" data-state={statusState}>
            {statusLabel}
          </span>
        </header>

        <div className="dreamx-panel-actions">
          <Button
            type="button"
            size="sm"
            onClick={() => runCommand('dreamvault_run', { refreshTypedStats: true })}
            disabled={isBusy}
            // PR 42: empty workspace's "Run Dream" action button focuses
            // this button via the testid. Do not rename without updating
            // App.tsx's handleFocusDreamPanel selector.
            data-testid="run-dream-button"
            className="w-full"
          >
            Run Dream
          </Button>
          <div className="flex gap-2">
            <ActionTooltip copy={{ label: 'Refresh vault status' }} side="bottom" align="start">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => runCommand('dreamvault_status', { refreshTypedStats: true })}
                disabled={isBusy}
                className="flex-1"
              >
                Status
              </Button>
            </ActionTooltip>
            <ActionTooltip copy={{ label: 'Open MEMORY.md' }} side="bottom" align="end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenMemory}
                disabled={!onOpenMemory}
                className="flex-1"
              >
                MEMORY.md
              </Button>
            </ActionTooltip>
            <ActionTooltip copy={{ label: 'Open wiki/' }} side="bottom" align="end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenWiki}
                disabled={!onOpenWiki}
                className="flex-1"
              >
                wiki/
              </Button>
            </ActionTooltip>
          </div>
        </div>

        {error ? (
          <ProviderErrorView
            message={error}
            onOpenSettingsAi={onOpenSettingsAi}
            onRetry={runningCommand ? undefined : () => void runCommand('dreamvault_run')}
          />
        ) : (
          <>
            {/* PR 53: run-state card. Renders above the typed stats
                block. Three states:
                  - 'Running'    while dreamvault_run is in flight
                  - 'Completed'  parseDreamRunSummary returns kind='completed'
                  - 'No new work' kind='noop' (zero-work, not a failure)
                Hidden before the first run + after a failed run
                (ProviderErrorView takes over in the error path).
                Task 4 will convert the hardcoded English copy to
                locale-aware i18n keys; the test ids + state values
                are stable so the i18n swap is mechanical. */}
            {runningCommand === 'dreamvault_run' ? (
              <div
                className="dreamx-panel-run-state"
                data-testid="dream-panel-run-state"
                data-state="running"
              >
                <strong>Running</strong>
                <span>Dream is organizing this vault.</span>
              </div>
            ) : runSummary ? (
              <div
                className="dreamx-panel-run-state"
                data-testid="dream-panel-run-state"
                data-state={runSummary.kind}
              >
                <strong>{runSummary.kind === 'noop' ? 'No new work' : 'Completed'}</strong>
                {runSummary.rawCollected !== null || runSummary.integrated !== null ? (
                  <span>
                    {runSummary.rawCollected ?? 0} raw · {runSummary.integrated ?? 0} integrated
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* PR 52: typed stats quick view. Renders ONLY when the
                typed JSON path succeeded (vaultStatsJson != null).
                On any error / old binary / schemaVersion mismatch,
                this section is silently hidden and the <pre> text
                output below remains the source of truth (existing
                behavior, no-landing-page invariant preserved). */}
            {vaultStatsJson ? (
              <div
                className="dreamx-panel-stats space-y-1 text-xs text-muted-foreground"
                data-testid="dream-panel-typed-stats"
                aria-label="Vault stats"
              >
                <p className="m-0">
                  {translate(locale, 'editor.workspace.countsDetailed', {
                    candidates: vaultStatsJson.rawCandidatesCount,
                    processed: vaultStatsJson.processedCount,
                    archived: vaultStatsJson.archivedCount,
                  })}
                </p>
                {lastDreamAt ? (
                  <p className="m-0" data-testid="dream-panel-last-dream">
                    {translate(locale, 'dreamPanel.stats.lastDream', {
                      time: formatDreamPanelLastDreamTime(lastDreamAt, locale),
                    })}
                  </p>
                ) : null}
                {vaultStatsJson.lastReportPath ? (
                  <p className="m-0 truncate" data-testid="dream-panel-last-report">
                    {translate(locale, 'dreamPanel.stats.lastReport', {
                      path: vaultStatsJson.lastReportPath,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <pre
              className="dreamx-panel-output"
              aria-live="polite"
            >
              {output}
            </pre>
          </>
        )}
      </section>
    </TooltipProvider>
  )
}

/**
 * v0.6 PR 34: structured error view that replaces the raw
 * `Error: ${error}` rendering. Parses the dream CLI stderr (or thrown
 * error message) for the stable `[OPENAI_*]` tag and renders a short
 * actionable card with a fix-action button.
 *
 * SECURITY: only the provider-controlled short message and fix action
 * label are shown to the user. The body of the error string (which
 * may contain the API key value if a misconfigured server echoed it
 * back) is NEVER rendered. For the 'unknown' category, only the
 * tag-stripped body is shown as a fallback inside a `<pre>` block
 * — and even then it's the user-visible raw output, not anything
 * that would propagate to analytics / logs.
 */
interface ProviderErrorViewProps {
  message: string
  onOpenSettingsAi?: () => void
  onRetry?: () => void
}

function ProviderErrorView({ message, onOpenSettingsAi, onRetry }: ProviderErrorViewProps) {
  const info: ProviderErrorInfo = parseProviderError(message)
  // PR 41: collapsible raw details (default closed) for ALL 6 known
  // categories + unknown. The body is the tag-stripped stderr — useful
  // for debugging (paste into GitHub issue, share with support), and
  // the user explicitly opts in by clicking. SECURITY: this is the
  // same stderr the user already saw if they ran dream CLI in their
  // terminal — no new surface.
  const body = stripOpenAITag(message)
  // Local state for the Copy details feedback ("Copied!" → resets).
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [copyState])
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message)
        setCopyState('copied')
      } else {
        setCopyState('failed')
      }
    } catch {
      setCopyState('failed')
    }
  }, [message])

  return (
    <div
      className="dreamx-panel-error"
      role="alert"
      aria-live="assertive"
      data-error-category={info.category}
    >
      <p className="dreamx-panel-error-message">{info.shortMessage}</p>

      <div className="flex flex-col gap-2">
        {info.fixAction === 'open-settings-ai' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenSettingsAi}
            disabled={!onOpenSettingsAi}
            className="w-full"
          >
            {info.fixActionLabel}
          </Button>
        ) : null}

        {info.fixAction === 'retry' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={!onRetry}
            className="w-full"
          >
            {info.fixActionLabel}
          </Button>
        ) : null}

        {body ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleCopy()}
            aria-label="Copy error details to clipboard"
            className="w-full text-muted-foreground"
          >
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'failed'
                ? "Couldn't copy — select & copy manually"
                : 'Copy details'}
          </Button>
        ) : null}
      </div>

      {body ? (
        // PR 41: <details> with default closed keeps the long stderr
        // out of sight until the user opts in. 6 known categories now
        // also expose the body (was unknown-only in PR 34) — the
        // security invariant (apiKey never in shortMessage) still
        // holds; the body is the user's own stderr to debug.
        <details className="dreamx-panel-error-details text-xs">
          <summary className="cursor-pointer select-none py-1 text-muted-foreground hover:text-foreground">
            Raw error details
          </summary>
          <pre
            className="dreamx-panel-output mt-1 max-h-40 overflow-auto"
            aria-label="Raw error details"
          >
            {body}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
