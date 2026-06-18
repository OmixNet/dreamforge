import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'
import { SettingsBodyNav } from './SettingsBodyNav'
import { createTranslator } from '../lib/i18n'

/**
 * v0.3 PR 14: SettingsBodyNav slim-mode coverage.
 * Asserts that the AI Agents nav item is hidden when DREAMFORGE_SLIM_MODE
 * is true, and that the other entries (sync / workspaces / autogit /
 * appearance / vault content / workflow / privacy) remain visible.
 *
 * The default render is in slim mode (the test file lives under DREAMFORGE_SLIM_MODE
 * = true; the gate is verified at module-load). Non-slim rendering is
 * covered by SettingsPanel.test.tsx (which mocks DREAMFORGE_SLIM_MODE = false).
 */

describe('SettingsBodyNav (slim mode)', () => {
  it('flags that this test file runs in slim mode', () => {
    expect(DREAMFORGE_SLIM_MODE).toBe(true)
  })

  it('hides the AI Agents nav item in slim mode', () => {
    const t = createTranslator('en')
    const { container } = render(<SettingsBodyNav t={t} />)
    // The bot icon for AI Agents is rendered as part of the nav button — its
    // label is `t('settings.aiAgents.title')` which is "AI Agents" in English.
    expect(container.textContent).not.toContain('AI Agents')
  })

  it('keeps the other nav items visible in slim mode', () => {
    const t = createTranslator('en')
    render(<SettingsBodyNav t={t} />)
    // Spot-check a few of the surviving nav items. The SettingsBodyNav uses
    // `settings.sync.title` ("Sync & Updates"), `settings.workspaces.title`
    // ("Vaults"), etc. — i18n strings, not enum labels.
    expect(screen.getByText(/Sync/i)).toBeInTheDocument()
    expect(screen.getByText(/Vaults/i)).toBeInTheDocument()
    expect(screen.getByText(/Appearance/i)).toBeInTheDocument()
    expect(screen.getByText(/Workflow/i)).toBeInTheDocument()
    expect(screen.getByText(/Telemetry/i)).toBeInTheDocument()
    // PR 17: the Data section is always visible in slim mode (user data
    // backup, not AI residue).
    expect(screen.getByText(/^Data$/)).toBeInTheDocument()
  })
})
