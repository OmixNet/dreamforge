import { describe, expect, it, vi } from 'vitest'
import {
  buildCodeMirrorRestoreState,
  captureRawCodeMirrorRestoreState,
  captureRawEditorPositionSnapshot,
  captureRichEditorPositionSnapshot,
  getRawEditorView,
  readBlockNoteScrollTop,
  restoreBlockNoteView,
  restoreCodeMirrorView,
  type BlockNotePositionEditor,
  type CodeMirrorViewLike,
} from './editorModePosition'

/**
 * v0.3 PR 12.3: editorModePosition branch coverage.
 * Tests the public API only — the line-math helpers are unexported.
 * Coverage is exercised via buildCodeMirrorRestoreState (line math) and
 * the capture / restore functions (DOM + CodeMirror / BlockNote wiring).
 */

function makeBlockNoteEditor(overrides: Partial<BlockNotePositionEditor> = {}): BlockNotePositionEditor {
  return {
    document: [],
    blocksToMarkdownLossy: (blocks) =>
      JSON.stringify(blocks).replace(/[{"}]/g, '').slice(0, 50),
    setSelection: vi.fn(),
    setTextCursorPosition: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  }
}

function makeCodeMirrorView(overrides: Partial<CodeMirrorViewLike> = {}): CodeMirrorViewLike {
  return {
    state: {
      doc: { toString: () => 'line 1\nline 2\nline 3' },
      selection: { main: { anchor: 0, head: 0 } },
    },
    scrollDOM: { scrollTop: 0 },
    dispatch: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  }
}

function attachCodeMirror(host: Element, view: CodeMirrorViewLike) {
  ;(host as unknown as { __cmView: CodeMirrorViewLike }).__cmView = view
}

function clearDom() {
  document.body.innerHTML = ''
}

describe('editorModePosition', () => {
  it('readBlockNoteScrollTop returns 0 when the scroll container is missing', () => {
    clearDom()
    expect(readBlockNoteScrollTop(document)).toBe(0)
  })

  it('readBlockNoteScrollTop returns the scrollTop of the .editor-scroll-area element', () => {
    clearDom()
    const el = document.createElement('div')
    el.className = 'editor-scroll-area'
    el.scrollTop = 42
    document.body.appendChild(el)
    expect(readBlockNoteScrollTop(document)).toBe(42)
  })

  it('captureRichEditorPositionSnapshot returns null for empty documents', () => {
    expect(captureRichEditorPositionSnapshot(makeBlockNoteEditor(), document)).toBeNull()
  })

  it('captureRichEditorPositionSnapshot prefers the selection bounds when there is a multi-block selection', () => {
    clearDom()
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      getSelection: () => ({ blocks: [{ id: 'a' }, { id: 'c' }] }),
    })
    expect(captureRichEditorPositionSnapshot(editor, document)).toEqual({
      anchorBlockIndex: 0,
      headBlockIndex: 2,
      scrollTop: 0,
    })
  })

  it('captureRichEditorPositionSnapshot falls back to the text cursor when no selection is set', () => {
    clearDom()
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }, { id: 'b' }],
      getTextCursorPosition: () => ({ block: { id: 'b' } }),
    })
    expect(captureRichEditorPositionSnapshot(editor, document)).toEqual({
      anchorBlockIndex: 1,
      headBlockIndex: 1,
      scrollTop: 0,
    })
  })

  it('captureRichEditorPositionSnapshot returns null when neither selection nor cursor can be resolved', () => {
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }],
      getTextCursorPosition: () => ({ block: { id: 'missing' } }),
    })
    expect(captureRichEditorPositionSnapshot(editor, document)).toBeNull()
  })

  it('captureRichEditorPositionSnapshot returns null when getTextCursorPosition throws', () => {
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }],
      getTextCursorPosition: () => {
        throw new Error('boom')
      },
    })
    expect(captureRichEditorPositionSnapshot(editor, document)).toBeNull()
  })

  it('buildCodeMirrorRestoreState returns null when the document is empty', () => {
    expect(
      buildCodeMirrorRestoreState(makeBlockNoteEditor(), '---\nkey: val\n---\nbody', {
        anchorBlockIndex: 0,
        headBlockIndex: 0,
        scrollTop: 0,
      }),
    ).toBeNull()
  })

  it('buildCodeMirrorRestoreState returns a state object with the frontmatter length added to the body offsets', () => {
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }, { id: 'b' }],
      blocksToMarkdownLossy: (blocks) =>
        (blocks as { id: string }[]).map((b) => b.id).join('|'),
    })
    const state = buildCodeMirrorRestoreState(editor, '---\nkey: val\n---\nA|B', {
      anchorBlockIndex: 0,
      headBlockIndex: 1,
      scrollTop: 7,
    })
    expect(state).not.toBeNull()
    expect(state?.scrollTop).toBe(7)
    // Frontmatter length is 14 chars; anchor sits on the first block line.
    expect(typeof state?.anchor).toBe('number')
    expect(typeof state?.head).toBe('number')
  })

  it('buildCodeMirrorRestoreState clamps index out-of-range and still returns a state', () => {
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }],
      blocksToMarkdownLossy: (blocks) => (blocks as { id: string }[])[0].id,
    })
    const state = buildCodeMirrorRestoreState(editor, '---\nk: v\n---\nA', {
      anchorBlockIndex: 99,
      headBlockIndex: -1,
      scrollTop: 0,
    })
    expect(state).not.toBeNull()
  })

  it('getRawEditorView returns null when the host is missing', () => {
    clearDom()
    expect(getRawEditorView(document)).toBeNull()
  })

  it('getRawEditorView returns the attached __cmView', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView()
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    expect(getRawEditorView(document)).toBe(view)
  })

  it('captureRawCodeMirrorRestoreState returns null when no view is attached', () => {
    clearDom()
    expect(captureRawCodeMirrorRestoreState(document)).toBeNull()
  })

  it('captureRawCodeMirrorRestoreState returns the cursor + scrollTop', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView({
      state: {
        doc: { toString: () => 'hello' },
        selection: { main: { anchor: 2, head: 4 } },
      },
      scrollDOM: { scrollTop: 17 },
    })
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    expect(captureRawCodeMirrorRestoreState(document)).toEqual({
      anchor: 2,
      head: 4,
      scrollTop: 17,
    })
  })

  it('captureRawEditorPositionSnapshot returns null when the view is missing', () => {
    clearDom()
    expect(captureRawEditorPositionSnapshot(document)).toBeNull()
  })

  it('captureRawEditorPositionSnapshot normalizes anchor / head behind the frontmatter', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView({
      state: {
        doc: { toString: () => '---\nkey: val\n---\nbody' },
        selection: { main: { anchor: 0, head: 0 } },
      },
    })
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    const snap = captureRawEditorPositionSnapshot(document)
    expect(snap).not.toBeNull()
    expect(snap?.anchorLineRatio).toBe(0)
    expect(snap?.headLineRatio).toBe(0)
  })

  it('restoreCodeMirrorView returns false when no view is attached', () => {
    clearDom()
    expect(restoreCodeMirrorView(document, { anchor: 0, head: 0, scrollTop: 0 })).toBe(false)
  })

  it('restoreCodeMirrorView dispatches the selection, sets scrollTop, and focuses', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView()
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    const ok = restoreCodeMirrorView(document, { anchor: 1, head: 3, scrollTop: 7 })
    expect(ok).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 1, head: 3 } })
    expect(view.scrollDOM.scrollTop).toBe(7)
    expect(view.focus).toHaveBeenCalled()
  })

  it('restoreCodeMirrorView clamps offsets behind the document length', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView({
      state: {
        doc: { toString: () => 'hi' }, // length 2
        selection: { main: { anchor: 0, head: 0 } },
      },
    })
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    const ok = restoreCodeMirrorView(document, { anchor: 99, head: -3, scrollTop: 0 })
    expect(ok).toBe(true)
    // Out-of-range offsets are clamped to [0, 2].
    expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 2, head: 0 } })
  })

  it('restoreCodeMirrorView returns false when dispatch throws', () => {
    clearDom()
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'raw-editor-codemirror')
    const view = makeCodeMirrorView({
      dispatch: () => {
        throw new Error('cm error')
      },
    })
    attachCodeMirror(host, view)
    document.body.appendChild(host)
    expect(restoreCodeMirrorView(document, { anchor: 0, head: 0, scrollTop: 0 })).toBe(false)
  })

  it('restoreBlockNoteView returns false when the document is empty', () => {
    const editor = makeBlockNoteEditor()
    expect(restoreBlockNoteView(editor, { anchorLineRatio: 0, headLineRatio: 0 }, document)).toBe(
      false,
    )
  })

  it('restoreBlockNoteView returns true and calls either setTextCursorPosition or setSelection', () => {
    clearDom()
    const editor = makeBlockNoteEditor({
      document: [
        { id: 'a', content: [] },
        { id: 'b', content: [] },
      ],
      blocksToMarkdownLossy: (blocks) => (blocks as { id: string }[]).map((b) => b.id).join('|'),
    })
    const ok = restoreBlockNoteView(editor, { anchorLineRatio: 0, headLineRatio: 0 }, document)
    expect(ok).toBe(true)
    const cursorCalls = (editor.setTextCursorPosition as ReturnType<typeof vi.fn>).mock.calls
    const selectionCalls = (editor.setSelection as ReturnType<typeof vi.fn>).mock.calls
    expect(cursorCalls.length + selectionCalls.length).toBeGreaterThan(0)
  })

  it('restoreBlockNoteView returns false when setSelection throws', () => {
    const editor = makeBlockNoteEditor({
      document: [{ id: 'a' }, { id: 'b' }],
      blocksToMarkdownLossy: (blocks) => (blocks as { id: string }[]).map((b) => b.id).join('|'),
      setSelection: () => {
        throw new Error('bn error')
      },
    })
    expect(restoreBlockNoteView(editor, { anchorLineRatio: 0, headLineRatio: 0 }, document)).toBe(
      false,
    )
  })
})
