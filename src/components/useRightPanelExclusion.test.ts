import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRightPanelExclusion } from './useRightPanelExclusion'

/**
 * v0.3 PR 13: useRightPanelExclusion branch coverage.
 * Targets the prepareRightPanelOpen and toggleTableOfContentsPanel paths
 * inside the hook — the only public way to drive the internal state.
 */

describe('useRightPanelExclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with table-of-contents hidden', () => {
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: true,
        onToggleInspector: vi.fn(),
      }),
    )
    expect(result.current.showTableOfContents).toBe(false)
  })

  it('toggles the table of contents, opening after the right panel collapses', () => {
    const onToggleInspector = vi.fn()
    const onToggleAIChat = vi.fn()
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: false, // not collapsed, so it should be collapsed
        onToggleAIChat,
        onToggleInspector,
      }),
    )
    act(() => result.current.handleToggleTableOfContents())
    expect(onToggleInspector).toHaveBeenCalledTimes(1)
    expect(result.current.showTableOfContents).toBe(true)
  })

  it('closes the table of contents when it is already open', () => {
    const onToggleInspector = vi.fn()
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: true,
        onToggleInspector,
      }),
    )
    act(() => result.current.handleToggleTableOfContents())
    expect(result.current.showTableOfContents).toBe(true)
    act(() => result.current.handleToggleTableOfContents())
    expect(result.current.showTableOfContents).toBe(false)
    // Inspector is not toggled when closing the table of contents.
    expect(onToggleInspector).not.toHaveBeenCalled()
  })

  it('handleToggleInspectorPanel fires onToggleInspector', () => {
    const onToggleInspector = vi.fn()
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: true,
        onToggleInspector,
      }),
    )
    act(() => result.current.handleToggleInspectorPanel())
    expect(onToggleInspector).toHaveBeenCalledTimes(1)
  })

  it('handleToggleAIChatPanel fires onToggleAIChat when provided', () => {
    const onToggleAIChat = vi.fn()
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: true,
        onToggleAIChat,
        onToggleInspector: vi.fn(),
      }),
    )
    act(() => result.current.handleToggleAIChatPanel())
    expect(onToggleAIChat).toHaveBeenCalledTimes(1)
  })

  it('handleToggleAIChatPanel works without an onToggleAIChat callback', () => {
    const { result } = renderHook(() =>
      useRightPanelExclusion({
        inspectorCollapsed: true,
        onToggleInspector: vi.fn(),
      }),
    )
    expect(() => {
      act(() => result.current.handleToggleAIChatPanel())
    }).not.toThrow()
  })
})
