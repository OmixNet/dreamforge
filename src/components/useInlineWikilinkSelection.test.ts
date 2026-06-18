import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInlineWikilinkSelection } from './useInlineWikilinkSelection'

/**
 * v0.3 PR 13: useInlineWikilinkSelection branch coverage.
 * Targets the public hook surface — selectionRange defaults to the value
 * length, setCombinedRef wires the editor ref through to the inputRef, and
 * commitValueFromEditor + syncSelectionRange / focusSelectionRange no-op
 * when no editor is attached.
 */

describe('useInlineWikilinkSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes selectionRange to the value length', () => {
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({
        value: 'hello',
        onChange: vi.fn(),
      }),
    )
    expect(result.current.selectionRange).toEqual({ start: 5, end: 5 })
    expect(result.current.selectionIndex).toBe(5)
  })

  it('returns the editorRef + handlers', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({ value: '', onChange }),
    )
    expect(typeof result.current.setCombinedRef).toBe('function')
    expect(typeof result.current.syncSelectionRange).toBe('function')
    expect(typeof result.current.focusSelectionRange).toBe('function')
    expect(typeof result.current.commitValueFromEditor).toBe('function')
  })

  it('setCombinedRef assigns the node to both the internal + inputRef', () => {
    const inputRef = { current: null as HTMLDivElement | null }
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({
        value: '',
        onChange: vi.fn(),
        inputRef,
      }),
    )
    const node = document.createElement('div')
    act(() => result.current.setCombinedRef(node))
    expect(inputRef.current).toBe(node)
  })

  it('commitValueFromEditor is a no-op when no editor is attached', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({ value: '', onChange }),
    )
    act(() => result.current.commitValueFromEditor())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('focusSelectionRange is a no-op when no editor is attached', () => {
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({ value: '', onChange: vi.fn() }),
    )
    expect(() => {
      act(() => result.current.focusSelectionRange({ start: 0, end: 5 }))
    }).not.toThrow()
  })

  it('syncSelectionRange is a no-op when no editor is attached', () => {
    const { result } = renderHook(() =>
      useInlineWikilinkSelection({ value: '', onChange: vi.fn() }),
    )
    expect(() => {
      act(() => result.current.syncSelectionRange())
    }).not.toThrow()
  })
})
