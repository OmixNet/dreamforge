import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInlineWikilinkSuggestionsState } from './useInlineWikilinkSuggestionsState'
import type { VaultEntry } from '../types'

/**
 * v0.3 PR 12.3: useInlineWikilinkSuggestionsState branch coverage.
 * Covers query null → empty suggestions, query-key reset, cycle forward
 * and backward (with and without the wrap), out-of-range index clamp,
 * and the select-suggestion no-op when the suggestion is missing.
 */

function makeEntry(id: string, title: string): VaultEntry {
  return {
    path: `/Users/biomatrix/vault/${title.toLowerCase()}.md`,
    filename: `${title.toLowerCase()}.md`,
    title,
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
    fileSize: 0,
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
  }
}

interface Harness {
  result: ReturnType<typeof renderHook<ReturnType<typeof useInlineWikilinkSuggestionsState>, unknown>>['result']
  onChange: ReturnType<typeof vi.fn>
  onSelectionIndexChange: ReturnType<typeof vi.fn>
  focusSelectionAt: ReturnType<typeof vi.fn>
}

function setupHarness(overrides: Partial<{
  activeQueryKey: string
  query: string | null
  value: string
  selectionIndex: number
}> = {}): Harness {
  const onChange = vi.fn()
  const onSelectionIndexChange = vi.fn()
  const focusSelectionAt = vi.fn()
  const { result } = renderHook(() =>
    useInlineWikilinkSuggestionsState({
      activeQueryKey: overrides.activeQueryKey ?? 'q1',
      entries: [makeEntry('a', 'Apple'), makeEntry('b', 'Banana'), makeEntry('c', 'Cherry')],
      query: 'query' in overrides ? overrides.query : 'a',
      value: overrides.value ?? 'hello [[a]] world',
      selectionIndex: overrides.selectionIndex ?? 0,
      onChange,
      onSelectionIndexChange,
      focusSelectionAt,
    }),
  )
  return { result, onChange, onSelectionIndexChange, focusSelectionAt }
}

describe('useInlineWikilinkSuggestionsState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns an empty suggestion list when the query is null', () => {
    const { result } = setupHarness({ query: null })
    expect(result.current.suggestions).toEqual([])
  })

  it('returns suggestions for the active query', () => {
    const { result } = setupHarness({ query: 'a' })
    expect(result.current.suggestions.length).toBeGreaterThan(0)
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })

  it('clamps the selected index when the stored index is out-of-range', () => {
    const { result } = setupHarness()
    // Move the index way out, then re-render with a shorter suggestion list.
    act(() => result.current.setSuggestionIndex(99))
    // After the clamp, selectedSuggestionIndex is the min of stored index and length-1.
    expect(result.current.selectedSuggestionIndex).toBeLessThanOrEqual(
      result.current.suggestions.length - 1,
    )
  })

  it('cycleSuggestions no-ops when the suggestion list is empty', () => {
    const { result } = setupHarness({ query: null })
    act(() => result.current.cycleSuggestions(1))
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })

  it('cycleSuggestions forward seeds index 0 on a new query key', () => {
    const { result } = setupHarness({ activeQueryKey: 'q1' })
    act(() => result.current.cycleSuggestions(1))
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })

  it('cycleSuggestions backward seeds the last index on a new query key', () => {
    const { result } = setupHarness({ activeQueryKey: 'q1' })
    act(() => result.current.cycleSuggestions(-1))
    expect(result.current.selectedSuggestionIndex).toBe(
      result.current.suggestions.length - 1,
    )
  })

  it('cycleSuggestions wraps around when the index would go past the end (forward)', () => {
    const { result } = setupHarness({ activeQueryKey: 'q1' })
    // Set the index to the last suggestion, then cycle forward — wraps to 0.
    act(() => result.current.setSuggestionIndex(result.current.suggestions.length - 1))
    act(() => result.current.cycleSuggestions(1))
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })

  it('cycleSuggestions backward wraps from 0 to the last suggestion', () => {
    const { result } = setupHarness({ activeQueryKey: 'q1' })
    act(() => result.current.setSuggestionIndex(0))
    act(() => result.current.cycleSuggestions(-1))
    expect(result.current.selectedSuggestionIndex).toBe(
      result.current.suggestions.length - 1,
    )
  })

  it('selectSuggestion is a no-op when the index is out of range', () => {
    const { result, onChange } = setupHarness()
    act(() => result.current.selectSuggestion(99))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selectSuggestion is a callable function', () => {
    const { result } = setupHarness()
    // The exact onChange call requires a value + selectionIndex that align
    // with an active wikilink query, which is exercised by the inline-wikilink
    // integration test. Here we only assert the function is exposed and does
    // not throw when invoked with an out-of-range index (see above).
    expect(typeof result.current.selectSuggestion).toBe('function')
  })
})
