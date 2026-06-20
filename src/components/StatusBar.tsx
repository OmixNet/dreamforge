import { useEffect, useState } from 'react'
import type { ThemeMode } from '../lib/themeMode'
import type { AppLocale } from '../lib/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  StatusBarPrimarySection,
  StatusBarSecondarySection,
} from './status-bar/StatusBarSections'
import type { VaultOption } from './status-bar/types'

export type { VaultOption } from './status-bar/types'

const COMPACT_STATUS_BAR_MAX_WIDTH = 1000
const STACKED_STATUS_BAR_MAX_WIDTH = 900
const STATUS_BAR_STACKING_Z_INDEX = 30

function getWindowWidth() {
  return typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
}

function getStatusBarLayout(windowWidth: number) {
  const compact = windowWidth <= COMPACT_STATUS_BAR_MAX_WIDTH
  const stacked = windowWidth <= STACKED_STATUS_BAR_MAX_WIDTH
  return { compact, stacked }
}

function useStatusBarLayout() {
  const [windowWidth, setWindowWidth] = useState(() => getWindowWidth())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setWindowWidth(getWindowWidth())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return getStatusBarLayout(windowWidth)
}

// DREAMFORGE_SLIM: PR 6 StatusBar cleanup — 只保留 vault 路径 + 设置 + 主题 + 本地 commit
// 删 5 项 Tolaria 残留: 远程(NoRemoteBadge/AddRemoteModal/useStatusBarAddRemote) /
// 同步(SyncBadge) / 历史(PulseBadge/ConflictBadge) / 更新(BuildNumberButton) /
// AI(McpBadge/McpSetupDialog) / 反馈 / docs / zoom
export interface StatusBarProps {
  /** Vault 路径 — 必填（保留） */
  vaultPath: string
  /** 当前 vault 列表 — 必填（保留） */
  vaults: VaultOption[]
  /** Vault 切换 callback — 必填（保留） */
  onSwitchVault: (path: string) => void
  /** 设置 callback — 必填（保留） */
  onOpenSettings: () => void
  /** Uncommitted change count — 本地 commit 范畴（保留） */
  modifiedCount?: number
  /** Commit callback — 本地 commit 范畴（保留） */
  onCommitPush?: () => void
  commitActionPending?: boolean
  themeMode?: ThemeMode
  onToggleThemeMode?: () => void
  isOffline?: boolean
  isVaultReloading?: boolean
  locale?: AppLocale
}

interface StatusBarFooterProps extends StatusBarProps {
  compact: boolean
  stacked: boolean
}

function StatusBarPrimaryFromFooter({
  vaultPath,
  vaults,
  onSwitchVault,
  modifiedCount = 0,
  onCommitPush,
  commitActionPending = false,
  isOffline = false,
  isVaultReloading = false,
  compact,
  stacked,
  locale = 'en',
}: StatusBarFooterProps) {
  return (
    <StatusBarPrimarySection
      vaultPath={vaultPath}
      vaults={vaults}
      onSwitchVault={onSwitchVault}
      modifiedCount={modifiedCount}
      onCommitPush={onCommitPush}
      commitActionPending={commitActionPending}
      isOffline={isOffline}
      isVaultReloading={isVaultReloading}
      locale={locale}
      stacked={stacked}
      compact={compact}
    />
  )
}

function StatusBarSecondaryFromFooter({
  themeMode = 'light',
  onToggleThemeMode,
  onOpenSettings,
  locale = 'en',
  compact,
  stacked,
}: StatusBarFooterProps) {
  return (
    <StatusBarSecondarySection
      themeMode={themeMode}
      onToggleThemeMode={onToggleThemeMode}
      onOpenSettings={onOpenSettings}
      locale={locale}
      stacked={stacked}
      compact={compact}
    />
  )
}

function StatusBarFooter(props: StatusBarFooterProps) {
  const { compact, stacked } = props

  return (
    <footer
      data-testid="status-bar"
      style={{
        minHeight: 30,
        height: stacked ? 'auto' : 30,
        flexShrink: 0,
        display: 'flex',
        flexWrap: stacked ? 'wrap' : 'nowrap',
        alignItems: stacked ? 'flex-start' : 'center',
        justifyContent: stacked ? 'flex-start' : 'space-between',
        rowGap: stacked ? 4 : 0,
        columnGap: compact ? 8 : 12,
        background: 'var(--surface-statusbar)',
        borderTop: '1px solid var(--border-subtle)',
        padding: stacked ? '5px 10px' : '0 10px',
        fontSize: 12,
        color: 'var(--muted-foreground)',
        position: 'relative',
        zIndex: STATUS_BAR_STACKING_Z_INDEX,
      }}
    >
      <StatusBarPrimaryFromFooter {...props} />
      <StatusBarSecondaryFromFooter {...props} />
    </footer>
  )
}

export function StatusBar(props: StatusBarProps) {
  const { compact, stacked } = useStatusBarLayout()

  return (
    <TooltipProvider>
      <StatusBarFooter {...props} compact={compact} stacked={stacked} />
    </TooltipProvider>
  )
}
