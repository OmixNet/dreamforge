import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFolderRename } from './useFolderRename'
import type { SidebarSelection } from '../../types'

/**
 * v0.3 PR 12.2: useFolderRename branch coverage.
 * - start/cancel rename lifecycle
 * - renameFolder no-op when name is unchanged
 * - renameFolder success + error paths
 * - renameSelectedFolder kind/path guards
 */

interface Harness {
  result: ReturnType<typeof renderHook<ReturnType<typeof useFolderRename>, unknown>>['result']
  setToastMessage: ReturnType<typeof vi.fn>
  setSelection: ReturnType<typeof vi.fn>
  reloadVault: ReturnType<typeof vi.fn>
  reloadFolders: ReturnType<typeof vi.fn>
  setTabs: ReturnType<typeof vi.fn>
  handleSwitchTab: ReturnType<typeof vi.fn>
}

function setupHarness(initialSelection: SidebarSelection = { kind: 'filter', filter: 'all' }): Harness {
  const setToastMessage = vi.fn()
  const setSelection = vi.fn()
  const reloadVault = vi.fn().mockResolvedValue([])
  const reloadFolders = vi.fn().mockResolvedValue(undefined)
  const setTabs = vi.fn()
  const handleSwitchTab = vi.fn()
  const activeTabPathRef: React.MutableRefObject<string | null> = { current: null }
  const vaultPath = '/Users/biomatrix/vault'

  const { result } = renderHook(() =>
    useFolderRename({
      activeTabPathRef,
      handleSwitchTab,
      reloadFolders,
      reloadVault,
      selection: initialSelection,
      setSelection,
      setTabs,
      setToastMessage,
      vaultPath,
    }),
  )

  return { result, setToastMessage, setSelection, reloadVault, reloadFolders, setTabs, handleSwitchTab }
}

describe('useFolderRename', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with no folder being renamed', () => {
    const { result } = setupHarness()
    expect(result.current.renamingFolderPath).toBeNull()
  })

  it('startFolderRename sets the path; cancelFolderRename clears it', () => {
    const { result } = setupHarness()
    act(() => result.current.startFolderRename('notes/2026'))
    expect(result.current.renamingFolderPath).toBe('notes/2026')
    act(() => result.current.cancelFolderRename())
    expect(result.current.renamingFolderPath).toBeNull()
  })

  it('renameFolder no-ops and returns true when the new name matches the current label', async () => {
    const { result } = setupHarness()
    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.renameFolder('notes/2026', '2026')
    })
    expect(returnValue).toBe(true)
    expect(result.current.renamingFolderPath).toBeNull()
  })

  it('renameFolder surfaces an error toast and returns false when the invoke rejects', async () => {
    const { result, setToastMessage, reloadFolders } = setupHarness()
    reloadFolders.mockRejectedValueOnce(new Error('disk full'))
    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.renameFolder('notes/2026', '2027')
    })
    expect(returnValue).toBe(false)
    expect(setToastMessage).toHaveBeenCalledWith(expect.stringContaining('Failed to rename folder'))
  })

  it('renameSelectedFolder no-ops when the selection is not a folder', () => {
    const { result } = setupHarness({ kind: 'filter', filter: 'all' })
    act(() => result.current.renameSelectedFolder())
    expect(result.current.renamingFolderPath).toBeNull()
  })

  it('renameSelectedFolder no-ops when the folder path is empty', () => {
    const { result } = setupHarness({ kind: 'folder', path: '' })
    act(() => result.current.renameSelectedFolder())
    expect(result.current.renamingFolderPath).toBeNull()
  })

  it('renameSelectedFolder starts a rename when the selection is a real folder', () => {
    const { result } = setupHarness({ kind: 'folder', path: 'notes/2026' })
    act(() => result.current.renameSelectedFolder())
    expect(result.current.renamingFolderPath).toBe('notes/2026')
  })
})
