import { useRef, useEffect, useCallback, memo, useState, type ReactNode } from 'react'
import { useEditorTabSwap } from '../hooks/useEditorTabSwap'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'
// DREAMFORGE_SLIM: katex CSS import 物理删除 (PR 8, katex dep 删, mathMarkdown stub 化)
import { uploadImageFile } from '../hooks/useImageDrop'
// DREAMFORGE_SLIM: DEFAULT_AI_AGENT + AiAgentId + AiAgentReadiness + AiTarget 物理删除 (PR 8, 12 AI module 全删)
import { translate, type AppLocale } from '../lib/i18n'
import { formatLastDreamRelative } from '../lib/dreamCliStatus'
import { RUNTIME_STYLE_NONCE } from '../lib/runtimeStyleNonce'
import type { VaultEntry, GitCommit, NoteWidthMode, NoteStatus, WorkspaceIdentity } from '../types'
import type { NoteListItem } from '../utils/ai-context'
import type { FrontmatterValue } from './Inspector'
import type { FrontmatterOpOptions } from '../hooks/frontmatterOps'
import { ResizeHandle } from './ResizeHandle'
import { useDiffMode, type CommitDiffRequest } from '../hooks/useDiffMode'
import { useEditorFocus } from '../hooks/useEditorFocus'
import { useDragRegion } from '../hooks/useDragRegion'
import { EditorRightPanel } from './EditorRightPanel'
import { EditorContent } from './EditorContent'
import { Button } from './ui/button'
import { EditorMemoryProbe } from './EditorMemoryProbe'
import { FilePreview } from './FilePreview'
import { schema } from './editorSchema'
import { useRightPanelExclusion } from './useRightPanelExclusion'
import type { RawEditorFindRequest } from './RawEditorFindBar'
import {
  applyPendingRawExitContent,
  resolvePendingRawExitContent,
  resolveRawModeContent,
} from './editorRawModeSync'
import { useRegisterEditorContentFlushes } from './editorContentFlushRegistration'
import { useRawModeWithFlush } from './useRawModeWithFlush'
import { createImeCompositionKeyGuardExtension } from './imeCompositionKeyGuardExtension'
import { handleRichEditorPaste } from './richEditorPaste'
import { createRichEditorMarkdownInputTransformExtension } from './richEditorInputTransformExtension'
import { createRichEditorTransformErrorRecoveryExtension } from './richEditorTransformErrorRecoveryExtension'
import { useFilenameAutolinkGuard } from './useFilenameAutolinkGuard'
import { useEditorPdfExport } from './useEditorPdfExport'
import type { NotePdfExportSource } from '../utils/notePdfExport'
import './Editor.css'
import './EditorTheme.css'

const RICH_EDITOR_BIDI_DOM_ATTRIBUTES = {
  blockContent: { dir: 'auto' },
  inlineContent: { dir: 'auto' },
}

interface Tab {
  entry: VaultEntry
  content: string
}

interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  isVaultLoading?: boolean
  entries: VaultEntry[]
  onNavigateWikilink: (target: string) => void
  onUnsupportedAiPaste?: (message: string) => void
  onLoadDiff?: (path: string) => Promise<string>
  onLoadDiffAtCommit?: (path: string, commitHash: string) => Promise<string>
  pendingCommitDiffRequest?: CommitDiffRequest | null
  onPendingCommitDiffHandled?: (requestId: number) => void
  getNoteStatus?: (path: string) => NoteStatus
  onCreateNote?: () => void
  inspectorCollapsed: boolean
  onToggleInspector: () => void
  inspectorWidth: number
  // DREAMFORGE_SLIM: 4 个 AI agent prop 物理删除 (PR 8)
  onInspectorResize: (delta: number) => void
  inspectorEntry: VaultEntry | null
  inspectorContent: string | null
  gitHistory: GitCommit[]
  onUpdateFrontmatter?: (path: string, key: string, value: FrontmatterValue, options?: FrontmatterOpOptions) => Promise<void>
  onDeleteProperty?: (path: string, key: string, options?: FrontmatterOpOptions) => Promise<void>
  onAddProperty?: (path: string, key: string, value: FrontmatterValue, options?: FrontmatterOpOptions) => Promise<void>
  onCreateMissingType?: (path: string, missingType: string, nextTypeName: string) => Promise<boolean | void>
  onCreateAndOpenNote?: (title: string) => Promise<boolean>
  onChangeWorkspace?: (entry: VaultEntry, workspace: WorkspaceIdentity) => Promise<void> | void
  onInitializeProperties?: (path: string) => void
  showAIChat?: boolean
  onToggleAIChat?: () => void
  aiWorkspaceSurface?: ReactNode
  vaultPath?: string
  vaultPaths?: string[]
  /** PR 42: counts for the empty workspace summary (Notes / Wiki / Memory / Raw). */
  workspaceCounts?: { notes: number; wiki: number; memory: number; raw: number }
  /** PR 42: jump to MEMORY.md from the empty workspace. */
  onOpenMemory?: () => void
  /** PR 42: focus + scroll the DreamPanel's Run Dream button. */
  onRunDream?: () => void
  /** PR 47: up to 3 quick-pick entries to surface in the empty state
   *  (latest note + latest raw + MEMORY.md). Parent computes this
   *  from the vault entries so the editor stays a pure renderer. */
  recentEntries?: VaultEntry[]
  /** PR 47: open an entry from the empty-state Recent quick-pick. */
  onOpenEntry?: (entry: VaultEntry) => void
  /** PR 48: ISO-8601 UTC timestamp of the last successful Dream run,
   *  parsed from `dream status` stdout. Null = never run (line is
   *  hidden, not "Last dream: never", per the no-landing-page
    *  invariant locked in PR 42/47). */
  lastDreamAt?: string | null
  /** PR 49: vault health derived from lastDreamAt + candidate count.
   *  Renders a small color-coded badge next to the counts line.
   *  'unknown' = no data → badge hides entirely. */
  vaultHealth?: 'healthy' | 'stale' | 'critical' | 'unknown'
  /** PR 50c: typed stats from the new dreamvault_status_json
   *  Tauri command. When both are present, the counts line shows
   *  the detailed format (X candidates · Y processed · Z archived).
   *  Absent either, falls back to the simple PR 47 format
   *  (X candidates only). */
  processedCount?: number
  archivedCount?: number
  noteList?: NoteListItem[]
  noteListFilter?: { type: string | null; query: string }
  onToggleFavorite?: (path: string) => void
  onToggleOrganized?: (path: string) => void
  onEnterNeighborhood?: (entry: VaultEntry) => void
  onRevealFile?: (path: string) => void
  onCopyFilePath?: (path: string) => void
  onCopyDeepLink?: (entry: VaultEntry) => void
  onCopyGitUrl?: (entry: VaultEntry) => void
  onOpenExternalFile?: (path: string) => void
  onDeleteNote?: (path: string) => void
  onArchiveNote?: (path: string) => void
  onUnarchiveNote?: (path: string) => void
  onContentChange?: (path: string, content: string) => void
  onSave?: () => void
  /** Called when the user explicitly renames the filename from the breadcrumb. */
  onRenameFilename?: (path: string, newFilenameStem: string) => void
  noteWidth?: NoteWidthMode
  onToggleNoteWidth?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onGoBack?: () => void
  onGoForward?: () => void
  leftPanelsCollapsed?: boolean
  /** Mutable ref that Editor registers its raw-mode toggle into, for command palette access. */
  rawToggleRef?: React.MutableRefObject<() => void>
  /** Mutable ref that Editor registers editor find commands into, for shortcuts and menus. */
  findInNoteRef?: React.MutableRefObject<((options?: { replace?: boolean }) => void) | null>
  /** Mutable ref that Editor registers its diff-mode toggle into, for command palette access. */
  diffToggleRef?: React.MutableRefObject<() => void>
  /** Mutable ref that Editor registers its table-of-contents toggle into, for app shortcuts and menus. */
  tableOfContentsToggleRef?: React.MutableRefObject<() => void>
  /** Mutable ref that Editor registers the PDF export command into, for command palette and native menu access. */
  pdfExportRef?: React.MutableRefObject<((source?: NotePdfExportSource) => void) | null>
  /** Emits short user-visible messages for editor actions. */
  onToast?: (message: string | null) => void
  onFileCreated?: (relativePath: string) => void
  onFileModified?: (relativePath: string) => void
  onVaultChanged?: () => void
  workspaces?: WorkspaceIdentity[]
  /** Whether the active note has a merge conflict. */
  isConflicted?: boolean
  /** Resolve conflict by keeping the local version. */
  onKeepMine?: (path: string) => void
  /** Resolve conflict by keeping the remote version. */
  onKeepTheirs?: (path: string) => void
  /** Registers a hook that flushes pending rich-editor changes into app state before external actions. */
  flushPendingEditorContentRef?: React.MutableRefObject<((path: string) => void) | null>
  /** Registers a hook that flushes the raw editor buffer into app state before external actions. */
  flushPendingRawContentRef?: React.MutableRefObject<((path: string) => void) | null>
  locale?: AppLocale
}

function useEditorModeExclusion({
  diffMode, rawMode, handleToggleDiff, handleToggleRaw, rawToggleRef, diffToggleRef,
}: {
  diffMode: boolean
  rawMode: boolean
  handleToggleDiff: () => void | Promise<void>
  handleToggleRaw: () => void
  rawToggleRef?: React.MutableRefObject<() => void>
  diffToggleRef?: React.MutableRefObject<() => void>
}) {
  const handleToggleDiffExclusive = useCallback(async () => {
    if (!diffMode && rawMode) handleToggleRaw()
    await handleToggleDiff()
  }, [diffMode, rawMode, handleToggleDiff, handleToggleRaw])

  const handleToggleRawExclusive = useCallback(() => {
    if (!rawMode && diffMode) handleToggleDiff()
    handleToggleRaw()
  }, [rawMode, diffMode, handleToggleDiff, handleToggleRaw])

  useEffect(() => {
    if (rawToggleRef) rawToggleRef.current = handleToggleRawExclusive
  }, [rawToggleRef, handleToggleRawExclusive])

  useEffect(() => {
    if (diffToggleRef) diffToggleRef.current = handleToggleDiffExclusive
  }, [diffToggleRef, handleToggleDiffExclusive])

  return { handleToggleDiffExclusive, handleToggleRawExclusive }
}

function EditorEmptyState({
  locale = 'en',
  vaultPath,
  workspaceCounts,
   recentEntries,
  onOpenEntry,
  lastDreamAt,
  vaultHealth,
  processedCount,
  archivedCount,
  onCreateNote,
  onOpenMemory,
  onRunDream,
}: {
  locale?: AppLocale
  vaultPath?: string
  workspaceCounts?: { notes: number; wiki: number; memory: number; raw: number }
  recentEntries?: VaultEntry[]
  onOpenEntry?: (entry: VaultEntry) => void
  lastDreamAt?: string | null
  vaultHealth?: 'healthy' | 'stale' | 'critical' | 'unknown'
  // PR 50c: typed stats from dreamvault_status_json
  processedCount?: number
  archivedCount?: number
  onCreateNote?: () => void
  onOpenMemory?: () => void
  onRunDream?: () => void
}) {
  const breadcrumbBarHeight = 52
  const { onMouseDown } = useDragRegion()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        data-tauri-drag-region
        data-testid="editor-empty-state-drag-region"
        className="shrink-0"
        onMouseDown={onMouseDown}
        style={{ height: breadcrumbBarHeight }}
      />
      {/* PR 42: empty workspace summary card — replaces the v0.5
          "Select a note" hint with a more actionable view that
          (a) shows the user where they are (vault path), (b) gives
          them a sense of the vault's contents (Notes / Wiki / Memory /
          Raw counts), and (c) offers 3 executable entry points so the
          first-run experience is "what do I click" instead of "where
          do I start". NOT a landing page or tutorial — just 3 buttons.

          PR 47: extend the "what do I click" affordance with up to
          3 recent quick-pick entries (latest note + latest raw +
          MEMORY.md). Computed and filtered by the parent (App.tsx)
          so this component stays a pure renderer. The Recent section
          hides itself when there's nothing to show — fresh install
          never displays a placeholder, preserving the no-landing-
          page invariant. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="space-y-2">
          <h2 className="m-0 text-base font-medium text-foreground">
            {translate(locale, 'editor.workspace.title')}
          </h2>
          {vaultPath ? (
            <p className="m-0 text-xs text-muted-foreground">
              {translate(locale, 'editor.workspace.vaultPath', { path: vaultPath })}
            </p>
          ) : null}
          {workspaceCounts ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {/* PR 50c: when typed stats (processed + archived) are
                    available, show the detailed format
                    "{candidates} · {processed} · {archived}". When
                    EITHER is missing (old dream binary, schemaVersion
                    mismatch, etc.) fall back to the simple PR 47
                    "notes · wiki · memory · candidates" format. The
                    fallback is silent — no error UI, no banner. */}
                {typeof processedCount === 'number' && typeof archivedCount === 'number'
                  ? translate(locale, 'editor.workspace.countsDetailed', {
                      candidates: workspaceCounts.raw,
                      processed: processedCount,
                      archived: archivedCount,
                    })
                  : translate(locale, 'editor.workspace.counts', {
                      notes: workspaceCounts.notes,
                      wiki: workspaceCounts.wiki,
                      memory: workspaceCounts.memory,
                      raw: workspaceCounts.raw,
                    })}
              </span>
              {/* PR 49: small color-coded health badge next to counts.
                  3 actionable states (green/amber/red). 'unknown' = no
                  data → badge hides, preserving the no-landing-page
                  invariant. The color is the primary signal; the label
                  is text-only (color-blind accessible). */}
              {vaultHealth && vaultHealth !== 'unknown' ? (
                <HealthBadge locale={locale} health={vaultHealth} />
              ) : null}
            </p>
          ) : null}
          {/* PR 48: "Last dream: X ago" line. Hidden when lastDreamAt
              is null/undefined (fresh install, never run) so we never
              display a "Last dream: never" placeholder that would
              violate the no-landing-page invariant locked in PR 42/47.
              The relative time is computed by the parent (App.tsx
              status poll) so the editor stays a pure renderer. */}
          {lastDreamAt ? (
            <p
              className="m-0 text-xs text-muted-foreground"
              data-testid="editor-empty-state-last-dream"
            >
              {translate(locale, 'editor.workspace.lastDream', {
                time: formatLastDreamRelative(lastDreamAt, undefined, locale),
              })}
            </p>
          ) : null}
          <p className="m-0 pt-1 text-xs text-muted-foreground">
            {translate(locale, 'editor.workspace.hint')}
          </p>
        </div>
        {/* PR 47: Recent quick-pick rows. Up to 3 entries, each
            clickable. The kind label (notes/raw/memory) renders
            before the filename to mirror the ProviderList PR 40
            pattern so the user can tell at a glance which section
            the entry belongs to. */}
        {recentEntries && recentEntries.length > 0 ? (
          <div
            className="w-full max-w-sm space-y-1"
            data-testid="editor-empty-state-recent"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {translate(locale, 'editor.workspace.recent')}
            </div>
                {recentEntries.map((entry) => {
                  const kind = recentEntryKind(entry)
                  return (
                    <button
                      type="button"
                      key={entry.path}
                      onClick={() => onOpenEntry?.(entry)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                    >
                      <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {kind}
                      </span>
                      <span className="truncate text-foreground">{entry.filename}</span>
                    </button>
                  )
                })}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onCreateNote ? (
            <Button type="button" size="sm" variant="default" onClick={() => onCreateNote()}>
              {translate(locale, 'editor.workspace.action.newNote')}
            </Button>
          ) : null}
          {onOpenMemory ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenMemory()}>
              {translate(locale, 'editor.workspace.action.openMemory')}
            </Button>
          ) : null}
          {onRunDream ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onRunDream()}>
              {translate(locale, 'editor.workspace.action.runDream')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// PR 49: vault health badge — small color-coded inline pill shown
// next to the empty-state counts line. Color is the primary signal;
// the label is text-only so it's accessible to color-blind users.
//   healthy  → green   (recent dream + low candidates)
//   stale    → amber   (one of the warning signals fired)
//   critical → red     (severe: very old dream OR very high candidates)
function HealthBadge({ locale, health }: { locale: AppLocale; health: 'healthy' | 'stale' | 'critical' }) {
  const colorClasses = {
    healthy: 'border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-300',
    stale: 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-300',
    critical: 'border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300',
  } as const
  return (
    <span
      role="status"
      data-testid="editor-empty-state-health-badge"
      data-health={health}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${colorClasses[health]}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
      />
      {translate(locale, `editor.workspace.health.${health}`)}
    </span>
  )
}

// PR 47: classify a recent entry for the empty-state quick-pick badge.
// Returns "MEMORY" / "RAW" / "NOTE" based on which subfolder the entry
// lives in. Filename check catches MEMORY.md (root file); the raw/ vs
// notes/ subfolder check disambiguates the two. Anything else is NOTE
// (a user-created root file) so the badge still has a label.
function recentEntryKind(entry: VaultEntry): 'MEMORY' | 'RAW' | 'NOTE' {
  if (entry.filename === 'MEMORY.md') return 'MEMORY'
  if (entry.path.includes('/raw/')) return 'RAW'
  return 'NOTE'
}

interface EditorSetupParams {
  tabs: Tab[]
  activeTabPath: string | null
  vaultPath?: string
  onContentChange?: (path: string, content: string) => void
  onLoadDiff?: (path: string) => Promise<string>
  onLoadDiffAtCommit?: (path: string, commitHash: string) => Promise<string>
  pendingCommitDiffRequest?: CommitDiffRequest | null
  onPendingCommitDiffHandled?: (requestId: number) => void
  getNoteStatus?: (path: string) => NoteStatus
  rawToggleRef?: React.MutableRefObject<() => void>
  diffToggleRef?: React.MutableRefObject<() => void>
}

function useEditorSetup({
  tabs, activeTabPath, vaultPath, onContentChange,
  onLoadDiff, onLoadDiffAtCommit, pendingCommitDiffRequest, onPendingCommitDiffHandled, getNoteStatus,
  rawToggleRef, diffToggleRef,
}: EditorSetupParams) {
  const vaultPathRef = useRef(vaultPath)
  const flushPendingEditorChangeRef = useRef<(() => boolean) | null>(null)
  useEffect(() => { vaultPathRef.current = vaultPath }, [vaultPath])

  const editor = useCreateBlockNote({
    schema,
    domAttributes: RICH_EDITOR_BIDI_DOM_ATTRIBUTES,
    uploadFile: (file: File) => uploadImageFile(file, vaultPathRef.current),
    pasteHandler: handleRichEditorPaste,
    _tiptapOptions: { injectNonce: RUNTIME_STYLE_NONCE },
    extensions: [
      createRichEditorTransformErrorRecoveryExtension(),
      createImeCompositionKeyGuardExtension(),
      createRichEditorMarkdownInputTransformExtension(),
    ],
  })
  useFilenameAutolinkGuard(editor)
  const activeTab = tabs.find((t) => t.entry.path === activeTabPath) ?? null
  const {
    rawMode,
    handleToggleRaw,
    rawLatestContentRef,
    pendingRawExitContent,
    setPendingRawExitContent,
    rawModeContentOverride,
  } = useRawModeWithFlush(
    editor,
    activeTabPath,
    activeTab?.content ?? null,
    onContentChange,
    vaultPath,
    flushPendingEditorChangeRef,
  )
  const tabsForEditorSwap = applyPendingRawExitContent(tabs, pendingRawExitContent)
  const rawModeContent = resolveRawModeContent({ activeTab, rawModeContentOverride })

  useEffect(() => {
    setPendingRawExitContent((current) => resolvePendingRawExitContent({
      activeTabPath,
      tabs,
      pendingRawExitContent: current,
    }))
  }, [activeTabPath, setPendingRawExitContent, tabs])

  const { handleEditorChange, flushPendingEditorChange, editorMountedRef } = useEditorTabSwap({
    tabs: tabsForEditorSwap, activeTabPath, editor, onContentChange, rawMode, vaultPath,
  })
  useEffect(() => {
    flushPendingEditorChangeRef.current = flushPendingEditorChange
    return () => {
      if (flushPendingEditorChangeRef.current === flushPendingEditorChange) {
        flushPendingEditorChangeRef.current = null
      }
    }
  }, [flushPendingEditorChange])
  useEditorFocus(editor, editorMountedRef)

  const { diffMode, diffContent, diffLoading, handleToggleDiff, handleViewCommitDiff } = useDiffMode({
    activeTabPath,
    onLoadDiff,
    onLoadDiffAtCommit,
    pendingCommitDiffRequest,
    onPendingCommitDiffHandled,
  })

  const { handleToggleDiffExclusive, handleToggleRawExclusive } = useEditorModeExclusion({
    diffMode, rawMode, handleToggleDiff, handleToggleRaw, rawToggleRef, diffToggleRef,
  })

  const isLoadingNewTab = activeTabPath !== null && !activeTab
  const activeStatus = activeTab ? getNoteStatus?.(activeTab.entry.path) ?? 'clean' : 'clean'
  const showDiffToggle = !!(activeTab && (diffMode || activeStatus === 'modified'))

  return {
    editor, activeTab, rawLatestContentRef, rawModeContent,
    rawMode, diffMode, diffContent, diffLoading,
    handleToggleDiffExclusive, handleToggleRawExclusive,
    handleEditorChange, flushPendingEditorChange, handleViewCommitDiff,
    isLoadingNewTab, activeStatus, showDiffToggle,
  }
}

function useEditorFindCommand({
  activeTab,
  findInNoteRef,
  handleToggleRawExclusive,
  rawMode,
}: {
  activeTab: Tab | null
  findInNoteRef?: EditorProps['findInNoteRef']
  handleToggleRawExclusive: () => void
  rawMode: boolean
}): RawEditorFindRequest | null {
  const [findRequest, setFindRequest] = useState<RawEditorFindRequest | null>(null)
  const handleFindInNote = useCallback((options: { replace?: boolean } = {}) => {
    if (!activeTab || activeTab.entry.fileKind === 'binary') return
    if (!rawMode) handleToggleRawExclusive()

    setFindRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      path: activeTab.entry.path,
      replace: options.replace === true,
    }))
  }, [activeTab, handleToggleRawExclusive, rawMode])

  useEffect(() => {
    if (!findInNoteRef) return

    findInNoteRef.current = handleFindInNote
    return () => {
      if (findInNoteRef.current === handleFindInNote) {
        findInNoteRef.current = null
      }
    }
  }, [findInNoteRef, handleFindInNote])

  return findRequest
}

function EditorLayout({
  tabs,
  activeTabPath,
  activeTab,
  isLoadingNewTab,
  isVaultLoading,
  entries,
  editor,
  diffMode,
  diffContent,
  diffLoading,
  handleToggleDiffExclusive,
  rawMode,
  handleToggleRawExclusive,
  onContentChange,
  // PR 42: empty workspace summary props (passed through from
  // buildEditorLayoutProps via ...props spread, then destructured
  // here so the JSX can reference them directly). vaultPath is
  // already destructured further down in this same list.
  workspaceCounts,
  onCreateNote,
  onOpenMemory,
  onRunDream,
   recentEntries,
  onOpenEntry,
  lastDreamAt,
  vaultHealth,
  processedCount,
  archivedCount,
  onSave,
  activeStatus,
  showDiffToggle,
  showAIChat,
  onToggleAIChat,
  aiWorkspaceSurface,
  showTableOfContents,
  onToggleTableOfContents,
  inspectorCollapsed,
  onToggleInspector,
  onNavigateWikilink,
  handleEditorChange,
  onToggleFavorite,
  onToggleOrganized,
  onEnterNeighborhood,
  onRevealFile,
  onCopyFilePath,
  onCopyDeepLink,
  onCopyGitUrl,
  onExportPdf,
  onOpenExternalFile,
  onDeleteNote,
  onArchiveNote,
  onUnarchiveNote,
  vaultPath,
  vaultPaths,
  rawModeContent,
  findRequest,
  rawLatestContentRef,
  onRenameFilename,
  noteWidth,
  onToggleNoteWidth,
  isConflicted,
  onKeepMine,
  onKeepTheirs,
  onInspectorResize,
  inspectorWidth,
  inspectorEntry,
  inspectorContent,
  gitHistory,
  noteList,
  noteListFilter,
  handleViewCommitDiff,
  onUpdateFrontmatter,
  onDeleteProperty,
  onAddProperty,
  onCreateMissingType,
  onCreateAndOpenNote,
  onChangeWorkspace,
  onInitializeProperties,
  onFileCreated,
  onFileModified,
  onVaultChanged,
  workspaces,
  onUnsupportedAiPaste,
  locale,
}: {
  tabs: Tab[]
  activeTabPath: string | null
  activeTab: Tab | null
  isLoadingNewTab: boolean
  isVaultLoading?: boolean
  entries: VaultEntry[]
  editor: ReturnType<typeof useCreateBlockNote>
  diffMode: boolean
  diffContent: string | null
  diffLoading: boolean
  handleToggleDiffExclusive: () => void | Promise<void>
  rawMode: boolean
  handleToggleRawExclusive: () => void
  onContentChange?: (path: string, content: string) => void
  onSave?: () => void
  activeStatus: NoteStatus
  showDiffToggle: boolean
  showAIChat?: boolean
  onToggleAIChat?: () => void
  aiWorkspaceSurface?: ReactNode
  showTableOfContents?: boolean
  onToggleTableOfContents?: () => void
  inspectorCollapsed: boolean
  onToggleInspector: () => void
  onNavigateWikilink: (target: string) => void
  handleEditorChange: () => void
  onToggleFavorite?: (path: string) => void
  onToggleOrganized?: (path: string) => void
  onEnterNeighborhood?: (entry: VaultEntry) => void
  onRevealFile?: (path: string) => void
  onCopyFilePath?: (path: string) => void
  onCopyDeepLink?: (entry: VaultEntry) => void
  onCopyGitUrl?: (entry: VaultEntry) => void
  onOpenExternalFile?: (path: string) => void
  onDeleteNote?: (path: string) => void
  onArchiveNote?: (path: string) => void
  onUnarchiveNote?: (path: string) => void
  vaultPath?: string
  vaultPaths?: string[]
  rawModeContent: string | null
  findRequest?: RawEditorFindRequest | null
  // PR 42: empty workspace summary props
  workspaceCounts?: { notes: number; wiki: number; memory: number; raw: number }
  onCreateNote?: () => void
  onOpenMemory?: () => void
  onRunDream?: () => void
  // PR 47: Recent quick-pick entries + click handler
  recentEntries?: VaultEntry[]
  onOpenEntry?: (entry: VaultEntry) => void
  // PR 48: ISO timestamp of last successful Dream run (or null)
  lastDreamAt?: string | null
  // PR 49: vault health (color-coded badge next to counts)
  vaultHealth?: 'healthy' | 'stale' | 'critical' | 'unknown'
  // PR 50c: typed stats (processed + archived counts)
  processedCount?: number
  archivedCount?: number
  rawLatestContentRef: React.MutableRefObject<string | null>
  onRenameFilename?: (path: string, newFilenameStem: string) => void
  noteWidth?: NoteWidthMode
  onToggleNoteWidth?: () => void
  isConflicted?: boolean
  onKeepMine?: (path: string) => void
  onKeepTheirs?: (path: string) => void
  onInspectorResize: (delta: number) => void
  inspectorWidth: number
  // DREAMFORGE_SLIM: 4 个 AI agent field 物理删除 (PR 8, App.tsx 4 个 defaultAiAgent* prop 删)
  inspectorEntry: VaultEntry | null
  inspectorContent: string | null
  gitHistory: GitCommit[]
  noteList?: NoteListItem[]
  noteListFilter?: { type: string | null; query: string }
  handleViewCommitDiff: (commitHash: string) => Promise<void>
  onUpdateFrontmatter?: (path: string, key: string, value: FrontmatterValue, options?: FrontmatterOpOptions) => Promise<void>
  onDeleteProperty?: (path: string, key: string, options?: FrontmatterOpOptions) => Promise<void>
  onAddProperty?: (path: string, key: string, value: FrontmatterValue, options?: FrontmatterOpOptions) => Promise<void>
  onCreateMissingType?: (path: string, missingType: string, nextTypeName: string) => Promise<boolean | void>
  onCreateAndOpenNote?: (title: string) => Promise<boolean>
  onChangeWorkspace?: (entry: VaultEntry, workspace: WorkspaceIdentity) => Promise<void> | void
  onInitializeProperties?: (path: string) => void
  onFileCreated?: (relativePath: string) => void
  onFileModified?: (relativePath: string) => void
  onVaultChanged?: () => void
  workspaces?: WorkspaceIdentity[]
  onUnsupportedAiPaste?: (message: string) => void
  locale?: AppLocale
  onExportPdf?: (source?: NotePdfExportSource) => void
}) {
  const activeBinaryTab = activeTab?.entry.fileKind === 'binary' ? activeTab : null
  const showEmptyState = tabs.length === 0 && activeTabPath === null && !isVaultLoading

  return (
    <div className="editor flex flex-col min-h-0 overflow-hidden bg-background text-foreground">
      <div className="relative flex flex-1 min-h-0">
        {showEmptyState
          ? <EditorEmptyState
              locale={locale}
              vaultPath={vaultPath}
              workspaceCounts={workspaceCounts}
              recentEntries={recentEntries}
              onOpenEntry={onOpenEntry}
              lastDreamAt={lastDreamAt}
              vaultHealth={vaultHealth}
              processedCount={processedCount}
              archivedCount={archivedCount}
              onCreateNote={onCreateNote}
              onOpenMemory={onOpenMemory}
              onRunDream={onRunDream}
            />
          : activeBinaryTab
            ? (
                <FilePreview
                  key={activeBinaryTab.entry.path}
                  entry={activeBinaryTab.entry}
                  locale={locale}
                  onCopyFilePath={onCopyFilePath}
                  onCopyDeepLink={onCopyDeepLink}
                  onOpenExternalFile={onOpenExternalFile}
                  onRevealFile={onRevealFile}
                />
              )
            : <EditorContent
              activeTab={activeTab}
              activeTabPath={activeTabPath}
              isLoadingNewTab={isLoadingNewTab}
              isVaultLoading={isVaultLoading}
              entries={entries}
              editor={editor}
              diffMode={diffMode}
              diffContent={diffContent}
              diffLoading={diffLoading}
              onToggleDiff={handleToggleDiffExclusive}
              rawMode={rawMode}
              onToggleRaw={handleToggleRawExclusive}
              onRawContentChange={onContentChange}
              onSave={onSave}
              activeStatus={activeStatus}
              showDiffToggle={showDiffToggle}
              showAIChat={showAIChat}
              onToggleAIChat={onToggleAIChat}
              showTableOfContents={showTableOfContents}
              onToggleTableOfContents={onToggleTableOfContents}
              inspectorCollapsed={inspectorCollapsed}
              onToggleInspector={onToggleInspector}
              onNavigateWikilink={onNavigateWikilink}
              onEditorChange={handleEditorChange}
              onToggleFavorite={onToggleFavorite}
              onToggleOrganized={onToggleOrganized}
              onEnterNeighborhood={onEnterNeighborhood}
              onRevealFile={onRevealFile}
              onCopyFilePath={onCopyFilePath}
              onCopyDeepLink={onCopyDeepLink}
              onCopyGitUrl={onCopyGitUrl}
              onExportPdf={() => onExportPdf?.('breadcrumb')}
              onDeleteNote={onDeleteNote}
              onArchiveNote={onArchiveNote}
              onUnarchiveNote={onUnarchiveNote}
              vaultPath={vaultPath}
              rawModeContent={rawModeContent}
              findRequest={findRequest}
              rawLatestContentRef={rawLatestContentRef}
              onRenameFilename={onRenameFilename}
              noteWidth={noteWidth}
              onToggleNoteWidth={onToggleNoteWidth}
              isConflicted={isConflicted}
              onKeepMine={onKeepMine}
              onKeepTheirs={onKeepTheirs}
              locale={locale}
            />
        }
        {(showTableOfContents || !inspectorCollapsed) && <ResizeHandle onResize={onInspectorResize} />}
        <EditorRightPanel
          showAIChat={false}
          showTableOfContents={showTableOfContents}
          inspectorCollapsed={inspectorCollapsed}
          inspectorWidth={inspectorWidth}
          editor={editor}
          // DREAMFORGE_SLIM: 4 个 AI agent prop 物理删除 (PR 8)
          onUnsupportedAiPaste={onUnsupportedAiPaste}
          inspectorEntry={inspectorEntry}
          inspectorContent={inspectorContent}
          entries={entries}
          gitHistory={gitHistory}
          vaultPath={vaultPath ?? ''}
          vaultPaths={vaultPaths}
          noteList={noteList}
          noteListFilter={noteListFilter}
          onToggleInspector={onToggleInspector}
          onToggleAIChat={onToggleAIChat}
          onToggleTableOfContents={onToggleTableOfContents}
          onNavigateWikilink={onNavigateWikilink}
          onViewCommitDiff={handleViewCommitDiff}
          onUpdateFrontmatter={onUpdateFrontmatter}
          onDeleteProperty={onDeleteProperty}
          onAddProperty={onAddProperty}
          onCreateMissingType={onCreateMissingType}
          onCreateAndOpenNote={onCreateAndOpenNote}
          onChangeWorkspace={onChangeWorkspace}
          onInitializeProperties={onInitializeProperties}
          onToggleRawEditor={handleToggleRawExclusive}
          onOpenNote={onNavigateWikilink}
          onFileCreated={onFileCreated}
          onFileModified={onFileModified}
          onVaultChanged={onVaultChanged}
          workspaces={workspaces}
          locale={locale}
        />
        {showAIChat && aiWorkspaceSurface}
      </div>
      <EditorMemoryProbe entries={entries} vaultPath={vaultPath} locale={locale} />
    </div>
  )
}

type EditorRuntime = ReturnType<typeof useEditorSetup>
// PR 42: EditorLayoutProps = EditorProps (the full props shape) +
// runtime fields, plus findRequest (which buildEditorLayoutProps
// passes explicitly but is not in EditorProps).
type EditorLayoutProps = EditorProps & EditorRuntime & {
  findRequest: RawEditorFindRequest | null
}

function buildEditorLayoutProps(
  props: EditorProps,
  runtime: EditorRuntime,
  findRequest: RawEditorFindRequest | null,
): EditorLayoutProps {
  return {
    ...props,
    ...runtime,
    activeTabPath: props.activeTabPath,
    // DREAMFORGE_SLIM: 2 个 AI agent build prop 物理删除 (PR 8)
    findRequest,
  }
}

export const Editor = memo(function Editor(props: EditorProps) {
  const runtime = useEditorSetup({
    tabs: props.tabs,
    activeTabPath: props.activeTabPath,
    vaultPath: props.vaultPath,
    onContentChange: props.onContentChange,
    onLoadDiff: props.onLoadDiff,
    onLoadDiffAtCommit: props.onLoadDiffAtCommit,
    pendingCommitDiffRequest: props.pendingCommitDiffRequest,
    onPendingCommitDiffHandled: props.onPendingCommitDiffHandled,
    getNoteStatus: props.getNoteStatus,
    rawToggleRef: props.rawToggleRef,
    diffToggleRef: props.diffToggleRef,
  })
  const findRequest = useEditorFindCommand({
    activeTab: runtime.activeTab,
    findInNoteRef: props.findInNoteRef,
    handleToggleRawExclusive: runtime.handleToggleRawExclusive,
    rawMode: runtime.rawMode,
  })
  const handleExportPdf = useEditorPdfExport({
    activeTab: runtime.activeTab,
    diffMode: runtime.diffMode,
    handleToggleDiffExclusive: runtime.handleToggleDiffExclusive,
    handleToggleRawExclusive: runtime.handleToggleRawExclusive,
    locale: props.locale,
    onToast: props.onToast,
    pdfExportRef: props.pdfExportRef,
    rawMode: runtime.rawMode,
  })
  useRegisterEditorContentFlushes({
    activeTab: runtime.activeTab,
    flushPendingEditorChange: runtime.flushPendingEditorChange,
    flushPendingEditorContentRef: props.flushPendingEditorContentRef,
    rawLatestContentRef: runtime.rawLatestContentRef,
    rawMode: runtime.rawMode,
    onContentChange: props.onContentChange,
    flushPendingRawContentRef: props.flushPendingRawContentRef,
  })
  const rightPanel = useRightPanelExclusion(props)
  const { tableOfContentsToggleRef } = props
  useEffect(() => {
    if (tableOfContentsToggleRef) {
      tableOfContentsToggleRef.current = rightPanel.handleToggleTableOfContents
    }
  }, [tableOfContentsToggleRef, rightPanel.handleToggleTableOfContents])

  return (
    <EditorLayout
      {...buildEditorLayoutProps(props, runtime, findRequest)}
      onToggleInspector={rightPanel.handleToggleInspectorPanel}
      showAIChat={props.showAIChat}
      onToggleAIChat={props.onToggleAIChat ? rightPanel.handleToggleAIChatPanel : undefined}
      showTableOfContents={rightPanel.showTableOfContents}
      onToggleTableOfContents={rightPanel.handleToggleTableOfContents}
      onExportPdf={handleExportPdf}
    />
  )
})
