import { useId } from 'react'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'
import type { createTranslator } from '../lib/i18n'
import { SectionHeading, SettingsGroup, SettingsGroupItem } from './SettingsControls'
import { Checkbox } from './ui/checkbox'

type Translate = ReturnType<typeof createTranslator>

interface PrivacySettingsSectionProps {
  t: Translate
  crashReporting: boolean
  setCrashReporting: (value: boolean) => void
  analytics: boolean
  setAnalytics: (value: boolean) => void
}

function isChecked(checked: boolean | 'indeterminate'): boolean {
  return checked === true
}

function TelemetryToggle({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  testId: string
}) {
  const checkboxId = useId()

  return (
    <SettingsGroupItem testId={testId}>
      <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3">
        <Checkbox id={checkboxId} checked={checked} onCheckedChange={(value) => onChange(isChecked(value))} className="mt-0.5" />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
      </label>
    </SettingsGroupItem>
  )
}

export function PrivacySettingsSection({
  t,
  crashReporting,
  setCrashReporting,
  analytics,
  setAnalytics,
}: PrivacySettingsSectionProps) {
  // DREAMFORGE_SLIM: telemetry toggles (Sentry crash reporting + PostHog
  // analytics) are Tolaria features. The underlying hooks are kept so test
  // coverage is preserved, but the user-facing toggles are hidden in slim
  // mode. A short note replaces the toggles so the Privacy section still
  // makes sense as a destination in the side nav.
  return (
    <>
      <SectionHeading title={t('settings.privacy.title')} />
      <SettingsGroup>
        {DREAMFORGE_SLIM_MODE ? (
          <SettingsGroupItem testId="settings-privacy-slim-note">
            <p className="text-sm text-muted-foreground">
              {t('settings.privacy.slimNote')}
            </p>
          </SettingsGroupItem>
        ) : (
          <>
            <TelemetryToggle
              label={t('settings.privacy.crashReporting')}
              description={t('settings.privacy.crashReportingDescription')}
              checked={crashReporting}
              onChange={setCrashReporting}
              testId="settings-crash-reporting"
            />
            <TelemetryToggle
              label={t('settings.privacy.analytics')}
              description={t('settings.privacy.analyticsDescription')}
              checked={analytics}
              onChange={setAnalytics}
              testId="settings-analytics"
            />
          </>
        )}
      </SettingsGroup>
    </>
  )
}
