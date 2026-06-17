import type { SidebarSelection } from '../types'

export type SlimFolderId = 'notes' | 'wiki' | 'memory' | 'raw' | 'archive'

export const SLIM_FOLDERS: ReadonlyArray<{
  id: SlimFolderId
  label: string
  icon: string
  /** Read-only folders get a muted visual treatment and a tooltip. */
  readOnly?: boolean
}> = [
  { id: 'notes', label: 'Notes', icon: 'N' },
  { id: 'wiki', label: 'Wiki', icon: 'W' },
  { id: 'memory', label: 'Memory', icon: 'M' },
  { id: 'raw', label: 'Raw', icon: 'R', readOnly: true },
  { id: 'archive', label: 'Archive', icon: 'A' },
]

export function isSlimFolderId(value: unknown): value is SlimFolderId {
  return value === 'notes' || value === 'wiki' || value === 'memory' || value === 'raw' || value === 'archive'
}

export function sidebarSelectionForSlimFolder(vaultPath: string, folder: SlimFolderId): SidebarSelection {
  if (folder === 'memory') {
    return { kind: 'folder', path: '', rootPath: vaultPath }
  }

  return { kind: 'folder', path: folder, rootPath: vaultPath }
}
