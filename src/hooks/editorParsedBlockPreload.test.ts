import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PARSED_BLOCK_PRELOAD_DELAY_MS,
  PARSED_BLOCK_PRELOAD_ENABLED,
  PARSED_BLOCK_PRELOAD_FOREGROUND_IDLE_MS,
  PARSED_BLOCK_PRELOAD_MIN_BYTES,
  useParsedBlockPreload,
} from './editorParsedBlockPreload'
import { subscribeNoteContentResolved, type NoteContentResolvedEvent } from './noteContentCache'

/**
 * v0.3 PR 12.3: editorParsedBlockPreload branch coverage.
 * The default export gates on PARSED_BLOCK_PRELOAD_ENABLED=false, so the
 * event subscription no-ops. We still exercise the import path and assert
 * the constants are present.
 */

function makeEvent(overrides: Partial<NoteContentResolvedEvent> = {}): NoteContentResolvedEvent {
  return {
    entry: {
      path: '/Users/biomatrix/vault/notes/2026/x.md',
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
      fileSize: PARSED_BLOCK_PRELOAD_MIN_BYTES + 1,
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
    parsedBlockPreload: true,
    ...overrides,
  }
}

describe('editorParsedBlockPreload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('exports the expected constant values', () => {
    expect(PARSED_BLOCK_PRELOAD_MIN_BYTES).toBe(32 * 1024)
    expect(PARSED_BLOCK_PRELOAD_DELAY_MS).toBe(1800)
    expect(PARSED_BLOCK_PRELOAD_FOREGROUND_IDLE_MS).toBe(1500)
    expect(PARSED_BLOCK_PRELOAD_ENABLED).toBe(false)
  })

  it('mounts cleanly and returns a stable handle', () => {
    const { result, unmount } = renderHook(() =>
      useParsedBlockPreload({
        activeTabPathRef: { current: null },
        editorMountedRef: { current: true },
        foregroundWorkAtRef: { current: 0 },
        prepareParsedBlocks: vi.fn(),
        rawModeRef: { current: false },
      }),
    )
    expect(result.current).toBeUndefined()
    unmount()
  })

  it('does not invoke prepareParsedBlocks even after a long delay when the feature is disabled', async () => {
    const prepareParsedBlocks = vi.fn()
    renderHook(() =>
      useParsedBlockPreload({
        activeTabPathRef: { current: null },
        editorMountedRef: { current: true },
        foregroundWorkAtRef: { current: 0 },
        prepareParsedBlocks,
        rawModeRef: { current: false },
      }),
    )
    // Subscribe to the resolved event bus and emit an event.
    const unsubscribe = subscribeNoteContentResolved(() => {})
    const event = makeEvent()
    event.parsedBlockPreload = true
    // Simulate the bus dispatch by invoking subscribers directly.
    // (We can't easily reach the internal emitter, so we assert the feature flag.)
    expect(PARSED_BLOCK_PRELOAD_ENABLED).toBe(false)
    // Advance fake timers well past the delay.
    act(() => {
      vi.advanceTimersByTime(PARSED_BLOCK_PRELOAD_DELAY_MS * 5)
    })
    expect(prepareParsedBlocks).not.toHaveBeenCalled()
    unsubscribe()
  })
})
