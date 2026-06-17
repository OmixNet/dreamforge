import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  dispatchMenuEvent,
  useMenuEvents,
  type MenuEventHandlers,
} from './useMenuEvents'
import { APP_COMMAND_EVENT_NAME } from './appCommandDispatcher'
import { isTauri } from '../mock-tauri'

/**
 * v0.3 PR 12.1: useMenuEvents branch coverage.
 * - dispatchMenuEvent: unknown id, note list search id, app command id
 * - useMenuEvents hook mounts in browser + Tauri mode without throwing,
 *   and the window event listener / test bridge round-trip works.
 *
 * Notes on test isolation: each `it` builds a fresh `handlers` object so the
 * vi.fn() spies do not leak call counts across cases. The renderHook setup
 * file also auto-cleans the DOM between tests.
 */

vi.mock('../mock-tauri', async () => {
  const actual = await vi.importActual<typeof import('../mock-tauri')>('../mock-tauri')
  return { ...actual, isTauri: vi.fn() }
})

const isTauriMock = vi.mocked(isTauri)

function makeHandlers(overrides: Partial<MenuEventHandlers> = {}): MenuEventHandlers {
  return {
    activeTabPath: null,
    onOpenSettings: vi.fn(),
    onOpenVaultSwitcher: vi.fn(),
    onCommitChanges: vi.fn(),
    onCycleTheme: vi.fn(),
    ...overrides,
  }
}

describe('useMenuEvents', () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete window.__laputaTest?.dispatchBrowserMenuCommand
  })

  describe('dispatchMenuEvent', () => {
    it('returns silently for unknown command ids', () => {
      const handlers = makeHandlers()
      dispatchMenuEvent('not-a-real-id', handlers)
      expect(handlers.onOpenSettings).not.toHaveBeenCalled()
    })

    it('triggers the matching app command handler for known ids', () => {
      const handlers = makeHandlers()
      dispatchMenuEvent('app-settings', handlers)
      expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('dispatches the note-list search toggle without invoking the generic command path', () => {
      const handlers = makeHandlers()
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      dispatchMenuEvent('edit-toggle-note-list-search', handlers)
      expect(handlers.onOpenSettings).not.toHaveBeenCalled()
      expect(dispatchSpy).toHaveBeenCalled()
    })
  })

  describe('hook (browser / slim mode)', () => {
    it('exposes dispatchBrowserMenuCommand on window.__laputaTest', () => {
      const handlers = makeHandlers()
      const { unmount } = renderHook(() => useMenuEvents(handlers))
      expect(window.__laputaTest?.dispatchBrowserMenuCommand).toBeTypeOf('function')
      unmount()
    })

    it('removes the test bridge on unmount', () => {
      const handlers = makeHandlers()
      const { unmount } = renderHook(() => useMenuEvents(handlers))
      expect(window.__laputaTest?.dispatchBrowserMenuCommand).toBeTypeOf('function')
      unmount()
      expect(window.__laputaTest?.dispatchBrowserMenuCommand).toBeUndefined()
    })

    it('routes calls through the test bridge to the matching handler', () => {
      const handlers = makeHandlers()
      renderHook(() => useMenuEvents(handlers))
      act(() => {
        window.__laputaTest?.dispatchBrowserMenuCommand?.('app-settings')
      })
      expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('reacts to APP_COMMAND_EVENT_NAME window events', () => {
      const handlers = makeHandlers()
      renderHook(() => useMenuEvents(handlers))
      act(() => {
        window.dispatchEvent(
          new CustomEvent(APP_COMMAND_EVENT_NAME, { detail: 'app-settings' }),
        )
      })
      expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('ignores APP_COMMAND_EVENT_NAME events whose detail is not a valid command id', () => {
      const handlers = makeHandlers()
      renderHook(() => useMenuEvents(handlers))
      act(() => {
        window.dispatchEvent(
          new CustomEvent(APP_COMMAND_EVENT_NAME, { detail: 42 }),
        )
        window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT_NAME))
      })
      expect(handlers.onOpenSettings).not.toHaveBeenCalled()
    })

    it('mounts cleanly with modified / conflict / restorable / noRemote flags set', () => {
      const handlers = makeHandlers({
        activeTabPath: '/note.md',
        modifiedCount: 3,
        conflictCount: 0,
        hasRestorableDeletedNote: true,
        hasNoRemote: true,
      })
      const { unmount } = renderHook(() => useMenuEvents(handlers))
      unmount()
    })
  })

  describe('hook (Tauri mode)', () => {
    it('attaches the native menu listener when isTauri() is true', () => {
      isTauriMock.mockReturnValue(true)
      const handlers = makeHandlers({ activeTabPath: '/some/note.md' })
      // We don't fully exercise the listen() side-effect here — we only confirm
      // the hook does not throw and unmounts cleanly in Tauri mode.
      const { unmount } = renderHook(() => useMenuEvents(handlers))
      unmount()
    })
  })
})
