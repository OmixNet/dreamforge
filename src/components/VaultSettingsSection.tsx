import { useCallback, useState } from 'react'
import { Folder, Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { pickFolder } from '../utils/vault-dialog'
import type { VaultOption } from './status-bar/types'

/**
 * v0.2 PR 11.5: Settings → Vault section.
 *
 * Lists all known vaults (default + extra), shows the active one highlighted,
 * and exposes two actions:
 *  - Add: opens the native folder picker (Tauri) or prompt fallback (browser)
 *  - Remove: confirms then calls onRemoveVault
 *
 * v0.1 had no Settings-side vault management — users had to edit
 * `~/Library/Application Support/com.biomatrix.dreamforge/vaults.json` by hand.
 */
interface VaultSettingsSectionProps {
  vaults: VaultOption[]
  activeVaultPath: string | null
  onAddVault: (path: string, label: string) => void
  onRemoveVault: (path: string) => void
  testId?: string
}

function folderNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function VaultSettingsSection({
  vaults,
  activeVaultPath,
  onAddVault,
  onRemoveVault,
  testId = 'settings-vault-section',
}: VaultSettingsSectionProps) {
  const [adding, setAdding] = useState(false)
  const [removingPath, setRemovingPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = useCallback(async () => {
    setError(null)
    setAdding(true)
    try {
      const path = await pickFolder('Select vault folder')
      if (!path) return
      const label = folderNameFromPath(path)
      onAddVault(path, label)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }, [onAddVault])

  const handleRemove = useCallback(
    async (path: string) => {
      if (removingPath) return
      setError(null)
      setRemovingPath(path)
      try {
        onRemoveVault(path)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setRemovingPath(null)
      }
    },
    [onRemoveVault, removingPath],
  )

  return (
    <div className="space-y-3" data-testid={testId}>
      <div>
        <p className="text-sm font-medium text-foreground">Vaults</p>
        <p className="text-xs text-muted-foreground">
          Manage the vaults dreamforge can open. The active vault is highlighted.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <ul className="space-y-1" data-testid={`${testId}-list`}>
        {vaults.length === 0 && (
          <li className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No vaults yet. Click "Add vault" to pick a folder.
          </li>
        )}
        {vaults.map((vault) => {
          const isActive = vault.path === activeVaultPath
          const display = vault.label || folderNameFromPath(vault.path)
          const removing = removingPath === vault.path
          return (
            <li
              key={vault.path}
              className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2"
              data-testid={`${testId}-item-${vault.path}`}
              data-active={isActive}
            >
              <Folder size={14} weight="regular" className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-foreground">{display}</span>
                  {isActive && (
                    <span
                      className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                      data-testid={`${testId}-active-badge`}
                    >
                      Active
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground" title={vault.path}>
                  {vault.path}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={removing || isActive}
                onClick={() => void handleRemove(vault.path)}
                aria-label={`Remove from vault list: ${display}`}
                data-testid={`${testId}-remove-${vault.path}`}
                title={
                  isActive
                    ? 'Cannot remove the active vault — switch to another vault first'
                    : 'Remove vault'
                }
              >
                <Trash size={14} weight="regular" />
              </Button>
            </li>
          )
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleAdd()}
        disabled={adding}
        data-testid={`${testId}-add`}
      >
        <Plus size={14} weight="bold" />
        {adding ? 'Adding…' : 'Add vault'}
      </Button>

      <p className="text-[11px] text-muted-foreground">
        Vaults are stored in vaults.json under the dreamforge config directory.
      </p>
    </div>
  )
}
