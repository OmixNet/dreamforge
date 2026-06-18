import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TauriDragDropEvent } from '../hooks/useTauriDragDropEvent'

/**
 * v0.3 PR 13: useNativePathDrop branch coverage.
 * Drives the hook via a mocked useTauriDragDropEvent subscriber so we can
 * fire synthetic drag-drop events and assert which paths reach onPathDrop.
 *
 * The pure helpers (pointInRect / shouldCheckScaledPoint / nativeDropHitsTarget
 * etc.) are exercised through the public hook — we don't need to export them
 * individually.
 */

let subscriber: ((event: TauriDragDropEvent) => void) | null = null

vi.mock('../hooks/useTauriDragDropEvent', () => ({
  useTauriDragDropEvent: (cb: (event: TauriDragDropEvent) => void) => {
    subscriber = cb
  },
}))

// Import AFTER the mock so it picks up the stub.
const { useNativePathDrop } = await import('./useNativePathDrop')

function makeDropEvent(position: { x: number; y: number }, paths: string[]): TauriDragDropEvent {
  return {
    payload: { type: 'drop', position, paths },
  } as unknown as TauriDragDropEvent
}

describe('useNativePathDrop', () => {
  beforeEach(() => {
    subscriber = null
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when disabled is true', () => {
    const onPathDrop = vi.fn()
    renderHook(() =>
      useNativePathDrop({
        targetRef: { current: null },
        disabled: true,
        onPathDrop,
      }),
    )
    expect(subscriber).not.toBeNull()
    // Fire a drop event that would normally hit — disabled suppresses it.
    act(() => {
      subscriber?.(makeDropEvent({ x: 10, y: 10 }, ['/path/a.md']))
    })
    expect(onPathDrop).not.toHaveBeenCalled()
  })

  it('forwards drop paths when the position hits the target rect', () => {
    const onPathDrop = vi.fn()
    const el = document.createElement('div')
    document.body.appendChild(el)
    // Mock getBoundingClientRect to a known rect.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      toJSON() {},
    } as DOMRect)

    renderHook(() =>
      useNativePathDrop({
        targetRef: { current: el },
        onPathDrop,
      }),
    )
    act(() => {
      subscriber?.(makeDropEvent({ x: 50, y: 50 }, ['/path/a.md']))
    })
    expect(onPathDrop).toHaveBeenCalledWith(['/path/a.md'])

    document.body.removeChild(el)
  })

  it('ignores non-drop events', () => {
    const onPathDrop = vi.fn()
    const el = document.createElement('div')
    document.body.appendChild(el)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      toJSON() {},
    } as DOMRect)
    renderHook(() =>
      useNativePathDrop({
        targetRef: { current: el },
        onPathDrop,
      }),
    )
    act(() => {
      subscriber?.({ payload: { type: 'over', position: { x: 50, y: 50 }, paths: [] } } as unknown as TauriDragDropEvent)
      subscriber?.({ payload: { type: 'leave', position: { x: 50, y: 50 }, paths: [] } } as unknown as TauriDragDropEvent)
    })
    expect(onPathDrop).not.toHaveBeenCalled()
    document.body.removeChild(el)
  })

  it('filters out empty / whitespace-only paths', () => {
    const onPathDrop = vi.fn()
    const el = document.createElement('div')
    document.body.appendChild(el)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      toJSON() {},
    } as DOMRect)
    renderHook(() =>
      useNativePathDrop({
        targetRef: { current: el },
        onPathDrop,
      }),
    )
    act(() => {
      subscriber?.(makeDropEvent({ x: 50, y: 50 }, ['  ', '/path/a.md', '']))
    })
    expect(onPathDrop).toHaveBeenCalledWith(['/path/a.md'])
    document.body.removeChild(el)
  })

  it('does not call onPathDrop when the drop misses the target rect', () => {
    const onPathDrop = vi.fn()
    const el = document.createElement('div')
    document.body.appendChild(el)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      toJSON() {},
    } as DOMRect)
    renderHook(() =>
      useNativePathDrop({
        targetRef: { current: el },
        onPathDrop,
      }),
    )
    act(() => {
      subscriber?.(makeDropEvent({ x: 500, y: 500 }, ['/path/a.md']))
    })
    expect(onPathDrop).not.toHaveBeenCalled()
    document.body.removeChild(el)
  })

  it('renders nothing visible to the consumer (hook returns undefined)', () => {
    const { result } = renderHook(() =>
      useNativePathDrop({
        targetRef: { current: null },
        onPathDrop: vi.fn(),
      }),
    )
    expect(result.current).toBeUndefined()
  })
})
