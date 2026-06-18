// PR 18: This file holds localStorage key names + a multi-layer legacy
// migration chain. Three generations live here:
//   1. DREAMFORGE_APP_STORAGE_KEYS — current (dreamforge:* / dreamforge_*)
//   2. LEGACY_TOLARIA_APP_STORAGE_KEYS — the previous fork's namespace
//      (tolaria:*) — the source of the rebrand in PR 16
//   3. LEGACY_APP_STORAGE_KEYS — the original Laputa namespace
//      (laputa:*) — historical, pre-fork
//
// All three layers must keep working reads while writes only target
// the current layer. `copyLegacyAppStorageKeys` + `copyTolariaAppStorageKeys`
// are idempotent — they each set their own flag and exit early on subsequent
// runs.

export const DREAMFORGE_APP_STORAGE_KEYS = {
  theme: 'dreamforge-theme',
  zoom: 'dreamforge:zoom-level',
  viewMode: 'dreamforge-view-mode',
  tagColors: 'dreamforge:tag-color-overrides',
  statusColors: 'dreamforge:status-color-overrides',
  propertyModes: 'dreamforge:display-mode-overrides',
  configMigrationFlag: 'dreamforge:config-migrated-to-vault',
  legacyMigrationFlag: 'dreamforge:legacy-storage-migrated',
  tolariaMigrationFlag: 'dreamforge:tolaria-storage-migrated',
  sortPreferences: 'dreamforge-sort-preferences',
  sidebarCollapsed: 'dreamforge:sidebar-collapsed',
  layoutPanels: 'dreamforge:layout-panels',
  welcomeDismissed: 'dreamforge_welcome_dismissed',
} as const

// Back-compat alias — many call sites still reference APP_STORAGE_KEYS.
// The values now point at the new dreamforge namespace.
export const APP_STORAGE_KEYS = DREAMFORGE_APP_STORAGE_KEYS

export const LEGACY_TOLARIA_APP_STORAGE_KEYS = {
  theme: 'tolaria-theme',
  zoom: 'tolaria:zoom-level',
  viewMode: 'tolaria-view-mode',
  tagColors: 'tolaria:tag-color-overrides',
  statusColors: 'tolaria:status-color-overrides',
  propertyModes: 'tolaria:display-mode-overrides',
  configMigrationFlag: 'tolaria:config-migrated-to-vault',
  sortPreferences: 'tolaria-sort-preferences',
  sidebarCollapsed: 'tolaria:sidebar-collapsed',
  layoutPanels: 'tolaria:layout-panels',
  welcomeDismissed: 'tolaria_welcome_dismissed',
} as const

export const LEGACY_APP_STORAGE_KEYS = {
  theme: 'laputa-theme',
  zoom: 'laputa:zoom-level',
  viewMode: 'laputa-view-mode',
  tagColors: 'laputa:tag-color-overrides',
  statusColors: 'laputa:status-color-overrides',
  propertyModes: 'laputa:display-mode-overrides',
  configMigrationFlag: 'laputa:config-migrated-to-vault',
  sortPreferences: 'laputa-sort-preferences',
  sidebarCollapsed: 'laputa:sidebar-collapsed',
  layoutPanels: 'laputa:layout-panels',
  welcomeDismissed: 'laputa_welcome_dismissed',
} as const

type TolariaMigratableStorageKey = keyof typeof LEGACY_TOLARIA_APP_STORAGE_KEYS
type LaputaMigratableStorageKey = keyof typeof LEGACY_APP_STORAGE_KEYS

const TOLARIA_MIGRATABLE_STORAGE_KEYS: TolariaMigratableStorageKey[] = [
  'theme',
  'zoom',
  'viewMode',
  'tagColors',
  'statusColors',
  'propertyModes',
  'configMigrationFlag',
  'sortPreferences',
  'sidebarCollapsed',
  'layoutPanels',
  'welcomeDismissed',
]

const LAPUTA_MIGRATABLE_STORAGE_KEYS: LaputaMigratableStorageKey[] = [
  'theme',
  'zoom',
  'viewMode',
  'tagColors',
  'statusColors',
  'propertyModes',
  'configMigrationFlag',
  'sortPreferences',
  'sidebarCollapsed',
  'layoutPanels',
  'welcomeDismissed',
]

function copyLegacyLayer(
  flagKey: string,
  layerKeys: readonly (keyof DREAMFORGEAppStorageKey)[],
  sourceLookup: (key: keyof DREAMFORGEAppStorageKey) => string,
): void {
  try {
    if (localStorage.getItem(flagKey) === '1') return

    for (const key of layerKeys) {
      const targetKey = Reflect.get(DREAMFORGE_APP_STORAGE_KEYS, key) as string
      if (localStorage.getItem(targetKey) !== null) continue

      const sourceKey = sourceLookup(key)
      const legacyValue = localStorage.getItem(sourceKey)
      if (legacyValue !== null) {
        localStorage.setItem(targetKey, legacyValue)
      }
    }

    localStorage.setItem(flagKey, '1')
  } catch {
    // Ignore unavailable or restricted localStorage implementations.
  }
}

// PR 18: copies laputa:* keys → dreamforge:* (the pre-fork → current).
// Idempotent via DREAMFORGE_APP_STORAGE_KEYS.legacyMigrationFlag.
export function copyLegacyAppStorageKeys(): void {
  copyLegacyLayer(
    DREAMFORGE_APP_STORAGE_KEYS.legacyMigrationFlag,
    LAPUTA_MIGRATABLE_STORAGE_KEYS,
    (key) => Reflect.get(LEGACY_APP_STORAGE_KEYS, key) as string,
  )
}

// PR 18: copies tolaria:* keys → dreamforge:* (the previous fork → current).
// Idempotent via DREAMFORGE_APP_STORAGE_KEYS.tolariaMigrationFlag.
// Must run AFTER copyLegacyAppStorageKeys() so that an unfixed laputa user
// gets laputa → tolaria → dreamforge in three passes; a user who already
// migrated laputa → tolaria gets tolaria → dreamforge in this pass.
export function copyTolariaAppStorageKeys(): void {
  copyLegacyLayer(
    DREAMFORGE_APP_STORAGE_KEYS.tolariaMigrationFlag,
    TOLARIA_MIGRATABLE_STORAGE_KEYS,
    (key) => Reflect.get(LEGACY_TOLARIA_APP_STORAGE_KEYS, key) as string,
  )
}

// Back-compat alias — older call sites may import this name.
export const copyLegacyTolariaAppStorageKeys = copyTolariaAppStorageKeys

type DREAMFORGEAppStorageKey = typeof DREAMFORGE_APP_STORAGE_KEYS

type ReadableStorageKey = TolariaMigratableStorageKey | LaputaMigratableStorageKey

export function getAppStorageItem(key: ReadableStorageKey): string | null {
  try {
    const dreamforgeKey = Reflect.get(DREAMFORGE_APP_STORAGE_KEYS, key) as string
    const tolariaKey = Reflect.get(LEGACY_TOLARIA_APP_STORAGE_KEYS, key) as string
    const laputaKey = Reflect.get(LEGACY_APP_STORAGE_KEYS, key) as string
    return (
      localStorage.getItem(dreamforgeKey) ??
      localStorage.getItem(tolariaKey) ??
      localStorage.getItem(laputaKey)
    )
  } catch {
    return null
  }
}
