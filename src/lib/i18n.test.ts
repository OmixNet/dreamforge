import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  APP_LOCALES,
  EN_TRANSLATIONS,
  localeCatalogLocales,
  localeDisplayName,
  normalizeUiLanguagePreference,
  resolveEffectiveLocale,
  serializeUiLanguagePreference,
  translate,
} from './i18n'

describe('i18n', () => {
  it('uses supported system languages before falling back to English', () => {
    expect(resolveEffectiveLocale(null, ['zh-CN'])).toBe('zh-CN')
    expect(resolveEffectiveLocale(null, ['zh-TW'])).toBe('zh-TW')
    expect(resolveEffectiveLocale(null, ['es-MX'])).toBe('es-419')
    expect(resolveEffectiveLocale('system', ['fr-FR'])).toBe('fr-FR')
    expect(resolveEffectiveLocale('system', ['xx-ZZ'])).toBe('en')
  })

  it('normalizes current and legacy language preferences', () => {
    expect(normalizeUiLanguagePreference(' zh-cn ')).toBe('zh-CN')
    expect(normalizeUiLanguagePreference('zh-Hans')).toBe('zh-CN')
    expect(normalizeUiLanguagePreference('zh-Hant')).toBe('zh-TW')
    expect(normalizeUiLanguagePreference('zh-HK')).toBe('zh-TW')
    expect(normalizeUiLanguagePreference('fr-FR')).toBe('fr-FR')
    expect(normalizeUiLanguagePreference('auto')).toBe('system')
    expect(normalizeUiLanguagePreference('xx-ZZ')).toBeNull()
  })

  it('serializes system preference as the settings default', () => {
    expect(serializeUiLanguagePreference('system')).toBeNull()
    expect(serializeUiLanguagePreference('zh-Hans')).toBe('zh-CN')
    expect(serializeUiLanguagePreference('zh-Hant')).toBe('zh-TW')
  })

  it('keeps English locale metadata aligned with the locale registry', () => {
    expect(APP_LOCALES).toContain('zh-CN')
    expect(APP_LOCALES).toContain('zh-TW')
    expect(APP_LOCALES).toContain('ko-KR')
    expect(localeDisplayName('pt-BR', 'en')).toBe('Portuguese (Brazil)')
  })

  it('formats locale display names in the active language', () => {
    expect(localeDisplayName('zh-CN', 'zh-CN')).toBe('简体中文')
    expect(localeDisplayName('zh-TW', 'zh-TW')).toBe('繁體中文')
    expect(localeDisplayName('en', 'zh-CN')).toBe('英文')
    expect(localeDisplayName('es-419', 'en')).toBe('Spanish (Latin America)')
    expect(localeDisplayName('id-ID', 'id-ID')).toBe('Bahasa Indonesia')
    expect(localeDisplayName('uk-UA', 'uk-UA')).toBe('Українська')
    expect(localeDisplayName('sv-SE', 'sv-SE')).toBe('Svenska')
  })

  it('keeps locale label keys present in English', () => {
    expect(EN_TRANSLATIONS['locale.itIT']).toBe('Italian')
    expect(EN_TRANSLATIONS['locale.koKR']).toBe('Korean')
    expect(EN_TRANSLATIONS['locale.idID']).toBe('Indonesian')
    expect(EN_TRANSLATIONS['locale.ukUA']).toBe('Ukrainian')
    expect(EN_TRANSLATIONS['locale.svSE']).toBe('Swedish')
  })

  it('loads a translation catalog for every configured locale', () => {
    expect(localeCatalogLocales()).toEqual(APP_LOCALES)
  })

  it('drops English-only plural suffix values for non-English locales', () => {
    expect(translate('en', 'status.conflict.count', { count: 2, plural: 's' })).toBe('2 conflicts')
    expect(translate('zh-CN', 'status.conflict.count', { count: 2, plural: 's' })).toBe('2 个冲突')
    expect(translate('zh-TW', 'status.conflict.count', { count: 2, plural: 's' })).toBe('2 個衝突')
  })

  it('uses platform-neutral Chinese labels for revealing files and folders', () => {
    const revealKeys = ['sidebar.action.revealFolderMenu', 'editor.toolbar.revealFile'] as const

    for (const key of revealKeys) {
      expect(translate('zh-CN', key)).toBe('在文件管理器中显示')
      expect(translate('zh-CN', key)).not.toContain('访达')
      expect(translate('zh-TW', key)).toBe('在檔案管理器中顯示')
      expect(translate('zh-TW', key)).not.toContain('訪達')
    }
  })

  it('describes locally saved API keys as macOS Keychain storage', () => {
    const english = translate('en', 'settings.aiProviders.keySafetyLocal')
    const chinese = translate('zh-CN', 'settings.aiProviders.keySafetyLocal')

    expect(english).toContain('macOS Keychain')
    expect(english).not.toContain('local app data')
    expect(chinese).toContain('macOS 钥匙串')
    expect(chinese).not.toContain('本地应用数据')
  })

  // v0.6 PR 37a (copy polish): lock the macOS Keychain / 钥匙串
  // terminology across all user-facing strings. Regression guard for
  // "本地密钥" / "local key" / "Save locally in DreamX" residue that
  // misleads users about where their key actually lives.
  it('uses macOS Keychain terminology for all local-key user-facing strings (en)', () => {
    expect(translate('en', 'settings.aiProviders.keyLocalSaved'))
      .toContain('macOS Keychain')
    expect(translate('en', 'settings.aiProviders.keyLocalNotConfigured'))
      .toContain('macOS Keychain')
    expect(translate('en', 'settings.aiProviders.keyStorage.local'))
      .toContain('macOS Keychain')
    // None of the new strings should still use the old ambiguous "local key" /
    // "locally in DreamX" wording.
    expect(translate('en', 'settings.aiProviders.keyLocalSaved').toLowerCase())
      .not.toMatch(/\blocal key\b/)
    expect(translate('en', 'settings.aiProviders.keyLocalNotConfigured').toLowerCase())
      .not.toMatch(/\blocal key\b/)
    expect(translate('en', 'settings.aiProviders.keyStorage.local'))
      .not.toMatch(/locally in DreamX/i)
  })

  it('uses macOS 钥匙串 terminology for all local-key user-facing strings (zh-CN)', () => {
    expect(translate('zh-CN', 'settings.aiProviders.keyLocalSaved'))
      .toContain('macOS 钥匙串')
    expect(translate('zh-CN', 'settings.aiProviders.keyLocalNotConfigured'))
      .toContain('macOS 钥匙串')
    expect(translate('zh-CN', 'settings.aiProviders.keyStorage.local'))
      .toContain('macOS 钥匙串')
    // No English residue: the old "local key not set" English string was
    // leaking into zh-CN before this PR. Lock the fix.
    expect(translate('zh-CN', 'settings.aiProviders.keyLocalNotConfigured'))
      .not.toMatch(/local key/i)
    // And no legacy "本地密钥" wording — the canonical term is now
    // "macOS 钥匙串" since that's where the key actually lives (PR 25).
    expect(translate('zh-CN', 'settings.aiProviders.keyLocalSaved'))
      .not.toContain('本地密钥')
  })

  it('PR 37a: Advanced section is translated in zh-CN (not English residue)', () => {
    // Lock the fix: zh-CN had `advanced: "Advanced"` (English residue) before
    // this PR. The proper Chinese term is "高级设置". Other locales stay
    // English-placeholder for now (per the i18n pattern of partial
    // translations).
    expect(translate('zh-CN', 'settings.aiProviders.advanced'))
      .toBe('高级设置')
    expect(translate('zh-CN', 'settings.aiProviders.advanced'))
      .not.toMatch(/^[A-Za-z]/)  // not English
  })

  it('PR 37a: Custom provider dropdown label is localized (no "Custom provider" English residue in dropdown)', () => {
    // Lock the rename: open_ai_compatible dropdown now uses
    // settings.aiProviders.kind.custom (was kind.compatible). The label
    // value must be localized, not the English catalog name.
    expect(translate('en', 'settings.aiProviders.kind.custom')).toBe('Custom')
    expect(translate('zh-CN', 'settings.aiProviders.kind.custom')).toBe('自定义')
    expect(translate('zh-TW', 'settings.aiProviders.kind.custom')).toBe('自訂')
    expect(translate('ja-JP', 'settings.aiProviders.kind.custom')).toBe('カスタム')
  })

  it('keeps every locale’s key set in lockstep with English (v0.3.1 i18n guard)', () => {
    // Each locale file must have the exact same set of translation keys as
    // en.json — the source of truth. A new key in en.json without matching
    // translations falls back to the English template, which is fine for
    // graceful degradation but a CI signal that translations are lagging.
    // This test catches silent drift across the 20 locale files.
    const enKeys = new Set(Object.keys(EN_TRANSLATIONS))
    const localesDir = join(__dirname, 'locales')
    const knownFiles = new Set(readdirSync(localesDir))
    for (const locale of localeCatalogLocales()) {
      expect(knownFiles.has(`${locale}.json`), `locale file missing for ${locale}`).toBe(true)
      const raw = readFileSync(join(localesDir, `${locale}.json`), 'utf-8')
      const data = JSON.parse(raw) as Record<string, string>
      const localeKeys = new Set(Object.keys(data))
      const missing = [...enKeys].filter((k) => !localeKeys.has(k))
      const extra = [...localeKeys].filter((k) => !enKeys.has(k))
      expect(missing, `locale ${locale} missing keys: ${missing.join(', ')}`).toEqual([])
      expect(extra, `locale ${locale} has extra keys: ${extra.join(', ')}`).toEqual([])
    }
  })
})
