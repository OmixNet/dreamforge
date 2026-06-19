import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { createTranslator } from '../lib/i18n'
import { SectionHeading, SettingsGroup, SettingsGroupItem } from './SettingsControls'
import { Button } from './ui/button'

type Translate = ReturnType<typeof createTranslator>

interface DataSettingsSectionProps {
  t: Translate
  onSettingsReloaded: () => Promise<void> | void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; which: 'export' | 'import' }
  | { kind: 'success'; which: 'export' | 'import'; message: string }
  | { kind: 'error'; which: 'export' | 'import'; message: string }

function defaultExportFilename(): string {
  const now = new Date()
  const y = now.getFullYear().toString().padStart(4, '0')
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  return `dreamx-settings-${y}-${m}-${d}.json`
}

async function tauriCall<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri() ? invoke<T>(command, args) : mockInvoke<T>(command, args)
}

export function DataSettingsSection({ t, onSettingsReloaded }: DataSettingsSectionProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const runExport = useCallback(async () => {
    setStatus({ kind: 'busy', which: 'export' })
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const target = await save({
        defaultPath: defaultExportFilename(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (typeof target !== 'string' || target.length === 0) {
        setStatus({ kind: 'idle' })
        return
      }
      await tauriCall<number>('export_settings_to', { path: target })
      setStatus({ kind: 'success', which: 'export', message: target })
    } catch (err) {
      setStatus({
        kind: 'error',
        which: 'export',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  const runImport = useCallback(async () => {
    setStatus({ kind: 'busy', which: 'import' })
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const source = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (typeof source !== 'string' || source.length === 0) {
        setStatus({ kind: 'idle' })
        return
      }
      await tauriCall<unknown>('import_settings_from', { path: source })
      await onSettingsReloaded()
      setStatus({ kind: 'success', which: 'import', message: source })
    } catch (err) {
      setStatus({
        kind: 'error',
        which: 'import',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [onSettingsReloaded])

  const exporting = status.kind === 'busy' && status.which === 'export'
  const importing = status.kind === 'busy' && status.which === 'import'

  return (
    <>
      <SectionHeading title={t('settings.data.title')} />
      <SettingsGroup>
        <SettingsGroupItem testId="settings-data-description">
          <p className="text-sm text-muted-foreground">{t('settings.data.description')}</p>
        </SettingsGroupItem>
        <SettingsGroupItem testId="settings-data-export">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t('settings.data.exportButton')}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {t('settings.data.exportDescription')}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting || importing}
              onClick={runExport}
              data-testid="settings-data-export-button"
            >
              {exporting ? t('settings.data.exporting') : t('settings.data.exportButton')}
            </Button>
          </div>
        </SettingsGroupItem>
        <SettingsGroupItem testId="settings-data-import">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t('settings.data.importButton')}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {t('settings.data.importDescription')}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting || importing}
              onClick={runImport}
              data-testid="settings-data-import-button"
            >
              {importing ? t('settings.data.importing') : t('settings.data.importButton')}
            </Button>
          </div>
        </SettingsGroupItem>
        {status.kind === 'success' && (
          <SettingsGroupItem testId={`settings-data-${status.which}-success`}>
            <p
              className="text-xs leading-5 text-muted-foreground"
              data-testid={`settings-data-${status.which}-message`}
            >
              {status.which === 'export'
                ? t('settings.data.exportSuccess')
                : t('settings.data.importSuccess')}
              : <span className="ml-1 font-mono">{status.message}</span>
            </p>
          </SettingsGroupItem>
        )}
        {status.kind === 'error' && (
          <SettingsGroupItem testId={`settings-data-${status.which}-error`}>
            <p
              className="text-xs leading-5 text-destructive"
              data-testid={`settings-data-${status.which}-error-message`}
            >
              {status.which === 'export'
                ? t('settings.data.exportError')
                : t('settings.data.importError')}
              : <span className="ml-1 font-mono">{status.message}</span>
            </p>
          </SettingsGroupItem>
        )}
      </SettingsGroup>
    </>
  )
}
