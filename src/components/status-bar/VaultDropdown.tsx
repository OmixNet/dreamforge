import { Check, House } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { ActionTooltip } from '@/components/ui/action-tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { translate, type AppLocale } from '../../lib/i18n'
import type { VaultOption } from './types'

/**
 * v0.2 PR 11c: Slim vault dropdown.
 *
 * Replaces the v0.1 read-only `VaultPathBadge` with a clickable Radix DropdownMenu that
 * lists every available vault and triggers `onSwitchVault` on selection. The full
 * Tolaria `VaultMenu` (DnD reorder, workspace identity, etc.) was deleted in PR 9 and
 * stays deleted in v0.2 — multi-vault switching is the only feature that ships.
 */
interface VaultDropdownProps {
  vaultPath: string
  vaults: VaultOption[]
  onSwitchVault: (path: string) => void
  compact?: boolean
  locale?: AppLocale
}

function folderNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function VaultDropdown({
  vaultPath,
  vaults,
  onSwitchVault,
  compact = false,
  locale = 'en',
}: VaultDropdownProps) {
  const activeVault = useMemo(
    () => vaults.find((v) => v.path === vaultPath) ?? null,
    [vaults, vaultPath],
  )
  const label = activeVault?.label ?? folderNameFromPath(vaultPath)
  const tooltip = {
    label: `Vault: ${vaultPath}`,
  }
  const hasMultiple = vaults.length > 1

  return (
    <ActionTooltip copy={tooltip} side="top" align="start">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tooltip.label}
            data-testid="status-vault-path"
            data-active={activeVault?.path === vaultPath}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              border: 'none',
              background: 'transparent',
              borderRadius: 3,
              fontSize: 12,
              color: 'var(--muted-foreground)',
              cursor: hasMultiple ? 'pointer' : 'default',
              maxWidth: compact ? 140 : 240,
            }}
            onClick={(e) => {
              if (!hasMultiple) e.preventDefault()
            }}
          >
            <House size={12} weight="regular" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4}>
          <DropdownMenuLabel>
            {translate(locale, 'status.vault.switch' as never) || 'Switch vault'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {vaults.map((vault) => {
            const isActive = vault.path === vaultPath
            const display = vault.label || folderNameFromPath(vault.path)
            return (
              <DropdownMenuItem
                key={vault.path}
                onSelect={() => {
                  if (!isActive) onSwitchVault(vault.path)
                }}
                disabled={isActive}
                data-testid={`status-vault-option-${vault.path}`}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  {isActive ? <Check size={12} weight="bold" /> : <span style={{ width: 12 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {display}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </ActionTooltip>
  )
}
