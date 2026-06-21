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

export function DreamPanel({ vaultPath, onOpenMemory, onOpenWiki, onOpenSettingsAi }: DreamPanelProps) {
  const [output, setOutput] = useState('No Dream run yet.')
  const [error, setError] = useState<string | null>(null)
  const [runningCommand, setRunningCommand] = useState<DreamCommand | null>(null)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)

  const runCommand = useCallback(
    async (command: DreamCommand) => {
      setRunningCommand(command)
      setError(null)
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setOutput(message)
      } finally {
        setRunningCommand(null)
      }
    },
    [vaultPath],
  )

  // Auto-fetch status on mount and whenever the active vault changes.
  useEffect(() => {
    if (!vaultPath) return
    void runCommand('dreamvault_status')
  }, [vaultPath, runCommand])

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
            onClick={() => runCommand('dreamvault_run')}
            disabled={isBusy}
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
                onClick={() => runCommand('dreamvault_status')}
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
          <pre
            className="dreamx-panel-output"
            aria-live="polite"
          >
            {output}
          </pre>
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
