import { useCallback, useEffect, useState } from 'react'
import { isTauri, mockInvoke } from '../mock-tauri'
import { invoke } from '@tauri-apps/api/core'
import { resolveDreamCliPathForInvoke, resolveLlmConfigForInvoke, resolveLlmApiKeyEnvForInvoke } from '../lib/dreamCliPath'
import { ActionTooltip } from './ui/action-tooltip'
import { Button } from './ui/button'

interface DreamVaultCommandOutput {
  stdout: string
  stderr: string
  success: boolean
}

interface DreamPanelProps {
  vaultPath: string
  onOpenMemory?: () => void
  onOpenWiki?: () => void
}

type DreamCommand = 'dreamvault_status' | 'dreamvault_run' | 'dreamvault_report'

async function runDreamCommand(
  command: DreamCommand,
  vaultPath: string,
  dreamCliPath: string | null,
  llmBaseUrl: string | null,
  llmModel: string | null,
  llmApiKeyEnv: string | null,
): Promise<DreamVaultCommandOutput> {
  // PR 10: pass llmBaseUrl + llmModel to Rust (Tauri auto-converts camelCase → snake_case)
  // v0.5 PR 24 P2a: pass llmApiKeyEnv — the NAME (not value) of the user's shell
  // env var where the active provider's API key lives. Rust reads the value from
  // the shell env at dream-invoke time and injects it into the subprocess as
  // DREAMFORGE_LLM_API_KEY. The key value NEVER enters localStorage, settings,
  // or CLI args.
  const args: {
    vaultPath: string
    dreamCliPath?: string
    llmBaseUrl?: string
    llmModel?: string
    llmApiKeyEnv?: string
  } = { vaultPath }
  if (dreamCliPath) args.dreamCliPath = dreamCliPath
  if (llmBaseUrl) args.llmBaseUrl = llmBaseUrl
  if (llmModel) args.llmModel = llmModel
  if (llmApiKeyEnv) args.llmApiKeyEnv = llmApiKeyEnv
  return isTauri()
    ? invoke<DreamVaultCommandOutput>(command, args)
    : mockInvoke<DreamVaultCommandOutput>(command, args)
}

export function DreamPanel({ vaultPath, onOpenMemory, onOpenWiki }: DreamPanelProps) {
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
        const result = await runDreamCommand(
          command,
          vaultPath,
          dreamCliPath,
          llmBaseUrl,
          llmModel,
          llmApiKeyEnv,
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

  return (
    <section className="app__dream-panel" aria-label="Dream panel">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Dream</h2>
        {lastRunAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            last updated {new Date(lastRunAt).toLocaleString()}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <Button
          type="button"
          size="sm"
          onClick={() => runCommand('dreamvault_run')}
          disabled={isBusy}
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

      <pre
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-5 text-muted-foreground"
        aria-live="polite"
      >
        {error ? `Error: ${error}` : output}
      </pre>
    </section>
  )
}
