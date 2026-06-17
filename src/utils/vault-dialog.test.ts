import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatFolderPickerActionError,
  isNativeFolderPickerBlockedError,
  NativeFolderPickerBlockedError,
  pickFolder,
} from './vault-dialog'
import {
  clearRestartRequiredAfterUpdate,
  isRestartRequiredAfterUpdate,
} from '../lib/appUpdater'
import { isTauri } from '../mock-tauri'

/**
 * v0.3 PR 12.1: vault-dialog branch ramp.
 * Focus on the pure helpers (normalizePickedFolderPath, error formatters) and the
 * slim-mode pickFolder() browser fallback. The native Tauri path is tested
 * indirectly via the restart-required error throw.
 */

vi.mock('../mock-tauri', async () => {
  const actual = await vi.importActual<typeof import('../mock-tauri')>('../mock-tauri')
  return {
    ...actual,
    isTauri: vi.fn(),
  }
})

const isTauriMock = vi.mocked(isTauri)

describe('vault-dialog', () => {
  beforeEach(() => {
    clearRestartRequiredAfterUpdate()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    clearRestartRequiredAfterUpdate()
  })

  describe('error helpers', () => {
    it('formatFolderPickerActionError keeps the action label for empty messages', () => {
      expect(formatFolderPickerActionError('Pick vault', '')).toBe('Pick vault')
      expect(formatFolderPickerActionError('Pick vault', null)).toBe('Pick vault')
      expect(formatFolderPickerActionError('Pick vault', undefined)).toBe('Pick vault')
    })

    it('formatFolderPickerActionError prefixes the action when an error message is present', () => {
      expect(formatFolderPickerActionError('Pick vault', new Error('disk full'))).toBe(
        'Pick vault: disk full',
      )
      expect(formatFolderPickerActionError('Pick vault', 'plain text')).toBe('Pick vault: plain text')
    })

    it('formatFolderPickerActionError returns the blocked-error message verbatim', () => {
      const blocked = new NativeFolderPickerBlockedError()
      expect(formatFolderPickerActionError('Pick vault', blocked)).toBe(blocked.message)
    })

    it('isNativeFolderPickerBlockedError narrows the type to the custom error class', () => {
      const blocked = new NativeFolderPickerBlockedError()
      expect(isNativeFolderPickerBlockedError(blocked)).toBe(true)
      expect(isNativeFolderPickerBlockedError(new Error('something else'))).toBe(false)
      expect(isNativeFolderPickerBlockedError('plain text')).toBe(false)
      expect(isNativeFolderPickerBlockedError(null)).toBe(false)
    })
  })

  describe('pickFolder (browser / slim mode)', () => {
    beforeEach(() => {
      isTauriMock.mockReturnValue(false)
    })

    it('returns null when the user cancels the prompt (empty input)', async () => {
      vi.spyOn(window, 'prompt').mockReturnValue(null)
      expect(await pickFolder('Pick a folder')).toBeNull()
    })

    it('returns the picked path when prompt resolves with a string', async () => {
      vi.spyOn(window, 'prompt').mockReturnValue('/Users/biomatrix/vault')
      expect(await pickFolder('Pick a folder')).toBe('/Users/biomatrix/vault')
    })

    it('decodes file:// URLs returned from the native picker (Tauri path)', async () => {
      // Covers the file:// branch in normalizePickedFolderPath via the Tauri entry
      // point: when open() resolves to a file:// URL (older Tauri dialog plugin
      // versions), the picker strips the protocol so callers get a plain path.
      isTauriMock.mockReturnValue(true)
      // Stub the dynamic @tauri-apps/plugin-dialog import to avoid the real call.
      vi.doMock('@tauri-apps/plugin-dialog', () => ({
        open: vi.fn().mockResolvedValue('file:///Users/biomatrix/vault'),
      }))
      const result = await pickFolder('Pick a folder')
      expect(result).toBe('/Users/biomatrix/vault')
      vi.doUnmock('@tauri-apps/plugin-dialog')
    })
  })

  describe('pickFolder (Tauri mode)', () => {
    beforeEach(() => {
      isTauriMock.mockReturnValue(true)
    })

    it('throws NativeFolderPickerBlockedError immediately when restart is required', async () => {
      // simulate the previous native call having tripped the marker
      const { markRestartRequiredAfterUpdate } = await import('../lib/appUpdater')
      markRestartRequiredAfterUpdate()
      expect(isRestartRequiredAfterUpdate()).toBe(true)

      await expect(pickFolder()).rejects.toBeInstanceOf(NativeFolderPickerBlockedError)
    })
  })
})
