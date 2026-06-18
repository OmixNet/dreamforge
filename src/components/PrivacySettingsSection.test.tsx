import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'
import { PrivacySettingsSection } from './PrivacySettingsSection'
import { createTranslator } from '../lib/i18n'

/**
 * v0.3 PR 14: PrivacySettingsSection slim-mode coverage.
 * In slim mode the crash-reporting / analytics toggles are replaced with a
 * single "slim mode disables telemetry" note.
 */

const t = createTranslator('en')

describe('PrivacySettingsSection (slim mode)', () => {
  it('flags that this test file runs in slim mode', () => {
    expect(DREAMFORGE_SLIM_MODE).toBe(true)
  })

  it('replaces the toggles with the slim-mode note', () => {
    render(
      <PrivacySettingsSection
        t={t}
        crashReporting={false}
        setCrashReporting={() => undefined}
        analytics={false}
        setAnalytics={() => undefined}
      />,
    )
    expect(screen.getByTestId('settings-privacy-slim-note')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-crash-reporting')).toBeNull()
    expect(screen.queryByTestId('settings-analytics')).toBeNull()
  })

  it('shows the slim note text in English', () => {
    render(
      <PrivacySettingsSection
        t={t}
        crashReporting={false}
        setCrashReporting={() => undefined}
        analytics={false}
        setAnalytics={() => undefined}
      />,
    )
    expect(screen.getByText(/Slim mode disables all telemetry/i)).toBeInTheDocument()
  })
})
