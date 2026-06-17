import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { VaultSettingsSection } from './VaultSettingsSection'
import type { VaultOption } from './status-bar/types'

/**
 * v0.3 PR 12: targeted unit tests for the PR 11.5 Settings → Vault section.
 * Covers list rendering, Active highlight, Remove button, error path.
 */

const vaults: VaultOption[] = [
  { label: 'Personal', path: '/Users/biomatrix/personal' },
  { label: 'Work', path: '/Users/biomatrix/work' },
]

describe('VaultSettingsSection', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders all vaults with their folder names', () => {
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={vi.fn()}
        onRemoveVault={vi.fn()}
      />,
    )
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('shows the Active badge on the active vault only', () => {
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={vi.fn()}
        onRemoveVault={vi.fn()}
      />,
    )
    const activeBadges = screen.getAllByTestId('settings-vault-section-active-badge')
    expect(activeBadges).toHaveLength(1)
    // The badge is inside the personal vault's list item
    const personalItem = screen.getByTestId(`settings-vault-section-item-${vaults[0].path}`)
    expect(personalItem).toHaveAttribute('data-active', 'true')
    const workItem = screen.getByTestId(`settings-vault-section-item-${vaults[1].path}`)
    expect(workItem).toHaveAttribute('data-active', 'false')
  })

  it('disables Remove on the active vault (cannot remove currently-open vault)', () => {
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={vi.fn()}
        onRemoveVault={vi.fn()}
      />,
    )
    const personalRemove = screen.getByTestId(`settings-vault-section-remove-${vaults[0].path}`)
    expect(personalRemove).toBeDisabled()
    const workRemove = screen.getByTestId(`settings-vault-section-remove-${vaults[1].path}`)
    expect(workRemove).toBeEnabled()
  })

  it('calls onRemoveVault when Remove is clicked on a non-active vault', () => {
    const onRemoveVault = vi.fn()
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={vi.fn()}
        onRemoveVault={onRemoveVault}
      />,
    )
    const workRemove = screen.getByTestId(`settings-vault-section-remove-${vaults[1].path}`)
    fireEvent.click(workRemove)
    expect(onRemoveVault).toHaveBeenCalledWith(vaults[1].path)
  })

  it('renders an empty-state message when there are no vaults', () => {
    render(
      <VaultSettingsSection
        vaults={[]}
        activeVaultPath={null}
        onAddVault={vi.fn()}
        onRemoveVault={vi.fn()}
      />,
    )
    expect(screen.getByText(/No vaults yet/)).toBeInTheDocument()
  })

  it('calls pickFolder + onAddVault when Add vault is clicked', async () => {
    // mock-tauri: pickFolder uses window.prompt in browser mode and reads it
    vi.spyOn(window, 'prompt').mockReturnValue('/Users/biomatrix/new-vault')
    const onAddVault = vi.fn()
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={onAddVault}
        onRemoveVault={vi.fn()}
      />,
    )
    const addButton = screen.getByTestId('settings-vault-section-add')
    fireEvent.click(addButton)
    await waitFor(() => {
      expect(onAddVault).toHaveBeenCalledWith('/Users/biomatrix/new-vault', 'new-vault')
    })
  })

  it('displays an error message when the folder picker throws', async () => {
    // In Tauri mode, the folder picker can throw (e.g. macOS TCC blocks).
    // Force the Tauri path to exercise the error branch.
    vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('user denied folder access')
    })
    render(
      <VaultSettingsSection
        vaults={vaults}
        activeVaultPath={vaults[0].path}
        onAddVault={vi.fn()}
        onRemoveVault={vi.fn()}
      />,
    )
    const addButton = screen.getByTestId('settings-vault-section-add')
    fireEvent.click(addButton)
    await waitFor(() => {
      expect(screen.getByText(/user denied folder access/)).toBeInTheDocument()
    })
  })
})
