import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'
import type { Settings } from '../types'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'

vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
}))

const emptySettings: Settings = {
  auto_pull_interval_minutes: null,
  git_enabled: null,
  autogit_enabled: null,
  autogit_idle_threshold_seconds: null,
  autogit_inactive_threshold_seconds: null,
  auto_advance_inbox_after_organize: null,
  telemetry_consent: null,
  crash_reporting_enabled: null,
  analytics_enabled: null,
  anonymous_id: null,
  release_channel: null,
  theme_mode: null,
  ui_language: null,
  date_display_format: null,
  default_ai_agent: null,
  hide_gitignored_files: null,
  all_notes_show_pdfs: null,
  all_notes_show_images: null,
  all_notes_show_unsupported: null,
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  })
}

describe('SettingsPanel (slim mode)', () => {
  beforeEach(() => {
    installMatchMedia()
    window.localStorage.clear()
  })

  it('runs with the shipped slim-mode flag', () => {
    expect(DREAMFORGE_SLIM_MODE).toBe(true)
  })

  it('shows API model providers while keeping local agent management hidden', () => {
    render(
      <SettingsPanel
        open={true}
        settings={emptySettings}
        onSave={() => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getAllByText('API models').length).toBeGreaterThan(0)
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add API model' })).toBeInTheDocument()
    expect(screen.queryByText('Recognized local agents')).toBeNull()
    expect(screen.queryByText('AI Agents')).toBeNull()
  })
})
