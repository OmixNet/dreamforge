import { CircleNotch as Loader2, GitCommit as GitCommitHorizontal, GitDiff } from '@phosphor-icons/react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { ActionTooltip, type ActionTooltipCopy } from '@/components/ui/action-tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate, type AppLocale } from '../../lib/i18n'
import type { LastCommitInfo } from '../../types'
import { openExternalUrl } from '../../utils/url'
import { ICON_STYLE, SEP_STYLE } from './styles'

// DREAMFORGE_SLIM: PR 6 StatusBar cleanup — 只保留 5 个 badge
//   - OfflineBadge (网络状态指示)
//   - VaultReloadingBadge (vault reload 状态指示)
//   - ChangesBadge (本地 commit 范畴: uncommitted count)
//   - CommitButton (本地 commit 范畴: commit 按钮)
//   - CommitBadge (last commit 显示)
// 删 8 个 Tolaria 残留: NoRemoteBadge / SyncBadge / ConflictBadge / PulseBadge /
//   MissingGitBadge / McpBadge / ClaudeCodeBadge / BuildNumberButton

function handleStatusBarActionKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  onClick?: () => void,
) {
  if (!onClick) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onClick()
}

function StatusBarAction({
  copy,
  children,
  onClick,
  testId,
  ariaLabel,
  className,
  style,
  disabled = false,
  busy = false,
  compact = false,
}: {
  copy: ActionTooltipCopy
  children: ReactNode
  onClick?: () => void
  testId?: string
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  disabled?: boolean
  busy?: boolean
  compact?: boolean
}) {
  return (
    <ActionTooltip copy={copy} side="top">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(
          'h-auto gap-1 rounded-sm px-1 py-0.5 text-[12px] font-medium text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground',
          compact && 'h-6 gap-0.5 px-0.5',
          disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
          className,
        )}
        style={style}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(event) => handleStatusBarActionKeyDown(event, disabled ? undefined : onClick)}
        aria-label={ariaLabel ?? copy.label}
        aria-busy={busy || undefined}
        aria-disabled={disabled || undefined}
        data-testid={testId}
      >
        {children}
      </Button>
    </ActionTooltip>
  )
}

function StatusBarSeparator({ show = true }: { show?: boolean }) {
  if (!show) return null
  return <span style={SEP_STYLE}>|</span>
}

export function CommitBadge({ info, locale = 'en' }: { info: LastCommitInfo; locale?: AppLocale }) {
  const commitUrl = info.commitUrl

  if (commitUrl) {
    return (
      <button
        type="button"
        onClick={() => openExternalUrl(commitUrl)}
        style={{ ...ICON_STYLE, color: 'var(--muted-foreground)', textDecoration: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, border: 0, background: 'transparent' }}
        title={translate(locale, 'status.commit.openOnGitHub', { hash: info.shortHash })}
        data-testid="status-commit-link"
        onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--foreground)' }}
        onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--muted-foreground)' }}
      >
        <GitCommitHorizontal size={13} />
        {info.shortHash}
      </button>
    )
  }

  return (
    <span style={ICON_STYLE} data-testid="status-commit-hash">
      <GitCommitHorizontal size={13} />
      {info.shortHash}
    </span>
  )
}

export function OfflineBadge({
  isOffline,
  showSeparator = true,
  compact = false,
  locale = 'en',
}: {
  isOffline?: boolean
  showSeparator?: boolean
  compact?: boolean
  locale?: AppLocale
}) {
  if (!isOffline) return null

  return (
    <>
      <StatusBarSeparator show={showSeparator} />
      <span
        style={{
          ...ICON_STYLE,
          color: 'var(--destructive)',
          background: 'var(--feedback-error-bg)',
          borderRadius: 999,
          padding: '2px 6px',
          fontWeight: 600,
        }}
        title={translate(locale, 'status.offline.title')}
        data-testid="status-offline"
      >
        <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>
          ●
        </span>
        {compact ? null : translate(locale, 'status.offline.label')}
      </span>
    </>
  )
}

export function VaultReloadingBadge({
  isReloading,
  showSeparator = true,
  compact = false,
  locale = 'en',
}: {
  isReloading?: boolean
  showSeparator?: boolean
  compact?: boolean
  locale?: AppLocale
}) {
  if (!isReloading) return null

  return (
    <>
      <StatusBarSeparator show={showSeparator} />
      <StatusBarAction copy={{ label: translate(locale, 'status.vault.reloadingTooltip') }} testId="status-vault-reloading" compact={compact}>
        <span style={ICON_STYLE}>
          <Loader2 size={13} className="animate-spin" />
          {compact ? null : translate(locale, 'status.vault.reloading')}
        </span>
      </StatusBarAction>
    </>
  )
}

export function ChangesBadge({
  count,
  onClick,
  showSeparator = true,
  compact = false,
  locale = 'en',
}: {
  count: number
  onClick?: () => void
  showSeparator?: boolean
  compact?: boolean
  locale?: AppLocale
}) {
  if (count <= 0) return null

  return (
    <>
      <StatusBarSeparator show={showSeparator} />
      <StatusBarAction
        copy={{ label: translate(locale, 'status.changes.view') }}
        onClick={onClick}
        testId="status-modified-count"
        compact={compact}
      >
        <span style={ICON_STYLE}>
          <GitDiff size={13} style={{ color: 'var(--accent-orange)' }} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--accent-orange)',
              color: 'var(--text-inverse)',
              borderRadius: 9,
              padding: '0 5px',
              fontSize: 11,
              fontWeight: 600,
              minWidth: 16,
              lineHeight: '16px',
            }}
          >
            {count}
          </span>
          {compact ? null : translate(locale, 'status.changes.label')}
        </span>
      </StatusBarAction>
    </>
  )
}

export function CommitButton({
  onClick,
  pending = false,
  showSeparator = true,
  compact = false,
  locale = 'en',
}: {
  onClick?: () => void
  pending?: boolean
  showSeparator?: boolean
  compact?: boolean
  locale?: AppLocale
}) {
  if (!onClick) return null
  const copy = { label: translate(locale, 'status.commit.local') }

  return (
    <>
      <StatusBarSeparator show={showSeparator} />
      <StatusBarAction copy={copy} onClick={onClick} testId="status-commit-push" disabled={pending} busy={pending} compact={compact}>
        <span style={ICON_STYLE}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <GitCommitHorizontal size={13} />}
          {compact ? null : translate(locale, 'status.commit.label')}
        </span>
      </StatusBarAction>
    </>
  )
}
