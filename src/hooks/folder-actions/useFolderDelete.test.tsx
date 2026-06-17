import { act, renderHook, type RenderHookResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFolderDelete } from './useFolderDelete'
import type { SidebarSelection, VaultEntry } from '../../types'
import type { FolderTab } from './folderActionUtils'

/**
 * v0.3 PR 12.2: useFolderDelete branch coverage.
 * - confirmDeleteFolder null early return
 * - deleteSelectedFolder kind/path guards
 * - requestDeleteFolder sets the confirm state
 * - confirmDeleteSelectedFolder success + error paths
 * - cancelDeleteFolder clears the state
 */

interface HookHarness {
  result: RenderHookResult<ReturnType<typeof useFolderDelete>, unknown>['result']
  setToastMessage: ReturnType<typeof vi.fn>
  setSelection: ReturnType<typeof vi.fn>
  reloadVault: ReturnType<typeof vi.fn>
  reloadFolders: ReturnType<typeof vi.fn>
  setTabs: ReturnType<typeof vi.fn>
  closeAllTabs: ReturnType<typeof vi.fn>
  clearFolderRename: ReturnType<typeof vi.fn>
  unmount: () => void
}

function setupHarness(initialSelection: SidebarSelection = { kind: 'filter', filter: 'all' }): HookHarness {
  const setToastMessage = vi.fn()
  const setSelection = vi.fn()
  const reloadVault = vi.fn().mockResolvedValue([])
  const reloadFolders = vi.fn().mockResolvedValue(undefined)
  const setTabs = vi.fn()
  const closeAllTabs = vi.fn()
  const clearFolderRename = vi.fn()
  const activeTabPathRef: React.MutableRefObject<string | null> = { current: null }
  const vaultPath = '/Users/biomatrix/vault'

  const { result, unmount } = renderHook(() =>
    useFolderDelete({
      activeTabPathRef,
      clearFolderRename,
      closeAllTabs,
      reloadFolders,
      reloadVault,
      selection: initialSelection,
      setSelection,
      setTabs,
      setToastMessage,
      vaultPath,
    }),
  )

  return {
    result,
    setToastMessage,
    setSelection,
    reloadVault,
    reloadFolders,
    setTabs,
    closeAllTabs,
    clearFolderRename,
    unmount,
  }
}

describe('useFolderDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with no pending confirm', () => {
    const { result } = setupHarness()
    expect(result.current.confirmDeleteFolder).toBeNull()
  })

  it('cancels a pending confirm', () => {
    const { result } = setupHarness()
    act(() => result.current.requestDeleteFolder('notes/2026'))
    expect(result.current.confirmDeleteFolder?.path).toBe('notes/2026')
    act(() => result.current.cancelDeleteFolder())
    expect(result.current.confirmDeleteFolder).toBeNull()
  })

  it('no-ops confirmDeleteSelectedFolder when no confirm is pending', async () => {
    const { result, reloadFolders, setToastMessage } = setupHarness()
    await act(async () => {
      await result.current.confirmDeleteSelectedFolder()
    })
    expect(reloadFolders).not.toHaveBeenCalled()
    expect(setToastMessage).not.toHaveBeenCalled()
  })

  it('runs the full delete pipeline on confirm', async () => {
    const { result, reloadFolders, reloadVault, setToastMessage, setSelection, clearFolderRename } =
      setupHarness({ kind: 'folder', path: 'notes/2026' })

    act(() => result.current.requestDeleteFolder('notes/2026'))
    expect(clearFolderRename).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.confirmDeleteSelectedFolder()
    })
    expect(reloadFolders).toHaveBeenCalledTimes(1)
    expect(reloadVault).toHaveBeenCalledTimes(1)
    expect(setToastMessage).toHaveBeenCalledWith(expect.stringContaining('Deleted folder'))
    expect(setSelection).toHaveBeenCalledWith({ kind: 'filter', filter: 'all' })
  })

  it('surfaces an error toast when the delete throws', async () => {
    const { result, reloadFolders, setToastMessage } = setupHarness()
    reloadFolders.mockRejectedValueOnce(new Error('disk gone'))
    act(() => result.current.requestDeleteFolder('notes/2026'))
    await act(async () => {
      await result.current.confirmDeleteSelectedFolder()
    })
    expect(setToastMessage).toHaveBeenCalledWith(expect.stringContaining('Failed to delete folder'))
  })

  it('deleteSelectedFolder no-ops when selection is not a folder', () => {
    const { result } = setupHarness({ kind: 'filter', filter: 'all' })
    act(() => result.current.deleteSelectedFolder())
    expect(result.current.confirmDeleteFolder).toBeNull()
  })

  it('deleteSelectedFolder no-ops when the folder path is empty', () => {
    const { result } = setupHarness({ kind: 'folder', path: '' })
    act(() => result.current.deleteSelectedFolder())
    expect(result.current.confirmDeleteFolder).toBeNull()
  })

  it('deleteSelectedFolder opens the confirm dialog when selection is a real folder', () => {
    const { result } = setupHarness({ kind: 'folder', path: 'notes/2026' })
    act(() => result.current.deleteSelectedFolder())
    expect(result.current.confirmDeleteFolder?.path).toBe('notes/2026')
  })
})

// Force-import type-only references so the test file actually exercises the
// type graph (otherwise TS might drop the import in isolatedModules mode).
type _Entry = VaultEntry
type _Tab = FolderTab
