import { describe, expect, it } from 'vitest'
import {
  applyCustomization,
  computeReorder,
  getElementMenuPosition,
  getPointerMenuPosition,
} from './sidebarHooks'

/**
 * v0.3 PR 13: sidebarHooks pure helper branch coverage.
 * The hook surfaces (useOutsideClick, useDismissableSidebarLayer,
 * useSidebarContextMenu, useSidebarInlineRenameInput, useSidebarSections,
 * useSidebarCollapsed, useEntryCounts) are covered by the integration tests
 * in src/components/sidebar. This file targets the small, branch-heavy
 * pure helpers.
 */

describe('sidebarHooks', () => {
  describe('getPointerMenuPosition', () => {
    it('returns the client coordinates of the event', () => {
      expect(getPointerMenuPosition({ clientX: 10, clientY: 20 })).toEqual({ x: 10, y: 20 })
    })
  })

  describe('getElementMenuPosition', () => {
    it('returns the keyboard fallback when the element is null', () => {
      expect(getElementMenuPosition(null)).toEqual({ x: 20, y: 100 })
    })

    it('returns the element bounds plus the standard 16px offset', () => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () =>
        ({
          left: 100,
          right: 200,
          top: 50,
          bottom: 70,
          x: 100,
          y: 50,
          width: 100,
          height: 20,
          toJSON() {},
        }) as DOMRect
      expect(getElementMenuPosition(el)).toEqual({ x: 116, y: 70 })
    })

    it('honors a custom fallback', () => {
      expect(getElementMenuPosition(null, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 })
    })
  })

  describe('computeReorder', () => {
    it('returns null when either id is not in the section list', () => {
      expect(computeReorder(['a', 'b', 'c'], 'a', 'missing')).toBeNull()
      expect(computeReorder(['a', 'b', 'c'], 'missing', 'a')).toBeNull()
    })

    it('moves activeId to the position previously held by overId', () => {
      // Remove 'a' from index 0, insert at index 2: ['b', 'c', 'a'].
      expect(computeReorder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
      // Remove 'c' from index 2, insert at index 0: ['c', 'a', 'b'].
      expect(computeReorder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    })
  })

  describe('applyCustomization', () => {
    const typeEntry = {
      path: '/vault/note.md',
      filename: 'note.md',
      title: 'note',
      isA: 'idea',
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
      icon: 'star',
      color: 'red',
      order: null,
      sidebarLabel: null,
      template: null,
      sort: null,
      view: null,
      visible: true,
      outgoingLinks: [],
      properties: {},
    }
    const typeEntryMap = { idea: typeEntry }

    it('no-ops when the target is null', () => {
      const onCustomizeType = vi.fn()
      applyCustomization(null, typeEntryMap, onCustomizeType, 'icon', 'X')
      expect(onCustomizeType).not.toHaveBeenCalled()
    })

    it('no-ops when the onCustomizeType callback is undefined', () => {
      applyCustomization('idea', typeEntryMap, undefined, 'icon', 'X')
      // No throw, no call.
    })

    it('keeps the existing icon when prop is color', () => {
      const onCustomizeType = vi.fn()
      applyCustomization('idea', typeEntryMap, onCustomizeType, 'color', 'blue')
      expect(onCustomizeType).toHaveBeenCalledWith('idea', 'star', 'blue')
    })

    it('keeps the existing color when prop is icon', () => {
      const onCustomizeType = vi.fn()
      applyCustomization('idea', typeEntryMap, onCustomizeType, 'icon', 'sparkle')
      expect(onCustomizeType).toHaveBeenCalledWith('idea', 'sparkle', 'red')
    })

    it('uses the default icon / color when the type entry is not found', () => {
      const onCustomizeType = vi.fn()
      applyCustomization('unknown', typeEntryMap, onCustomizeType, 'icon', 'sparkle')
      expect(onCustomizeType).toHaveBeenCalledWith('unknown', 'sparkle', 'blue')
    })
  })
})
