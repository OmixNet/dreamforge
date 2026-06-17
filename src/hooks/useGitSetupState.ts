import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { GitSetupPreference } from '../types'

export type { GitSetupPreference } from '../types'

export type GitRepoState = 'checking' | 'missing' | 'ready'
type GitRepoStatus = { path: string; state: GitRepoState }

interface GitSetupStateConfig {
  gitSetupPreference?: GitSetupPreference | null
  onGitSetupPreferenceChange?: (preference: GitSetupPreference) => void
  onToast: (message: string | null) => void
  resolvedPath: string
  windowMode: boolean
  /**
   * v0.2 PR 11.5: when true, the "Enable Git for this vault?" dialog is skipped.
   * Slim shell / DreamForge mode auto-initializes git silently so the user is not
   * interrupted with a 3-button dialog every time they add a new vault.
   * Set to true from App.tsx (`DREAMFORGE_SLIM_MODE` compile-time constant).
   */
  slimMode?: boolean
}

function checkGitRepo(resolvedPath: string): Promise<boolean> {
  return isTauri()
    ? invoke<boolean>('is_git_repo', { vaultPath: resolvedPath })
    : mockInvoke<boolean>('is_git_repo', { vaultPath: resolvedPath })
}

function useCheckedGitRepoState(resolvedPath: string) {
  const [gitRepoStatus, setGitRepoStatus] = useState<GitRepoStatus>({
    path: '',
    state: 'checking',
  })
  const gitRepoState = gitRepoStatus.path === resolvedPath ? gitRepoStatus.state : 'checking'

  useEffect(() => {
    if (!resolvedPath) return
    let cancelled = false
    checkGitRepo(resolvedPath)
      .then(isGit => {
        if (!cancelled) setGitRepoStatus({ path: resolvedPath, state: isGit ? 'ready' : 'missing' })
      })
      .catch(() => {
        if (!cancelled) setGitRepoStatus({ path: resolvedPath, state: 'ready' })
      })
    return () => {
      cancelled = true
    }
  }, [resolvedPath])

  const markGitRepoReady = useCallback(() => {
    setGitRepoStatus({ path: resolvedPath, state: 'ready' })
  }, [resolvedPath])

  return { gitRepoState, markGitRepoReady }
}

function shouldShowGitSetupDialog({
  dismissedGitSetupPath,
  gitRepoState,
  gitSetupPreference,
  manuallyOpened,
  resolvedPath,
  slimMode,
  windowMode,
}: {
  dismissedGitSetupPath: string | null
  gitRepoState: GitRepoState
  gitSetupPreference: GitSetupPreference | null | undefined
  manuallyOpened: boolean
  resolvedPath: string
  slimMode: boolean
  windowMode: boolean
}): boolean {
  if (windowMode || gitRepoState !== 'missing') return false
  // v0.2 PR 11.5: slim mode auto-inits git silently — never show the dialog
  // unless the user manually opened it (e.g. from a help menu).
  if (slimMode && !manuallyOpened) return false
  if (manuallyOpened) return true
  return gitSetupPreference !== 'never' && dismissedGitSetupPath !== resolvedPath
}

export function useGitSetupState({
  gitSetupPreference = 'prompt',
  onGitSetupPreferenceChange,
  onToast,
  resolvedPath,
  windowMode,
  slimMode = false,
}: GitSetupStateConfig) {
  const [dismissedGitSetupPath, setDismissedGitSetupPath] = useState<string | null>(null)
  const [manuallyOpened, setManuallyOpened] = useState(false)
  const { gitRepoState, markGitRepoReady } = useCheckedGitRepoState(resolvedPath)

  const openGitSetupDialog = useCallback(() => {
    if (gitRepoState !== 'missing') return
    setManuallyOpened(true)
    setDismissedGitSetupPath(null)
  }, [gitRepoState])

  const dismissGitSetupDialog = useCallback(() => {
    setManuallyOpened(false)
    setDismissedGitSetupPath(resolvedPath)
  }, [resolvedPath])

  const neverForVaultGitSetupDialog = useCallback(() => {
    onGitSetupPreferenceChange?.('never')
    setManuallyOpened(false)
    setDismissedGitSetupPath(resolvedPath)
  }, [onGitSetupPreferenceChange, resolvedPath])

  const handleInitGitRepo = useCallback(async () => {
    if (isTauri()) {
      await invoke('init_git_repo', { vaultPath: resolvedPath })
    } else {
      await mockInvoke('init_git_repo', { vaultPath: resolvedPath })
    }
    markGitRepoReady()
    onGitSetupPreferenceChange?.('prompt')
    setManuallyOpened(false)
    setDismissedGitSetupPath(null)
    onToast('Git initialized for this vault')
  }, [markGitRepoReady, onGitSetupPreferenceChange, onToast, resolvedPath])

  const showGitSetupDialog = shouldShowGitSetupDialog({
    dismissedGitSetupPath,
    gitRepoState,
    gitSetupPreference,
    manuallyOpened,
    resolvedPath,
    slimMode,
    windowMode,
  })

  // v0.2 PR 11.5: auto-init git in slim mode the moment we detect a missing repo.
  // Runs once per resolvedPath change. The init is async + fire-and-forget — UI
  // does not block, and the dialog (suppressed by slimMode above) never appears.
  useEffect(() => {
    if (!slimMode) return
    if (windowMode) return
    if (gitRepoState !== 'missing') return
    if (gitSetupPreference === 'never') return
    if (dismissedGitSetupPath === resolvedPath) return
    void handleInitGitRepo()
    // handleInitGitRepo is stable across renders (depends on resolvedPath / callbacks);
    // we only re-run when the gate conditions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slimMode, windowMode, gitRepoState, resolvedPath, gitSetupPreference, dismissedGitSetupPath])

  return {
    dismissGitSetupDialog,
    gitRepoState,
    handleInitGitRepo,
    neverForVaultGitSetupDialog,
    openGitSetupDialog,
    showGitSetupDialog,
    shouldShowGitSetupDialog: showGitSetupDialog,
  }
}
