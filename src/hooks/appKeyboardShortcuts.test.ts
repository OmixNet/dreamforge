import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAppKeyboardEvent } from './appKeyboardShortcuts'
import type { KeyboardActions } from './appKeyboardShortcuts'

/**
 * v0.3 PR 13: appKeyboardShortcuts branch coverage.
 * Drives the public handleAppKeyboardEvent entry point with synthetic
 * KeyboardEvents to exercise the focused-text gating, the editor-find
 * scope check, and the search_used telemetry.
 */

function makeActions(overrides: Partial<KeyboardActions> = {}): KeyboardActions {
  return {
    onQuickOpen: vi.fn(),
    onCommandPalette: vi.fn(),
    onSearch: vi.fn(),
    onCreateNote: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onFindInNote: vi.fn(),
    onReplaceInNote: vi.fn(),
    onPastePlainText: vi.fn(),
    onOpenSettings: vi.fn(),
    onDeleteNote: vi.fn(),
    onArchiveNote: vi.fn(),
    onSetViewMode: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onToggleAIChat: vi.fn(),
    onToggleTableOfContents: vi.fn(),
    onToggleRawEditor: vi.fn(),
    onToggleInspector: vi.fn(),
    onToggleFavorite: vi.fn(),
    onToggleOrganized: vi.fn(),
    onOpenInNewWindow: vi.fn(),
    activeTabPathRef: { current: null },
    multiSelectionCommandRef: { current: null },
    ...overrides,
  }
}

function makeEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true })
}

describe('handleAppKeyboardEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns silently for events that are not bound to a command', () => {
    const actions = makeActions()
    const event = makeEvent('F12')
    handleAppKeyboardEvent(actions, event)
    // The event is still not preventDefault'd (handleAppKeyboardEvent only
    // preventDefaults when it dispatches or suppresses).
    expect(event.defaultPrevented).toBe(false)
  })

  it('fires onOpenSettings for the settings shortcut', () => {
    const actions = makeActions()
    const event = makeEvent(',', { metaKey: true })
    handleAppKeyboardEvent(actions, event)
    expect(actions.onOpenSettings).toHaveBeenCalled()
  })

  it('dispatches onSearch for Cmd+Shift+F (vault search)', () => {
    // The Cmd+Shift+F shortcut is the vault-wide search (editFindInVault).
    const actions = makeActions()
    const event = makeEvent('f', { metaKey: true, shiftKey: true })
    handleAppKeyboardEvent(actions, event)
    expect(actions.onSearch).toHaveBeenCalled()
  })

  it('returns silently for onFindInNote when no editor-find scope is focused', () => {
    const actions = makeActions()
    const event = makeEvent('f', { metaKey: true, ctrlKey: true })
    handleAppKeyboardEvent(actions, event)
    expect(actions.onFindInNote).not.toHaveBeenCalled()
  })

  it('fires onFindInNote when the focus is inside an editor-find scope', () => {
    const actions = makeActions()
    const scope = document.createElement('div')
    scope.setAttribute('data-editor-find-scope', 'true')
    const input = document.createElement('input')
    scope.appendChild(input)
    document.body.appendChild(scope)
    input.focus()
    const event = makeEvent('f', { metaKey: true, ctrlKey: true })
    handleAppKeyboardEvent(actions, event)
    expect(actions.onFindInNote).toHaveBeenCalled()
  })

  it('runs undo from the editor surface when canUndo is true', () => {
    const actions = makeActions({ canUndo: true })
    const editor = document.createElement('div')
    editor.className = 'editor__blocknote-container'
    const inner = document.createElement('div')
    editor.appendChild(inner)
    document.body.appendChild(editor)
    inner.focus()
    const event = makeEvent('z', { metaKey: true })
    handleAppKeyboardEvent(actions, event)
    expect(actions.onUndo).toHaveBeenCalled()
  })

  it('suppresses the undo shortcut in a text input even when canUndo is true', () => {
    const actions = makeActions({ canUndo: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const event = makeEvent('z', { metaKey: true })
    handleAppKeyboardEvent(actions, event)
    // The undo is suppressed in a plain text input; the action is not called.
    expect(actions.onUndo).not.toHaveBeenCalled()
  })
})
