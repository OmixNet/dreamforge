import { describe, expect, it, vi } from 'vitest'
import {
  clearDeletedFolderTabs,
  folderAbsolutePath,
  folderLabel,
  isWithinPrefix,
  replaceFolderPrefix,
  replaceRelativeFolderPrefix,
  resetSelectionIfFolderDeleted,
  updateSelectionAfterFolderRename,
  updateTabsAfterFolderRename,
  type FolderRenameResult,
} from './folderActionUtils'
import type { SidebarSelection, VaultEntry } from '../../types'

/**
 * v0.3 PR 12.2: folderActionUtils branch coverage.
 * Covers the pure prefix/label helpers plus the selection / tab / clear
 * update functions. The Tauri invoke paths are exercised via the
 * mock-handlers (non-Tauri test mode) — see useFolderDelete / useFolderRename
 * tests for the invoke surface.
 */

const vaultPath = '/Users/biomatrix/vault'

describe('folderActionUtils', () => {
  describe('folderLabel', () => {
    it('returns the last non-empty segment of the folder path', () => {
      expect(folderLabel({ folderPath: 'notes/projects/2026' })).toBe('2026')
      expect(folderLabel({ folderPath: 'wiki//double-slash' })).toBe('double-slash')
    })

    it('falls back to the original path when there are no segments', () => {
      expect(folderLabel({ folderPath: '' })).toBe('')
      expect(folderLabel({ folderPath: '/' })).toBe('/')
    })
  })

  describe('folderAbsolutePath', () => {
    it('joins vault and folder paths with a single slash', () => {
      expect(
        folderAbsolutePath({ vaultPath, folderPath: 'notes' }),
      ).toBe('/Users/biomatrix/vault/notes')
    })

    it('strips a trailing slash from the vault path', () => {
      expect(
        folderAbsolutePath({ vaultPath: '/Users/biomatrix/vault/', folderPath: 'notes' }),
      ).toBe('/Users/biomatrix/vault/notes')
    })

    it('strips leading slashes from the folder path', () => {
      expect(
        folderAbsolutePath({ vaultPath, folderPath: '//nested//deeper' }),
      ).toBe('/Users/biomatrix/vault/nested//deeper')
    })

    it('returns just the vault path when folderPath is empty', () => {
      expect(folderAbsolutePath({ vaultPath, folderPath: '' })).toBe(vaultPath)
      expect(folderAbsolutePath({ vaultPath, folderPath: '/' })).toBe(vaultPath)
    })
  })

  describe('isWithinPrefix', () => {
    it('returns true when the path equals the prefix or starts with prefix/', () => {
      expect(isWithinPrefix({ path: '/a/b', prefix: '/a' })).toBe(true)
      expect(isWithinPrefix({ path: '/a/b/c', prefix: '/a' })).toBe(true)
      expect(isWithinPrefix({ path: '/a', prefix: '/a' })).toBe(true)
    })

    it('returns false when the prefix is not a true path segment match', () => {
      // "/ab" should not match prefix "/a" — needs a trailing slash.
      expect(isWithinPrefix({ path: '/ab', prefix: '/a' })).toBe(false)
      expect(isWithinPrefix({ path: '/other', prefix: '/a' })).toBe(false)
    })
  })

  describe('replaceFolderPrefix', () => {
    it('rewrites matching paths to the new prefix', () => {
      expect(
        replaceFolderPrefix({
          path: '/a/b/c.md',
          oldPrefix: '/a',
          newPrefix: '/A',
        }),
      ).toBe('/A/b/c.md')
    })

    it('returns the original path when the prefix is not present', () => {
      expect(
        replaceFolderPrefix({
          path: '/other/x.md',
          oldPrefix: '/a',
          newPrefix: '/A',
        }),
      ).toBe('/other/x.md')
    })
  })

  describe('replaceRelativeFolderPrefix', () => {
    it('rewrites the relative path when the prefix matches', () => {
      expect(
        replaceRelativeFolderPrefix({
          path: 'notes/2026/index.md',
          oldPrefix: 'notes/2026',
          newPrefix: 'notes/2027',
        }),
      ).toBe('notes/2027/index.md')
    })

    it('returns the path unchanged when the prefix is absent', () => {
      expect(
        replaceRelativeFolderPrefix({
          path: 'wiki/index.md',
          oldPrefix: 'notes/2026',
          newPrefix: 'notes/2027',
        }),
      ).toBe('wiki/index.md')
    })
  })

  describe('clearDeletedFolderTabs', () => {
    const setTabs = vi.fn()
    const closeAllTabs = vi.fn()
    const activeTabPathRef: React.MutableRefObject<string | null> = { current: null }

    beforeEach(() => {
      setTabs.mockClear()
      closeAllTabs.mockClear()
      activeTabPathRef.current = null
    })

    it('closes all tabs when the active tab sits inside the deleted folder', () => {
      activeTabPathRef.current = `${vaultPath}/notes/2026/active.md`
      clearDeletedFolderTabs({
        activeTabPathRef,
        closeAllTabs,
        folderPath: 'notes/2026',
        setTabs,
        vaultPath,
      })
      expect(closeAllTabs).toHaveBeenCalledTimes(1)
      expect(setTabs).not.toHaveBeenCalled()
    })

    it('filters tabs whose entries live under the deleted folder prefix', () => {
      activeTabPathRef.current = `${vaultPath}/wiki/index.md`
      clearDeletedFolderTabs({
        activeTabPathRef,
        closeAllTabs,
        folderPath: 'notes/2026',
        setTabs,
        vaultPath,
      })
      expect(closeAllTabs).not.toHaveBeenCalled()
      expect(setTabs).toHaveBeenCalledTimes(1)
      const updater = setTabs.mock.calls[0][0] as (current: { entry: { path: string } }[]) => unknown
      const next = updater([
        { entry: { path: `${vaultPath}/notes/2026/x.md` } },
        { entry: { path: `${vaultPath}/notes/2026/sub/y.md` } },
        { entry: { path: `${vaultPath}/wiki/index.md` } },
      ])
      expect(next).toEqual([{ entry: { path: `${vaultPath}/wiki/index.md` } }])
    })
  })

  describe('updateSelectionAfterFolderRename', () => {
    const setSelection = vi.fn()
    const selection: SidebarSelection = { kind: 'filter', filter: 'all' }
    const renameResult: FolderRenameResult = {
      old_path: 'notes/2026',
      new_path: 'notes/2027',
    }

    beforeEach(() => {
      setSelection.mockClear()
    })

    it('returns early when selection is not folder and not entity', () => {
      updateSelectionAfterFolderRename({
        refreshedEntries: [],
        renameResult,
        selection,
        setSelection,
        vaultPath,
      })
      expect(setSelection).not.toHaveBeenCalled()
    })

    it('rewrites the folder selection prefix when the renamed folder is selected', () => {
      updateSelectionAfterFolderRename({
        refreshedEntries: [],
        renameResult,
        selection: { kind: 'folder', path: 'notes/2026/sub' },
        setSelection,
        vaultPath,
      })
      expect(setSelection).toHaveBeenCalledWith({
        kind: 'folder',
        path: 'notes/2027/sub',
      })
    })

    it('does not touch a folder selection that lives outside the renamed prefix', () => {
      updateSelectionAfterFolderRename({
        refreshedEntries: [],
        renameResult,
        selection: { kind: 'folder', path: 'wiki/2026' },
        setSelection,
        vaultPath,
      })
      expect(setSelection).not.toHaveBeenCalled()
    })

    it('updates an entity selection to the renamed entry when present in refreshedEntries', () => {
      const entry: VaultEntry = {
        path: `${vaultPath}/notes/2027/x.md`,
        filename: 'x.md',
        title: 'x',
        isA: null,
        aliases: [],
        belongsTo: [],
        relatedTo: [],
        status: null,
        archived: false,
        trashed: false,
        trashedAt: null,
        modifiedAt: 0,
        createdAt: 0,
        fileSize: 0,
        snippet: '',
        wordCount: 0,
        relationships: {},
        icon: null,
        color: null,
        order: null,
        sidebarLabel: null,
        template: null,
        sort: null,
        view: null,
        visible: true,
        outgoingLinks: [],
        properties: {},
      }
      updateSelectionAfterFolderRename({
        refreshedEntries: [entry],
        renameResult,
        selection: {
          kind: 'entity',
          entry: { ...entry, path: `${vaultPath}/notes/2026/x.md` },
        },
        setSelection,
        vaultPath,
      })
      expect(setSelection).toHaveBeenCalledWith({ kind: 'entity', entry })
    })

    it('falls back to DEFAULT_SELECTION when the renamed entry is missing', () => {
      updateSelectionAfterFolderRename({
        refreshedEntries: [],
        renameResult,
        selection: {
          kind: 'entity',
          entry: {
            path: `${vaultPath}/notes/2026/missing.md`,
            filename: 'missing.md',
            title: 'missing',
            isA: null,
            aliases: [],
            belongsTo: [],
            relatedTo: [],
            status: null,
            archived: false,
            trashed: false,
            trashedAt: null,
            modifiedAt: 0,
            createdAt: 0,
            fileSize: 0,
            snippet: '',
            wordCount: 0,
            relationships: {},
            icon: null,
            color: null,
            order: null,
            sidebarLabel: null,
            template: null,
            sort: null,
            view: null,
            visible: true,
            outgoingLinks: [],
            properties: {},
          },
        },
        setSelection,
        vaultPath,
      })
      expect(setSelection).toHaveBeenCalledWith({ kind: 'filter', filter: 'all' })
    })
  })

  describe('updateTabsAfterFolderRename', () => {
    const setTabs = vi.fn()
    const handleSwitchTab = vi.fn()
    const activeTabPathRef: React.MutableRefObject<string | null> = { current: null }
    const renameResult: FolderRenameResult = {
      old_path: 'notes/2026',
      new_path: 'notes/2027',
    }

    beforeEach(() => {
      setTabs.mockClear()
      handleSwitchTab.mockClear()
      activeTabPathRef.current = null
    })

    it('rewrites matching tab entry paths and switches the active tab if it is in the folder', () => {
      activeTabPathRef.current = `${vaultPath}/notes/2026/active.md`
      updateTabsAfterFolderRename({
        activeTabPathRef,
        handleSwitchTab,
        refreshedEntries: [],
        renameResult,
        setTabs,
        vaultPath,
      })
      const updater = setTabs.mock.calls[0][0] as (current: { entry: { path: string } }[]) => unknown
      const next = updater([{ entry: { path: `${vaultPath}/notes/2026/x.md` } }])
      expect(next).toEqual([{ entry: { path: `${vaultPath}/notes/2027/x.md` } }])
      expect(handleSwitchTab).toHaveBeenCalledWith(`${vaultPath}/notes/2027/active.md`)
    })

    it('keeps tabs that live outside the renamed prefix unchanged', () => {
      activeTabPathRef.current = `${vaultPath}/wiki/index.md`
      updateTabsAfterFolderRename({
        activeTabPathRef,
        handleSwitchTab,
        refreshedEntries: [],
        renameResult,
        setTabs,
        vaultPath,
      })
      const updater = setTabs.mock.calls[0][0] as (current: { entry: { path: string } }[]) => unknown
      const next = updater([{ entry: { path: `${vaultPath}/wiki/index.md` } }])
      expect(next).toEqual([{ entry: { path: `${vaultPath}/wiki/index.md` } }])
      expect(handleSwitchTab).not.toHaveBeenCalled()
    })

    it('returns early when the active tab path is null', () => {
      activeTabPathRef.current = null
      updateTabsAfterFolderRename({
        activeTabPathRef,
        handleSwitchTab,
        refreshedEntries: [],
        renameResult,
        setTabs,
        vaultPath,
      })
      expect(setTabs).toHaveBeenCalledTimes(1)
      expect(handleSwitchTab).not.toHaveBeenCalled()
    })
  })

  describe('resetSelectionIfFolderDeleted', () => {
    const setSelection = vi.fn()
    const _selection: SidebarSelection = { kind: 'filter', filter: 'all' }

    beforeEach(() => {
      setSelection.mockClear()
    })

    it('falls back to DEFAULT_SELECTION when the selected folder is the deleted one', () => {
      resetSelectionIfFolderDeleted({
        folderPath: 'notes/2026',
        refreshedEntries: [],
        selection: { kind: 'folder', path: 'notes/2026' },
        setSelection,
        vaultPath,
      })
      expect(setSelection).toHaveBeenCalledWith({ kind: 'filter', filter: 'all' })
    })

    it('returns early when the selected folder is unrelated to the deletion', () => {
      resetSelectionIfFolderDeleted({
        folderPath: 'notes/2026',
        refreshedEntries: [],
        selection: { kind: 'folder', path: 'wiki/2026' },
        setSelection,
        vaultPath,
      })
      expect(setSelection).not.toHaveBeenCalled()
    })

    it('keeps the entity selection when it lives outside the deleted folder', () => {
      const entry: VaultEntry = {
        path: `${vaultPath}/wiki/index.md`,
        filename: 'index.md',
        title: 'index',
        isA: null,
        aliases: [],
        belongsTo: [],
        relatedTo: [],
        status: null,
        archived: false,
        trashed: false,
        trashedAt: null,
        modifiedAt: 0,
        createdAt: 0,
        fileSize: 0,
        snippet: '',
        wordCount: 0,
        relationships: {},
        icon: null,
        color: null,
        order: null,
        sidebarLabel: null,
        template: null,
        sort: null,
        view: null,
        visible: true,
        outgoingLinks: [],
        properties: {},
      }
      resetSelectionIfFolderDeleted({
        folderPath: 'notes/2026',
        refreshedEntries: [entry],
        selection: { kind: 'entity', entry },
        setSelection,
        vaultPath,
      })
      // The entry is unrelated to the deleted folder — no setSelection call expected.
      expect(setSelection).not.toHaveBeenCalled()
    })

    it('falls back when the entity entry was inside the deleted folder', () => {
      const deletedEntry: VaultEntry = {
        path: `${vaultPath}/notes/2026/x.md`,
        filename: 'x.md',
        title: 'x',
        isA: null,
        aliases: [],
        belongsTo: [],
        relatedTo: [],
        status: null,
        archived: false,
        trashed: false,
        trashedAt: null,
        modifiedAt: 0,
        createdAt: 0,
        fileSize: 0,
        snippet: '',
        wordCount: 0,
        relationships: {},
        icon: null,
        color: null,
        order: null,
        sidebarLabel: null,
        template: null,
        sort: null,
        view: null,
        visible: true,
        outgoingLinks: [],
        properties: {},
      }
      resetSelectionIfFolderDeleted({
        folderPath: 'notes/2026',
        refreshedEntries: [],
        selection: { kind: 'entity', entry: deletedEntry },
        setSelection,
        vaultPath,
      })
      expect(setSelection).toHaveBeenCalledWith({ kind: 'filter', filter: 'all' })
    })
  })
})
