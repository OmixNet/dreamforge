import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_STORAGE_KEYS,
  LEGACY_APP_STORAGE_KEYS,
  LEGACY_TOLARIA_APP_STORAGE_KEYS,
  copyLegacyAppStorageKeys,
  copyTolariaAppStorageKeys,
  getAppStorageItem,
} from './appStorage'

describe('appStorage legacy migration', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    })
  })

  it('copies Laputa legacy values to DreamX keys without overwriting existing values', () => {
    store[LEGACY_APP_STORAGE_KEYS.theme] = 'dark'
    store[LEGACY_APP_STORAGE_KEYS.zoom] = '125'
    store[APP_STORAGE_KEYS.zoom] = '100'

    copyLegacyAppStorageKeys()

    expect(store[APP_STORAGE_KEYS.theme]).toBe('dark')
    expect(store[APP_STORAGE_KEYS.zoom]).toBe('100')
    expect(store[APP_STORAGE_KEYS.legacyMigrationFlag]).toBe('1')
  })

  it('copies Tolaria legacy values to DreamX keys without overwriting existing values', () => {
    store[LEGACY_TOLARIA_APP_STORAGE_KEYS.theme] = 'light'
    store[LEGACY_TOLARIA_APP_STORAGE_KEYS.zoom] = '125'
    store[APP_STORAGE_KEYS.zoom] = '100'

    copyTolariaAppStorageKeys()

    expect(store[APP_STORAGE_KEYS.theme]).toBe('light')
    expect(store[APP_STORAGE_KEYS.zoom]).toBe('100')
    expect(store[APP_STORAGE_KEYS.tolariaMigrationFlag]).toBe('1')
  })

  it('does not re-run Tolaria migration when the flag is already set', () => {
    store[APP_STORAGE_KEYS.tolariaMigrationFlag] = '1'
    store[LEGACY_TOLARIA_APP_STORAGE_KEYS.theme] = 'dark'

    copyTolariaAppStorageKeys()

    expect(store[APP_STORAGE_KEYS.theme]).toBeUndefined()
  })

  it('runs both migrations sequentially: Laputa → Tolaria → DreamX', () => {
    // User who has only Laputa keys (never upgraded) should end up with
    // DreamForge values via two migration passes. copyTolariaAppStorageKeys
    // is a no-op on the first run (no Tolaria keys exist yet), but
    // copyLegacyAppStorageKeys will have created them — so a second
    // invocation of the Tolaria migration moves them. This test mirrors
    // the call order in configMigration.ts.
    store[LEGACY_APP_STORAGE_KEYS.theme] = 'system'
    copyLegacyAppStorageKeys()
    // After Laputa migration, the theme is now in BOTH laputa-theme and
    // dreamforge-theme (the function copies the value, not moves it).
    // The Tolaria layer still has nothing, so copyTolariaAppStorageKeys
    // is a no-op here.
    copyTolariaAppStorageKeys()
    expect(store[APP_STORAGE_KEYS.theme]).toBe('system')
  })

  it('falls back to legacy values when the DreamX key is absent', () => {
    store[LEGACY_TOLARIA_APP_STORAGE_KEYS.viewMode] = 'editor-list'

    expect(getAppStorageItem('viewMode')).toBe('editor-list')
  })

  it('returns safely when localStorage is restricted', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('SecurityError') }),
      setItem: vi.fn(() => { throw new Error('SecurityError') }),
    })

    expect(() => copyLegacyAppStorageKeys()).not.toThrow()
    expect(() => copyTolariaAppStorageKeys()).not.toThrow()
    expect(getAppStorageItem('theme')).toBeNull()
  })
})
