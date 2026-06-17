import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SidebarSelection, VaultEntry } from '../../types'
import { useFilterCounts } from './useNoteListModel'

function entry(overrides: Partial<VaultEntry> & { path: string }): VaultEntry {
  return {
    path: overrides.path,
    name: overrides.path.split('/').at(-1) ?? overrides.path,
    isDirectory: false,
    fileKind: 'markdown',
    archived: false,
    ...overrides,
  }
}

describe('useFilterCounts — Slim folder selection (PR 9.5 absolute paths)', () => {
  // DREAMFORGE_SLIM: VaultEntry.path 是 absolute (Rust 端 root.join(relative)),
  // useFilterCounts 用 pathRelativeToRoot + isInFolder 复用 (跟 filterFolderEntries 一致)
  const rootPath = '/Users/biomatrix/Desktop/APP/dreamforge-test-vault'
  const entries: VaultEntry[] = [
    entry({ path: `${rootPath}/notes/hello.md` }),
    entry({ path: `${rootPath}/raw/source1.md` }),
    entry({ path: `${rootPath}/MEMORY.md` }),
    entry({ path: `${rootPath}/archive/old.md`, archived: true }),
  ]

  const cases: Array<{ selection: SidebarSelection; expectedOpen: number; expectedArchived: number }> = [
    { selection: { kind: 'folder', path: 'notes', rootPath }, expectedOpen: 1, expectedArchived: 0 },
    { selection: { kind: 'folder', path: 'wiki', rootPath }, expectedOpen: 0, expectedArchived: 0 },
    { selection: { kind: 'folder', path: 'raw', rootPath }, expectedOpen: 1, expectedArchived: 0 },
    { selection: { kind: 'folder', path: 'archive', rootPath }, expectedOpen: 0, expectedArchived: 1 },
    { selection: { kind: 'folder', path: '', rootPath }, expectedOpen: 1, expectedArchived: 0 },
  ]

  for (const { selection, expectedOpen, expectedArchived } of cases) {
    it(`counts slim folder ${JSON.stringify(selection.path || 'memory')} → open=${expectedOpen} archived=${expectedArchived}`, () => {
      const { result } = renderHook(() => useFilterCounts(entries, selection))
      expect(result.current).toEqual({ open: expectedOpen, archived: expectedArchived })
    })
  }
})
