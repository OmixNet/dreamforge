import { GearSix as Settings, Moon, Sun, House, type IconProps } from '@phosphor-icons/react'
import type { ComponentType, MouseEventHandler } from 'react'
import type { ThemeMode } from '../../lib/themeMode'
import { translate, type AppLocale } from '../../lib/i18n'
import { ActionTooltip } from '@/components/ui/action-tooltip'
import { Button } from '@/components/ui/button'
import {
  ChangesBadge,
  CommitButton,
} from './StatusBarBadges'
import { SEP_STYLE } from './styles'
import type { VaultOption } from './types'
// DREAMFORGE_SLIM: PR 9 VaultMenu 物理删除 (Tolaria 801 行 DnD, 不需要)
// v0.2 PR 11c: 新轻量 VaultDropdown (Radix DropdownMenu, ~100 行, 只支持切换)
import { VaultDropdown } from './VaultDropdown'
import { formatShortcutDisplay } from '../../hooks/appCommandCatalog'

const SETTINGS_SHORTCUT = {
  shortcut: formatShortcutDisplay({ display: '⌘,' }),
} as const

// DREAMFORGE_SLIM: PR 9 StatusBar super-slim — primary section 只保留 4 essential
//   - vault 路径 (read-only badge, v0.1 单 vault 不切换, 删 VaultMenu dropdown)
//   - 本地 commit 范畴 (ChangesBadge + CommitButton)
// 删 4 项: VaultMenu 切换 (单 vault 设计) / OfflineBadge (网络状态指示, v0.1 不做) /
//   VaultReloadingBadge (reload 状态指示, v0.1 不做) / Tolaria 残 (NoRemote/Sync/Pulse/BuildNumber)
export interface StatusBarPrimarySectionProps {
  vaultPath: string
  // DREAMFORGE_SLIM: vaults + onSwitchVault 物理删除 (PR 9, v0.1 单 vault, API compat 保留以不让 caller TS fail)
  // 实际 _vaults / _onSwitchVault, 内部不再读
  vaults?: VaultOption[]
  onSwitchVault?: (path: string) => void
  modifiedCount: number
  onCommitPush?: () => void
  commitActionPending?: boolean
  // DREAMFORGE_SLIM: isOffline + isVaultReloading 物理删除 (PR 9, v0.1 不做网络/reload 状态指示)
  isOffline?: boolean
  isVaultReloading?: boolean
  stacked?: boolean
  compact?: boolean
  locale?: AppLocale
}

export interface StatusBarSecondarySectionProps {
  themeMode?: ThemeMode
  onToggleThemeMode?: () => void
  onOpenSettings?: () => void
  stacked?: boolean
  compact?: boolean
  locale?: AppLocale
}

function primarySectionStyle(stacked: boolean, compact: boolean) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: compact ? 8 : 12,
    rowGap: stacked ? 4 : 0,
    flex: 1,
    minWidth: 0,
    width: stacked ? '100%' : 'auto',
    flexBasis: stacked ? '100%' : 'auto',
    flexWrap: stacked ? 'wrap' : 'nowrap',
  } as const
}

function PrimarySeparator({ compact }: { compact: boolean }) {
  return compact ? null : <span style={SEP_STYLE}>|</span>
}

function VaultPathBadge({
  vaultPath,
  vaults,
  onSwitchVault,
  compact,
  locale,
}: {
  vaultPath: string
  vaults?: VaultOption[]
  onSwitchVault?: (path: string) => void
  compact: boolean
  locale: AppLocale
}) {
  // v0.2 PR 11c: 改用 VaultDropdown (Radix DropdownMenu).
  // 1 vault 退化 read-only (跟 v0.1 一样), 2+ vault 显示 dropdown.
  if (!vaults || vaults.length <= 1 || !onSwitchVault) {
    const folderName = vaultPath.split('/').filter(Boolean).at(-1) ?? vaultPath
    const tooltip = { label: `Vault: ${vaultPath}` }
    return (
      <ActionTooltip copy={tooltip} side="top" align="start">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--surface-card) 64%, transparent)',
            border: '1px solid var(--border-subtle)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            maxWidth: compact ? 140 : 240,
          }}
          data-testid="status-vault-path"
        >
          <House size={12} weight="regular" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderName}
          </span>
        </span>
      </ActionTooltip>
    )
  }
  return (
    <VaultDropdown
      vaultPath={vaultPath}
      vaults={vaults}
      onSwitchVault={onSwitchVault}
      compact={compact}
      locale={locale}
    />
  )
}

export function StatusBarPrimarySection({
  vaultPath,
  // v0.2 PR 11c: vaults + onSwitchVault 从 _ 占位变成实参 (VaultDropdown 用)
  vaults,
  onSwitchVault,
  modifiedCount,
  onCommitPush,
  commitActionPending = false,
  // DREAMFORGE_SLIM: isOffline + isVaultReloading 参数保留兼容 (type compat), 内部不再读
  isOffline: _isOffline,
  isVaultReloading: _isVaultReloading,
  locale = 'en',
  stacked = false,
  compact = false,
}: StatusBarPrimarySectionProps) {
  return (
    <div style={primarySectionStyle(stacked, compact)}>
      <VaultPathBadge
        vaultPath={vaultPath}
        vaults={vaults}
        onSwitchVault={onSwitchVault}
        compact={compact}
        locale={locale}
      />
      <PrimarySeparator compact={compact} />
      <ChangesBadge
        count={modifiedCount}
        showSeparator={false}
        compact={compact}
        locale={locale}
      />
      <CommitButton
        onClick={onCommitPush}
        pending={commitActionPending}
        showSeparator={false}
        compact={compact}
        locale={locale}
      />
    </div>
  )
}

export function StatusBarSecondarySection({
  themeMode = 'light',
  onToggleThemeMode,
  onOpenSettings,
  locale = 'en',
  stacked = false,
  compact = false,
}: StatusBarSecondarySectionProps) {
  const ThemeIcon = themeMode === 'dark' ? Sun : Moon
  const themeTooltip = {
    label: translate(locale, themeMode === 'dark' ? 'status.theme.light' : 'status.theme.dark'),
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: stacked ? 'flex-end' : 'flex-start',
        gap: compact ? 8 : 12,
        flexShrink: 0,
        width: stacked ? '100%' : 'auto',
      }}
    >
      <ActionTooltip copy={themeTooltip} side="top" align="end" contentTestId="status-theme-mode-tooltip">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground"
          onClick={onToggleThemeMode}
          disabled={!onToggleThemeMode}
          aria-label={themeTooltip.label}
          data-testid="status-theme-mode"
        >
          <ThemeIcon size={14} weight="regular" />
        </Button>
      </ActionTooltip>
      <ActionTooltip copy={{ label: translate(locale, 'status.settings.open'), ...SETTINGS_SHORTCUT }} side="top" align="end">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground"
          onClick={onOpenSettings}
          aria-label={translate(locale, 'status.settings.open')}
          data-testid="status-settings"
        >
          <Settings size={14} weight="regular" />
        </Button>
      </ActionTooltip>
    </div>
  )
}

// DREAMFORGE_SLIM: StatusLinkButton / FeedbackButton / DocsButton / BuildNumberButton / StatusBarGitControls
// 全部物理删除 (PR 6) — Tolaria 残留入口
// DREAMFORGE_SLIM: OfflineBadge / VaultReloadingBadge / VaultMenu 物理不再 render (PR 9, v0.1 super-slim)

// 重新 export type 让旧 import 仍能编译 (TypeScript-only stub, no runtime cost)
// DREAMFORGE_SLIM: 旧 code 仍可能 import IconProps / MouseEventHandler / ComponentType from this module
export type { ComponentType, IconProps, MouseEventHandler }
