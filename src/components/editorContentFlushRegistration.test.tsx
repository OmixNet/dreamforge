import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type React from 'react'
import { useRegisterEditorContentFlushes } from './editorContentFlushRegistration'

/**
 * v0.3 PR 13: editorContentFlushRegistration branch coverage.
 * Covers the rich + raw flush registration hooks (ref-write + early-return
 * paths) and the flush callbacks themselves.
 */

function makeActiveTab(path: string, content: string) {
  return { entry: { path }, content }
}

describe('useRegisterEditorContentFlushes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the rich flush callback into the provided ref', () => {
    const flushPendingEditorContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const flushPendingEditorChange = vi.fn().mockReturnValue(true)
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'hello'),
        flushPendingEditorChange,
        flushPendingEditorContentRef,
        rawLatestContentRef: { current: null },
        rawMode: false,
      }),
    )
    expect(typeof flushPendingEditorContentRef.current).toBe('function')
  })

  it('the rich flush callback short-circuits when no active tab is set', () => {
    const flushPendingEditorContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const flushPendingEditorChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: null,
        flushPendingEditorChange,
        flushPendingEditorContentRef,
        rawLatestContentRef: { current: null },
        rawMode: false,
      }),
    )
    flushPendingEditorContentRef.current?.('/some/path.md')
    expect(flushPendingEditorChange).not.toHaveBeenCalled()
  })

  it('the rich flush callback short-circuits when the path does not match the active tab', () => {
    const flushPendingEditorContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const flushPendingEditorChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'hello'),
        flushPendingEditorChange,
        flushPendingEditorContentRef,
        rawLatestContentRef: { current: null },
        rawMode: false,
      }),
    )
    flushPendingEditorContentRef.current?.('/vault/other.md')
    expect(flushPendingEditorChange).not.toHaveBeenCalled()
  })

  it('the rich flush callback fires flushPendingEditorChange when the path matches', () => {
    const flushPendingEditorContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const flushPendingEditorChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'hello'),
        flushPendingEditorChange,
        flushPendingEditorContentRef,
        rawLatestContentRef: { current: null },
        rawMode: false,
      }),
    )
    flushPendingEditorContentRef.current?.('/vault/note.md')
    expect(flushPendingEditorChange).toHaveBeenCalledTimes(1)
  })

  it('the raw flush callback short-circuits when rawMode is false', () => {
    const flushPendingRawContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const onContentChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'hello'),
        flushPendingEditorChange: vi.fn(),
        rawLatestContentRef: { current: 'pending' },
        rawMode: false,
        onContentChange,
        flushPendingRawContentRef,
      }),
    )
    flushPendingRawContentRef.current?.('/vault/note.md')
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('the raw flush callback short-circuits when the latest content matches the active tab', () => {
    const flushPendingRawContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const onContentChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'same'),
        flushPendingEditorChange: vi.fn(),
        rawLatestContentRef: { current: 'same' },
        rawMode: true,
        onContentChange,
        flushPendingRawContentRef,
      }),
    )
    flushPendingRawContentRef.current?.('/vault/note.md')
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('the raw flush callback fires onContentChange when the content differs', () => {
    const flushPendingRawContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const onContentChange = vi.fn()
    renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'saved'),
        flushPendingEditorChange: vi.fn(),
        rawLatestContentRef: { current: 'in-progress' },
        rawMode: true,
        onContentChange,
        flushPendingRawContentRef,
      }),
    )
    flushPendingRawContentRef.current?.('/vault/note.md')
    expect(onContentChange).toHaveBeenCalledWith('/vault/note.md', 'in-progress')
  })

  it('writes the raw flush callback into the ref and nulls it on unmount', () => {
    const flushPendingRawContentRef: React.MutableRefObject<((path: string) => void) | null> = {
      current: null,
    }
    const { unmount } = renderHook(() =>
      useRegisterEditorContentFlushes({
        activeTab: makeActiveTab('/vault/note.md', 'hello'),
        flushPendingEditorChange: vi.fn(),
        rawLatestContentRef: { current: null },
        rawMode: true,
        onContentChange: vi.fn(),
        flushPendingRawContentRef,
      }),
    )
    const callback = flushPendingRawContentRef.current
    expect(typeof callback).toBe('function')
    unmount()
    expect(flushPendingRawContentRef.current).toBeNull()
  })
})
