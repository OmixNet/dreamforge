import { describe, expect, it } from 'vitest'
import { sidebarSelectionForSlimFolder } from './slimSelection'

describe('sidebarSelectionForSlimFolder', () => {
  it('maps normal slim folders to folder selections under the vault root', () => {
    expect(sidebarSelectionForSlimFolder('/vault', 'wiki')).toEqual({
      kind: 'folder',
      path: 'wiki',
      rootPath: '/vault',
    })
  })

  it('maps memory to the vault root so MEMORY.md is visible', () => {
    expect(sidebarSelectionForSlimFolder('/vault', 'memory')).toEqual({
      kind: 'folder',
      path: '',
      rootPath: '/vault',
    })
  })
})
