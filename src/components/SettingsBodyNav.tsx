import { Article, ArrowsClockwise as RefreshCw, Cube, Database, GitBranch, ListChecks, Palette, Robot as Bot, ShieldCheck, type IconProps } from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'
import type { TranslationKey } from '../lib/i18n'
import { Button } from './ui/button'
import { SETTINGS_SECTION_IDS } from './settingsSectionIds'

interface SettingsBodyNavProps {
  t: (key: TranslationKey) => string
}

interface SettingsNavItem {
  id: string
  label: string
  Icon: ComponentType<IconProps>
}

export function SettingsBodyNav({ t }: SettingsBodyNavProps) {
  // Slim mode hides agent/MCP surfaces but keeps API model providers visible
  // because DreamX needs them for the Dream CLI cloud LLM path.
  const items: SettingsNavItem[] = [
    { id: SETTINGS_SECTION_IDS.sync, label: t('settings.sync.title'), Icon: RefreshCw },
    { id: SETTINGS_SECTION_IDS.workspaces, label: t('settings.workspaces.title'), Icon: Cube },
    { id: SETTINGS_SECTION_IDS.autogit, label: t('settings.autogit.title'), Icon: GitBranch },
    { id: SETTINGS_SECTION_IDS.appearance, label: t('settings.appearance.title'), Icon: Palette },
    { id: SETTINGS_SECTION_IDS.content, label: t('settings.vaultContent.title'), Icon: Article },
    ...(DREAMFORGE_SLIM_MODE
      ? [{ id: SETTINGS_SECTION_IDS.ai, label: t('settings.aiProviders.apiTitle'), Icon: Bot } as const]
      : [{ id: SETTINGS_SECTION_IDS.ai, label: t('settings.aiAgents.title'), Icon: Bot } as const]),
    { id: SETTINGS_SECTION_IDS.workflow, label: t('settings.workflow.title'), Icon: ListChecks },
    { id: SETTINGS_SECTION_IDS.privacy, label: t('settings.privacy.title'), Icon: ShieldCheck },
    { id: SETTINGS_SECTION_IDS.data, label: t('settings.data.title'), Icon: Database },
  ]

  return (
    <div className="hidden w-60 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] px-3 py-4 md:block">
      <div className="sticky top-0 space-y-1">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start gap-2.5 px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-[var(--state-hover)] hover:text-foreground"
            onClick={() => document.getElementById(item.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          >
            <item.Icon size={16} weight="regular" className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
