import type { AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'
// DREAMFORGE_SLIM: SLIM_FOLDERS + isSlimFolderId + SlimFolderId type 物理移到 slimSelection.ts (PR 8, fix fast-refresh)
import { SLIM_FOLDERS, type SlimFolderId } from '../utils/slimSelection'

/**
 * Slim mode sidebar — replaces the type-based Tolaria Sidebar with a flat list
 * of 5 fixed entries (Notes / Wiki / Memory / Raw / Archive) keyed to the
 * DreamForge vault layout. The selection model is intentionally tiny:
 *   - `null`              → no folder selected (caller decides what to show)
 *   - `'notes' | ...`     → that folder is the active one
 *
 * Filtering the NoteList by the selected folder is the App layer's job (it
 * owns the existing `SidebarSelection` state machine). This component only
 * reports which entry was clicked.
 */

interface SlimSidebarProps {
  vaultPath: string
  entries: VaultEntry[]
  selection: SlimFolderId | null
  onSelect: (folder: SlimFolderId) => void
  locale?: AppLocale
}

function countEntriesInFolder(vaultPath: string, entries: VaultEntry[], folder: SlimFolderId): number {
  if (folder === 'memory') {
    const memoryPath = `${vaultPath}/MEMORY.md`
    return entries.some((entry) => entry.path === memoryPath) ? 1 : 0
  }
  const prefix = `${vaultPath}/${folder}/`
  return entries.filter((entry) => entry.path.startsWith(prefix)).length
}

export function SlimSidebar({ vaultPath, entries, selection, onSelect, locale }: SlimSidebarProps) {
  return (
    <nav
      className="dreamx-sidebar flex h-full min-h-0 flex-col gap-1 overflow-y-auto px-2 py-3"
      aria-label="Slim sidebar"
      data-testid="slim-sidebar"
      data-locale={locale ?? 'default'}
    >
      <header className="dreamx-sidebar__brand">
        <span className="dreamx-sidebar__mark" aria-hidden="true" />
        <span className="min-w-0">
          <span className="dreamx-sidebar__title block truncate">DreamX</span>
          <span className="dreamx-sidebar__subtitle block truncate">Vault</span>
        </span>
      </header>
      {SLIM_FOLDERS.map((folder) => {
        const isActive = selection === folder.id
        const count = countEntriesInFolder(vaultPath, entries, folder.id)
        return (
          <button
            key={folder.id}
            type="button"
            onClick={() => onSelect(folder.id)}
            data-testid={`slim-sidebar-${folder.id}`}
            title={folder.readOnly ? `${folder.label} is read-only — engine writes here via the Dream CLI` : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={`dreamx-sidebar__item ${folder.readOnly ? 'opacity-70' : ''} ${
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span
              aria-hidden="true"
              className="dreamx-sidebar__glyph"
            >
              {folder.icon}
            </span>
            <span className="flex-1 truncate">{folder.label}</span>
            <span className="dreamx-sidebar__count">{count}</span>
          </button>
        )
      })}
    </nav>
  )
}
