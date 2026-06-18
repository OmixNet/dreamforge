import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DataSettingsSection } from './DataSettingsSection'

const dialogState: { save: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> } = {
  save: vi.fn(),
  open: vi.fn(),
}

vi.mock('../mock-tauri', () => ({
  isTauri: () => false,
  mockInvoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...args: unknown[]) => dialogState.save(...args),
  open: (...args: unknown[]) => dialogState.open(...args),
}))

function makeT(translate: (key: string) => string) {
  return ((key: string) => translate(key)) as never
}

describe('DataSettingsSection', () => {
  beforeEach(async () => {
    dialogState.save.mockReset()
    dialogState.open.mockReset()
    const { mockInvoke } = await import('../mock-tauri')
    vi.mocked(mockInvoke).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders title and both action buttons', () => {
    const t = makeT((key) => {
      const map: Record<string, string> = {
        'settings.data.title': 'Data',
        'settings.data.description': 'desc',
        'settings.data.exportButton': 'Export settings…',
        'settings.data.exportDescription': 'save json',
        'settings.data.importButton': 'Import settings…',
        'settings.data.importDescription': 'load json',
        'settings.data.exporting': 'Exporting…',
        'settings.data.importing': 'Importing…',
      }
      return map[key] ?? key
    })
    render(<DataSettingsSection t={t} onSettingsReloaded={vi.fn()} />)
    expect(screen.getByText('Data')).toBeInTheDocument()
    expect(screen.getByTestId('settings-data-export-button')).toHaveTextContent('Export settings…')
    expect(screen.getByTestId('settings-data-import-button')).toHaveTextContent('Import settings…')
  })

  it('exports to the user-selected path and reports success', async () => {
    const { mockInvoke } = await import('../mock-tauri')
    dialogState.save.mockResolvedValue('/tmp/dreamforge-test-export.json')
    vi.mocked(mockInvoke).mockResolvedValueOnce(123)
    const t = makeT((key) => {
      const map: Record<string, string> = {
        'settings.data.title': 'Data',
        'settings.data.description': 'desc',
        'settings.data.exportButton': 'Export settings…',
        'settings.data.exportDescription': 'save json',
        'settings.data.importButton': 'Import settings…',
        'settings.data.importDescription': 'load json',
        'settings.data.exporting': 'Exporting…',
        'settings.data.importing': 'Importing…',
        'settings.data.exportSuccess': 'Settings exported to',
        'settings.data.importSuccess': 'Settings imported from',
        'settings.data.exportError': 'Could not export:',
        'settings.data.importError': 'Could not import:',
      }
      return map[key] ?? key
    })
    render(<DataSettingsSection t={t} onSettingsReloaded={vi.fn()} />)
    const exportButton = screen.getByTestId('settings-data-export-button')
    await act(async () => {
      fireEvent.click(exportButton)
    })
    await waitFor(() => {
      expect(dialogState.save).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith('export_settings_to', { path: '/tmp/dreamforge-test-export.json' })
      expect(screen.getByTestId('settings-data-export-message')).toHaveTextContent('/tmp/dreamforge-test-export.json')
    })
  })

  it('imports from the user-selected path and triggers reload', async () => {
    const { mockInvoke } = await import('../mock-tauri')
    dialogState.open.mockResolvedValue('/tmp/incoming.json')
    vi.mocked(mockInvoke).mockResolvedValueOnce({})
    const reloaded = vi.fn()
    const t = makeT((key) => {
      const map: Record<string, string> = {
        'settings.data.title': 'Data',
        'settings.data.description': 'desc',
        'settings.data.exportButton': 'Export settings…',
        'settings.data.exportDescription': 'save json',
        'settings.data.importButton': 'Import settings…',
        'settings.data.importDescription': 'load json',
        'settings.data.exporting': 'Exporting…',
        'settings.data.importing': 'Importing…',
        'settings.data.exportSuccess': 'Settings exported to',
        'settings.data.importSuccess': 'Settings imported from',
        'settings.data.exportError': 'Could not export:',
        'settings.data.importError': 'Could not import:',
      }
      return map[key] ?? key
    })
    render(<DataSettingsSection t={t} onSettingsReloaded={reloaded} />)
    const importButton = screen.getByTestId('settings-data-import-button')
    await act(async () => {
      fireEvent.click(importButton)
    })
    await waitFor(() => {
      expect(dialogState.open).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith('import_settings_from', { path: '/tmp/incoming.json' })
      expect(reloaded).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('settings-data-import-message')).toHaveTextContent('/tmp/incoming.json')
    })
  })

  it('shows an inline error when import fails', async () => {
    const { mockInvoke } = await import('../mock-tauri')
    dialogState.open.mockResolvedValue('/tmp/broken.json')
    vi.mocked(mockInvoke).mockRejectedValueOnce(new Error('Invalid settings file: kind mismatch'))
    const t = makeT((key) => {
      const map: Record<string, string> = {
        'settings.data.title': 'Data',
        'settings.data.description': 'desc',
        'settings.data.exportButton': 'Export settings…',
        'settings.data.exportDescription': 'save json',
        'settings.data.importButton': 'Import settings…',
        'settings.data.importDescription': 'load json',
        'settings.data.exporting': 'Exporting…',
        'settings.data.importing': 'Importing…',
        'settings.data.exportSuccess': 'Settings exported to',
        'settings.data.importSuccess': 'Settings imported from',
        'settings.data.exportError': 'Could not export:',
        'settings.data.importError': 'Could not import:',
      }
      return map[key] ?? key
    })
    render(<DataSettingsSection t={t} onSettingsReloaded={vi.fn()} />)
    const importButton = screen.getByTestId('settings-data-import-button')
    await act(async () => {
      fireEvent.click(importButton)
    })
    await waitFor(() => {
      expect(screen.getByTestId('settings-data-import-error-message')).toHaveTextContent('Invalid settings file: kind mismatch')
    })
  })

  it('does nothing when the user cancels the save dialog', async () => {
    const { mockInvoke } = await import('../mock-tauri')
    dialogState.save.mockResolvedValue(null)
    const t = makeT((key) => {
      const map: Record<string, string> = {
        'settings.data.title': 'Data',
        'settings.data.description': 'desc',
        'settings.data.exportButton': 'Export settings…',
        'settings.data.exportDescription': 'save json',
        'settings.data.importButton': 'Import settings…',
        'settings.data.importDescription': 'load json',
        'settings.data.exporting': 'Exporting…',
        'settings.data.importing': 'Importing…',
      }
      return map[key] ?? key
    })
    render(<DataSettingsSection t={t} onSettingsReloaded={vi.fn()} />)
    const exportButton = screen.getByTestId('settings-data-export-button')
    await act(async () => {
      fireEvent.click(exportButton)
    })
    await waitFor(() => {
      expect(dialogState.save).toHaveBeenCalledTimes(1)
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })
})
