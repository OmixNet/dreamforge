import { useEffect, useId, useMemo, useState } from 'react'
import {
  DEFAULT_MODEL_CAPABILITIES,
  aiModelProviderCatalog,
  aiModelProviderCatalogEntry,
  configuredModelTargets,
  isLocalAiProvider,
  normalizeAiModelProviders,
  type AiModelApiKeyStorage,
  type AiModelProvider,
  type AiModelProviderKind,
} from '../lib/aiTargets'
import type { createTranslator } from '../lib/i18n'
import {
  deleteAiModelProviderApiKey,
  hasAiModelProviderApiKey,
  saveAiModelProviderApiKey,
} from '../utils/aiProviderSecrets'
import {
  readLlmApiKeyProviderIdPublic,
  writeLlmBaseUrl,
  writeLlmApiKeyEnv,
  writeLlmApiKeyProviderId,
  writeLlmModel,
  writeLlmProviderKind,
} from '../lib/dreamCliPath'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

// v0.5 PR 26 P2c-1: localStorage key for the active provider's env var NAME
// (not value) is `dreamforge.llmApiKeyEnv` — defined in src/lib/dreamCliPath.ts
// (PR 24 P2a) and re-exported via `readLlmApiKeyEnvPublic` /
// `writeLlmApiKeyEnv`. Set after save, cleared on delete if it matches.
// Picked up by DreamPanel at dream CLI invocation time to populate the
// `llm_api_key_env` Rust command arg (PR 24 P2a wiring).

function readActiveLlmApiKeyProviderId(): string {
  return readLlmApiKeyProviderIdPublic()
}

function writeActiveLlmApiKeyEnv(envName: string | null): void {
  // null or empty → clear
  if (!envName) {
    writeLlmApiKeyEnv('')
    return
  }
  writeLlmApiKeyEnv(envName)
}

function writeActiveLlmApiKeyProviderId(providerId: string | null): void {
  if (!providerId) {
    writeLlmApiKeyProviderId('')
    return
  }
  writeLlmApiKeyProviderId(providerId)
}

function clearActiveLlmApiKey(): void {
  writeActiveLlmApiKeyEnv(null)
  writeActiveLlmApiKeyProviderId(null)
  writeLlmProviderKind('')
}

// PR 44: dev/test-only escape hatch for the "local_file + key
// missing" UX. Setting this localStorage flag (e.g. via DevTools or
// a Playwright setup) makes AiProviderSettings treat all local_file
// providers as Keychain-not-configured, so the "Use this disabled +
// Add API key first" UX is testable without deleting a real
// Keychain item (which is high risk on production systems).
//
// Product code never writes this flag — it is a pure test fixture.
// The "dreamforge.dev." prefix is the convention for dev-only
// localStorage entries; product code can grep for that prefix to
// audit. The flag is checked once per useEffect run, no
// subscription / no listener, so toggling it at runtime requires a
// remount of the Settings panel (acceptable for the dev workflow).
const DEV_FORCE_KEYCHAIN_MISSING_STORAGE_KEY = 'dreamforge.dev.forceKeychainMissing'

type Translate = ReturnType<typeof createTranslator>
type ProviderMode = 'local' | 'api'

interface AiProviderSettingsProps {
  t: Translate
  mode: ProviderMode
  providers: AiModelProvider[]
  onChange: (providers: AiModelProvider[]) => void
}

interface ProviderDraft {
  kind: AiModelProviderKind
  name: string
  baseUrl: string
  modelId: string
  apiKeyStorage: AiModelApiKeyStorage
  apiKey: string
  apiKeyEnvVar: string
}

function providerKindsForMode(mode: ProviderMode): AiModelProviderKind[] {
  return aiModelProviderCatalog()
    .filter((entry) => entry.local === (mode === 'local'))
    .map((entry) => entry.kind)
}

function initialDraft(mode: ProviderMode): ProviderDraft {
  const [kind] = providerKindsForMode(mode)
  if (!kind) throw new Error(`No AI model providers are configured for ${mode} mode`)
  return draftFromProviderKind(kind)
}

function draftFromProviderKind(kind: AiModelProviderKind): ProviderDraft {
  const defaults = aiModelProviderCatalogEntry(kind)
  return {
    kind,
    name: defaults.name,
    baseUrl: defaults.base_url,
    // PR 40: pre-fill modelId with the catalog's recommended default so the
    // 4-step main flow has all 4 fields sensible without typing. User can
    // still override by editing.
    modelId: defaults.default_model_id,
    apiKeyStorage: defaults.api_key_storage,
    apiKey: '',
    apiKeyEnvVar: defaults.api_key_env_var ?? '',
  }
}

function providerKindOptions(mode: ProviderMode, t: Translate): Array<{ value: AiModelProviderKind; label: string }> {
  return providerKindsForMode(mode).map((kind) => {
    const defaults = aiModelProviderCatalogEntry(kind)
    return { value: kind, label: t(defaults.label_key) }
  })
}

function providerPresetPatch(kind: AiModelProviderKind, currentDraft: ProviderDraft): Pick<ProviderDraft, 'kind' | 'name' | 'baseUrl' | 'apiKeyStorage' | 'apiKeyEnvVar' | 'modelId'> {
  const defaults = draftFromProviderKind(kind)
  // PR 40: auto-fill modelId when user picks a new provider, BUT preserve
  // the user's typed value if they already customized it. The "untouched"
  // signal is: current modelId is empty OR matches the OLD provider's
  // catalog default. If the user typed something different, we keep it.
  const previousDefaults = aiModelProviderCatalogEntry(currentDraft.kind)
  const modelWasUnchanged =
    currentDraft.modelId.trim() === '' ||
    currentDraft.modelId === previousDefaults.default_model_id
  return {
    kind,
    name: defaults.name,
    baseUrl: defaults.baseUrl,
    apiKeyStorage: defaults.apiKeyStorage,
    apiKeyEnvVar: defaults.apiKeyEnvVar,
    modelId: modelWasUnchanged ? defaults.modelId : currentDraft.modelId,
  }
}

function buildProvider(draft: ProviderDraft, providerId: string): AiModelProvider {
  return {
    id: providerId,
    name: draft.name,
    kind: draft.kind,
    base_url: draft.baseUrl || null,
    api_key_storage: draft.apiKeyStorage,
    api_key_env_var: draft.apiKeyStorage === 'env' ? draft.apiKeyEnvVar || null : null,
    headers: null,
    models: [{
      id: draft.modelId,
      display_name: null,
      context_window: null,
      max_output_tokens: null,
      capabilities: DEFAULT_MODEL_CAPABILITIES,
    }],
  }
}

function providerModeTitle(mode: ProviderMode, t: Translate): string {
  return mode === 'local' ? t('settings.aiProviders.localTitle') : t('settings.aiProviders.apiTitle')
}

function providerModeDescription(mode: ProviderMode, t: Translate): string {
  return mode === 'local' ? t('settings.aiProviders.localDescription') : t('settings.aiProviders.apiDescription')
}

function DeleteProviderDialog({
  t,
  provider,
  onConfirm,
  onCancel,
}: {
  t: Translate
  provider: AiModelProvider | null
  onConfirm: () => void
  onCancel: () => void
}) {
  // PR 54.4: confirm dialog before destructive delete. Replaces
  // the previous single-click Remove → delete flow, which was too
  // easy to misfire on touchpad / small hit areas. Title includes
  // the provider name so the user sees exactly what they're about
  // to delete. Body explains the side effects (Keychain removal,
  // no file deletion) — important since some users might think
  // "delete" removes vault files.
  //
  // Returns null when no provider is pending so the dialog doesn't
  // render an empty shell. The parent's `pendingDelete` state is
  // the single source of truth for open/close.
  if (!provider) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent data-testid="ai-providers-delete-dialog">
        <DialogHeader>
          <DialogTitle>
            {t('settings.aiProviders.deleteConfirm.title', { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t('settings.aiProviders.deleteConfirm.message')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            data-testid="ai-providers-delete-cancel"
          >
            {t('settings.aiProviders.deleteConfirm.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            data-testid="ai-providers-delete-confirm"
          >
            {t('settings.aiProviders.deleteConfirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KeychainStatusDot({
  provider,
  keyConfigured,
  t,
}: {
  provider: AiModelProvider
  keyConfigured: boolean
  t: Translate
}) {
  // PR 54.3: at-a-glance status indicator for the Keychain /
  // env-var storage state. The dot color maps to the existing
  // storage label so this is a strict visual upgrade (no
  // behavior change, same text content).
  //
  //   - green dot + "Saved in macOS Keychain"  (local_file + configured)
  //   - red   dot + "Not in macOS Keychain"    (local_file + !configured)
  //   - amber dot + "key from {env}"            (env + env_var set)
  //   - red   dot + "No key"                    (env without var, or none)
  //
  // data-testid="ai-providers-keychain-dot-{id}" lets tests target
  // a specific provider's status without scanning the whole list.
  // data-state is the discrete machine-readable value
  // (configured / missing / env / none) for future assertions.
  let state: 'configured' | 'missing' | 'env' | 'none'
  let label: string
  if (provider.api_key_storage === 'local_file') {
    state = keyConfigured ? 'configured' : 'missing'
    label = keyConfigured
      ? t('settings.aiProviders.keyLocalSaved')
      : t('settings.aiProviders.keyLocalNotConfigured')
  } else if (provider.api_key_storage === 'env' && provider.api_key_env_var) {
    state = 'env'
    label = t('settings.aiProviders.keyEnvSaved', { env: provider.api_key_env_var })
  } else {
    state = 'none'
    label = t('settings.aiProviders.noKey')
  }
  const dotClass =
    state === 'configured'
      ? 'bg-emerald-500'
      : state === 'env'
      ? 'bg-amber-500'
      : 'bg-red-500'
  return (
    <span
      data-testid={`ai-providers-keychain-dot-${provider.id}`}
      data-state={state}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </span>
  )
}

function visibleProviders(providers: AiModelProvider[], mode: ProviderMode): AiModelProvider[] {
  return providers.filter((provider) => mode === 'local' ? isLocalAiProvider(provider) : !isLocalAiProvider(provider))
}

function editableInputClassName(): string {
  return 'border-border bg-background text-foreground placeholder:text-muted-foreground/65 shadow-xs'
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}) {
  const inputId = useId()

  return (
    <label htmlFor={inputId} className="space-y-1.5 text-xs font-medium text-foreground">
      <span>{label}</span>
      <Input
        id={inputId}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={editableInputClassName()}
      />
    </label>
  )
}

function ProviderKindSelect({
  mode,
  t,
  value,
  onChange,
}: {
  mode: ProviderMode
  t: Translate
  value: AiModelProviderKind
  onChange: (value: AiModelProviderKind) => void
}) {
  const triggerId = useId()

  return (
    <label htmlFor={triggerId} className="space-y-1.5 text-xs font-medium text-foreground">
      <span>{t('settings.aiProviders.kind')}</span>
      <Select value={value} onValueChange={(next) => onChange(next as AiModelProviderKind)}>
        <SelectTrigger id={triggerId} className={`h-9 ${editableInputClassName()}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerKindOptions(mode, t).map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function ApiKeyStorageFields({
  t,
  draft,
  updateDraft,
}: {
  t: Translate
  draft: ProviderDraft
  updateDraft: (patch: Partial<ProviderDraft>) => void
}) {
  // v0.6 PR 35: API key input lives in the main flow (top-level
  // `LabeledInput` with label "settings.aiProviders.key"). This
  // component renders the storage mode select and the env-var
  // input (only for `env` mode). The local_file mode in advanced
  // is just a mode selector — the actual key value comes from the
  // main-flow field. This eliminates the duplicate "API key" label
  // that would otherwise appear in both the main flow and the
  // advanced storage fields.
  const triggerId = useId()

  return (
    <>
      <label htmlFor={triggerId} className="space-y-1.5 text-xs font-medium text-foreground">
        <span>{t('settings.aiProviders.keyStorage')}</span>
        <Select value={draft.apiKeyStorage} onValueChange={(next) => updateDraft({ apiKeyStorage: next as AiModelApiKeyStorage })}>
          <SelectTrigger id={triggerId} className={`h-9 ${editableInputClassName()}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local_file">{t('settings.aiProviders.keyStorage.local')}</SelectItem>
            <SelectItem value="env">{t('settings.aiProviders.keyStorage.env')}</SelectItem>
            <SelectItem value="none">{t('settings.aiProviders.keyStorage.none')}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {draft.apiKeyStorage === 'env' ? (
        <LabeledInput
          label={t('settings.aiProviders.keyEnv')}
          value={draft.apiKeyEnvVar}
          onChange={(apiKeyEnvVar) => updateDraft({ apiKeyEnvVar })}
          placeholder={aiModelProviderCatalogEntry(draft.kind).api_key_env_var ?? ''}
        />
      ) : null}
    </>
  )
}

function BaseUrlV1Hint({
  t,
  kind,
  baseUrl,
}: {
  t: Translate
  kind: AiModelProviderKind
  baseUrl: string
}) {
  // PR 54.2: the /v1 rule applies to providers whose URL goes
  // through /v1/chat/completions. That's open_ai, open_router, and
  // open_ai_compatible (the dream CLI's OpenAICompatibleProvider
  // appends /v1/chat/completions to whatever base URL you give it).
  // Anthropic (/v1/messages) and Gemini (/v1beta/models/...:gener-
  // ateContent) use different URL paths, so we stay quiet for those
  // kinds to avoid showing a wrong hint.
  const V1_AWARE_KINDS = new Set<AiModelProviderKind>(['open_ai', 'open_router', 'open_ai_compatible'])
  if (!V1_AWARE_KINDS.has(kind)) return null
  if (!baseUrl) return null
  const endsWithV1 = /\/v1\/?$/.test(baseUrl)
  if (endsWithV1) {
    return (
      <p
        data-testid="ai-providers-baseurl-v1-warning"
        className="-mt-1 pl-1 text-xs leading-5 text-amber-700 dark:text-amber-300"
      >
        {t('settings.aiProviders.baseUrlV1Warning')}
      </p>
    )
  }
  return (
    <p
      data-testid="ai-providers-baseurl-hint"
      className="-mt-1 pl-1 text-xs leading-5 text-muted-foreground"
    >
      {t('settings.aiProviders.baseUrlHint')}
    </p>
  )
}

function ActiveProviderBanner({
  t,
  providerName,
  modelId,
  onClear,
}: {
  t: Translate
  providerName: string
  modelId: string
  onClear: () => void
}) {
  // PR 54: prominent "Active" indicator. Uses primary border + bg so
  // the user can't miss which provider DreamPanel reads from. The
  // Clear button unsets the active pointer in localStorage without
  // deleting the provider from settings.json — useful when the user
  // wants to temporarily fall back to Ollama or no-provider state.
  // role="status" + aria-label="settings.aiProviders.activeBanner"
  // keeps the banner findable by assistive tech without depending on
  // the visual treatment.
  return (
    <div
      role="status"
      aria-label={t('settings.aiProviders.activeBanner')}
      data-testid="ai-providers-active-banner"
      data-state="active"
      className="flex items-center justify-between gap-3 rounded-md border border-primary/50 bg-primary/10 px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
          <span aria-hidden="true">✓</span>
          <span>{t('settings.aiProviders.activeBanner')}</span>
        </div>
        {/* Provider name + model id are runtime data, not localized
            copy, so render them directly (not through t()). The i18n
            key `activeBannerBody` exists for users who want a
            fully-translated wrapper but isn't used here — the data
            itself is the source of truth. */}
        <div className="mt-1 truncate text-sm font-medium text-foreground">
          {providerName} · {modelId}
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        {t('settings.aiProviders.activeBannerClear')}
      </Button>
    </div>
  )
}

function ProviderList({
  t,
  mode,
  providers,
  keyConfiguredByProviderId,
  activeProviderId,
  onUseThis,
  onRequestDelete,
}: {
  t: Translate
  mode: ProviderMode
  providers: AiModelProvider[]
  keyConfiguredByProviderId: ReadonlyMap<string, boolean>
  activeProviderId: string | null
  onUseThis: (providerId: string) => void
  // PR 54.4: changed from onRemove(providerId) → onRequestDelete(provider).
  // We now pass the whole provider object so the dialog can show the
  // provider name in the title without a follow-up lookup. The actual
  // delete happens after the user confirms in the dialog.
  onRequestDelete: (provider: AiModelProvider) => void
}) {
  const visible = visibleProviders(providers, mode)
  if (visible.length === 0) {
    return <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">{t('settings.aiProviders.empty')}</div>
  }

  return (
    <div className="space-y-2">
      {configuredModelTargets(visible).map((target) => {
        const configured = keyConfiguredByProviderId.get(target.provider.id) ?? false
        // PR 40: show the provider kind label (e.g. "Anthropic" /
        // "Custom") so users can tell which protocol each saved provider
        // uses, not just the user-provided name. The catalog's
        // label_key resolves to the localized kind label per the
        // user's UI language.
        const kindLabel = t(aiModelProviderCatalogEntry(target.provider.kind).label_key)
        // PR 43: is this row the provider DreamPanel will actually use?
        // The active pointer lives in localStorage
        // (dreamforge.llmApiKeyProviderId, set by addProvider /
        // useThisProvider / cleared by removeProvider). Surface it
        // here so users know which entry DreamPanel reads from.
        const isActive = target.provider.id === activeProviderId
        // PR 43: Use this button is disabled for local_file providers
        // whose Keychain status hasn't been reported as configured
        // (poll result). Switching to a provider without a usable
        // key would break the next dream run, so block the action
        // and surface a hint.
        const useThisBlocked = target.provider.api_key_storage === 'local_file' && !configured
        return (
          <div key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {kindLabel}
                </span>
                <span className="truncate font-medium text-foreground">{target.label}</span>
                {/* PR 43: "Active" badge for the provider matching the
                    active pointer in localStorage. role="status" +
                    aria-label=i18n key makes it findable in tests
                    without depending on layout. */}
                {isActive ? (
                  <span
                    role="status"
                    aria-label={t('settings.aiProviders.active')}
                    className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                  >
                    {t('settings.aiProviders.active')}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 truncate text-xs text-muted-foreground">
                <span className="truncate">
                  {target.provider.base_url || t('settings.aiProviders.defaultEndpoint')}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/50">·</span>
                <KeychainStatusDot provider={target.provider} keyConfigured={configured} t={t} />
              </div>
              {/* PR 43: "Add API key first" hint under the row when
                  the Use this button is disabled. Sits next to the
                  base URL / storage label so the user sees it in the
                  same scan line as the missing-key indicator. */}
              {useThisBlocked ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {t('settings.aiProviders.addKeyFirst')}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {/* PR 43: Use this button only on non-active rows. The
                  click handler reads from the SAVED providers list,
                  not the form draft (see useThisProvider below). */}
              {!isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUseThis(target.provider.id)}
                  disabled={useThisBlocked}
                >
                  {t('settings.aiProviders.useThis')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => onRequestDelete(target.provider)}>
                {t('common.remove')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AiProviderSettings({ t, mode, providers, onChange }: AiProviderSettingsProps) {
  const [draft, setDraft] = useState<ProviderDraft>(() => initialDraft(mode))
  const [error, setError] = useState<string | null>(null)
  // PR 54.4: pendingDelete holds the provider awaiting confirmation.
  // null = no dialog open. The provider object (not just the id) is
  // stored so the dialog can show the provider name in the title
  // without a follow-up lookup. The dialog renders above everything
  // else; Escape / overlay click close it (onCancel fires).
  const [pendingDelete, setPendingDelete] = useState<AiModelProvider | null>(null)
  // PR 43: track which provider is "active" — i.e. the one
  // DreamPanel currently reads from localStorage (paired with
  // dreamforge.llmApiKeyEnv at dream CLI invocation time). Init
  // from localStorage so the badge renders correctly on mount.
  // Updated by addProvider / useThisProvider / removeProvider so
  // the badge refreshes synchronously after a click without waiting
  // for a remount.
  const [activeProviderId, setActiveProviderId] = useState<string | null>(
    () => readActiveLlmApiKeyProviderId() || null,
  )
  // PR 45: lookup the active provider + first model for the top
  // "In use" summary line. Recomputed whenever the active pointer
  // OR the providers list changes (useProvider adds / removes,
  // removeProvider filters). Returns null when nothing is active
  // (fresh install, just deleted the active one) so the summary
  // line hides itself instead of showing a stale name.
  const activeProviderConfig = useMemo(() => {
    if (!activeProviderId) return null
    const provider = providers.find((entry) => entry.id === activeProviderId)
    if (!provider) return null
    const model = provider.models[0]
    if (!model) return null
    return { provider, model }
  }, [activeProviderId, providers])
  // v0.5 PR 26 P2c-1: per-provider Keychain status map. Populated by polling
  // `has_ai_model_provider_api_key` for each configured provider so the UI
  // can show "configured" vs "not set" without ever receiving the KEY VALUE.
  const [keyConfiguredByProviderId, setKeyConfiguredByProviderId] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  )
  const updateDraft = (patch: Partial<ProviderDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const updateForm = (patch: Partial<ProviderDraft>) => {
    setError(null)
    updateDraft(patch)
  }
  const updateKind = (kind: AiModelProviderKind) => updateForm(providerPresetPatch(kind, draft))
  // v0.6 PR 35: name is OPTIONAL (it defaults to the catalog name and
  // can be overridden in Advanced). baseUrl is OPTIONAL (catalog default
  // is fine for most providers). modelId is REQUIRED. apiKey is REQUIRED
  // when storage mode is `local_file` (the simplified default).
  const canSave = draft.modelId.trim() && (draft.apiKeyStorage !== 'local_file' || draft.apiKey.trim())

  // Poll Keychain status for each configured provider on mount + whenever
  // the providers list changes. Status is a bool only — the KEY VALUE
  // is fetched by Rust and dropped immediately (PR 25 P2b invariant).
  //
  // Implementation note: the fetch is inlined inside useEffect (not via a
  // useCallback wrapper) so the eslint `react-hooks/set-state-in-effect`
  // rule sees setState only inside an async callback after `await`. The
  // rule's intent — "don't trigger cascading re-renders from synchronous
  // setState in the effect body" — is honored because the setState runs
  // after the IPC round-trip completes, not synchronously.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const visible = visibleProviders(providers, mode)
      const entries = await Promise.all(
        visible
          .filter((provider) => provider.api_key_storage === 'local_file')
          .map(async (provider) => [provider.id, await hasAiModelProviderApiKey(provider.id)] as const),
      )
      if (cancelled) return
      // PR 44: dev/test-only override. If the flag is set, treat all
      // local_file providers as not configured — independent of what
      // the real Keychain reports. The flag is a pure test fixture;
      // product code never writes it. Reading the flag at effect
      // time (not in a subscription) is fine because the dev workflow
      // is "set flag → reload Settings", not "toggle flag live".
      const forceMissing = window.localStorage.getItem(DEV_FORCE_KEYCHAIN_MISSING_STORAGE_KEY) === '1'
      const finalEntries = forceMissing
        ? entries.map(([id]) => [id, false] as const)
        : entries
      setKeyConfiguredByProviderId(new Map(finalEntries))
    })()
    return () => {
      cancelled = true
    }
  }, [providers, mode])

  const addProvider = async () => {
    const providerId = `${draft.kind}-${Date.now().toString(36)}`
    const provider = buildProvider(draft, providerId)
    setError(null)
    try {
      if (draft.apiKeyStorage === 'local_file') {
        await saveAiModelProviderApiKey(providerId, draft.apiKey)
      }
      // v0.5 PR 27 P2c-1.5: bridge BOTH env var NAME and provider id into
      // localStorage so DreamPanel passes them to `dreamvault_run`, which
      // uses the provider id to look up the API key in macOS Keychain.
      // The KEY VALUE never enters localStorage — only metadata.
      if ((draft.apiKeyStorage === 'local_file' || draft.apiKeyStorage === 'env') && draft.apiKeyEnvVar) {
        writeActiveLlmApiKeyEnv(draft.apiKeyEnvVar)
        writeActiveLlmApiKeyProviderId(providerId)
      } else {
        clearActiveLlmApiKey()
      }
      writeLlmProviderKind(provider.kind)
      writeLlmBaseUrl(provider.base_url ?? '')
      writeLlmModel(provider.models[0]?.id ?? '')
      onChange(normalizeAiModelProviders([...providers, provider]))
      // PR 43: a freshly added provider becomes the active one — the
      // user just configured it, that's what they'll run next.
      setActiveProviderId(providerId)
      setDraft((current) => ({ ...draftFromProviderKind(current.kind), name: current.name, baseUrl: current.baseUrl }))
      // useEffect re-polls status when `providers` updates above
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  // PR 43: switch the active pointer to an already-saved provider.
  // INVARIANT: this handler reads from the `providers` prop (the
  // SAVED list), NEVER from `draft` (the form state). The user might
  // be mid-edit on the form when they click Use this — picking up
  // the draft's env var / kind would mix unsaved edits into runtime
  // config and silently override settings the user hadn't committed.
  const useThisProvider = (providerId: string) => {
    const target = providers.find((provider) => provider.id === providerId)
    if (!target) return
    writeActiveLlmApiKeyProviderId(providerId)
    // Provider's env var is the source of truth for `llmApiKeyEnv`.
    // Empty string clears the pointer. env-mode without an env var
    // name on the provider is a config error in the saved list, but
    // we fall through to clearing rather than throwing so a stale
    // pointer can't block the click.
    writeActiveLlmApiKeyEnv(target.api_key_env_var || null)
    setActiveProviderId(providerId)
  }

  const removeProvider = async (providerId: string) => {
    setError(null)
    try {
      // Find the removed provider so we can clear the active env var
      // pointer from localStorage IF it pointed at this provider.
      const removed = providers.find((provider) => provider.id === providerId)
      await deleteAiModelProviderApiKey(providerId)
      onChange(providers.filter((provider) => provider.id !== providerId))
      if (removed && readActiveLlmApiKeyProviderId() === providerId) {
        // The removed provider WAS the active one — clear both pointers
        // so DreamPanel doesn't pass a dangling provider id to dreamvault_run.
        clearActiveLlmApiKey()
        // PR 43: also drop our local badge state so the badge moves
        // off the removed row immediately.
        setActiveProviderId(null)
      }
      // useEffect re-polls status when `providers` updates above
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div className="text-sm font-medium text-foreground">{providerModeTitle(mode, t)}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{providerModeDescription(mode, t)}</div>
      </div>
      {/* PR 54: prominent Active banner. Replaces the small 10px
          "Active" badge + muted "In use" summary with a card that
          uses primary border + bg, so the active provider is
          unmissable at a glance (per user backlog: "current active
          provider 更明显"). The Clear button lets the user unset
          the active pointer without deleting the provider — useful
          when switching to "no provider" state for testing or
          temporarily reverting to Ollama. Hides when nothing is
          active so fresh install / post-delete state doesn't show
          a stale name. */}
      {activeProviderConfig ? (
        <ActiveProviderBanner
          t={t}
          providerName={activeProviderConfig.provider.name}
          modelId={activeProviderConfig.model.id}
          onClear={() => {
            clearActiveLlmApiKey()
            setActiveProviderId(null)
          }}
        />
      ) : null}
      <ProviderList
        t={t}
        mode={mode}
        providers={providers}
        keyConfiguredByProviderId={keyConfiguredByProviderId}
        activeProviderId={activeProviderId}
        onUseThis={useThisProvider}
        onRequestDelete={setPendingDelete}
      />
      {/* v0.6 PR 35: simplified 4-step main flow. The 4 fields most
          users need (provider / base URL / model / API key) are
          always visible. Custom name + storage mode + env var
          collapse into <Advanced>, hidden by default to reduce
          cognitive load. */}
      <div className="space-y-3">
        <ProviderKindSelect mode={mode} t={t} value={draft.kind} onChange={updateKind} />
        <LabeledInput label={t('settings.aiProviders.baseUrl')} value={draft.baseUrl} onChange={(baseUrl) => updateForm({ baseUrl })} />
        {/* PR 54.2: Base URL /v1 hint. OpenAI-compatible providers go
            through the dream CLI's /v1/chat/completions path; if the
            user pastes a URL that already ends with /v1, dreamforge
            would double-append /v1 and hit /v1/v1/chat/completions
            (404). The hint is inline (right under the input) so the
            user sees it at the moment of typing. Anthropic + Gemini
            don't go through this path, so the hint is hidden for
            those kinds. The warning is destructive-amber; the
            helper is muted text. */}
        <BaseUrlV1Hint t={t} kind={draft.kind} baseUrl={draft.baseUrl} />
        <LabeledInput label={t('settings.aiProviders.model')} value={draft.modelId} onChange={(modelId) => updateForm({ modelId })} placeholder={aiModelProviderCatalogEntry(draft.kind).default_model_id} />
        {mode === 'api' ? (
          <>
            <LabeledInput
              label={t('settings.aiProviders.key')}
              value={draft.apiKey}
              onChange={(apiKey) => updateForm({ apiKey })}
              placeholder={t('settings.aiProviders.keyPlaceholder')}
              type="password"
            />
            {/* PR 40: inline helper directly under the API key input so
                users see the security guarantee right where they're
                typing the secret. Previously this was a small grey
                block at the bottom of the form (keySafetyLocal text)
                that was easy to miss. */}
            <p className="text-xs leading-5 text-muted-foreground -mt-1 pl-1">
              {t('settings.aiProviders.keySafetyLocal')}
            </p>
          </>
        ) : null}
      </div>
      <details className="rounded-md border border-border bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-foreground">
          {t('settings.aiProviders.advanced')}
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <LabeledInput label={t('settings.aiProviders.name')} value={draft.name} onChange={(name) => updateForm({ name })} />
          {mode === 'api' ? <ApiKeyStorageFields t={t} draft={draft} updateDraft={updateForm} /> : null}
        </div>
      </details>
      {mode === 'local' ? (
        <div className="text-xs leading-5 text-muted-foreground">
          {t('settings.aiProviders.localSafety')}
        </div>
      ) : null}
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => void addProvider()} disabled={!canSave}>
          {mode === 'local' ? t('settings.aiProviders.addLocal') : t('settings.aiProviders.addApi')}
        </Button>
        {/* v0.5 P2b scope discipline: HTTP smoke test deferred. Test
            button removed — no way to call the (non-existent)
            test_ai_model_provider tauri command from v0.5. */}
      </div>
      {/* PR 54.4: confirm dialog for provider delete. Rendered at the
          end of the component so it floats above everything (shadcn
          Dialog uses a portal). The dialog's open prop is derived from
          pendingDelete !== null — set by onRequestDelete, cleared by
          onCancel / onConfirm. The actual removeProvider call only
          fires after the user clicks Delete in the dialog, so an
          accidental Remove click is recoverable (form draft survives). */}
      <DeleteProviderDialog
        t={t}
        provider={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void removeProvider(pendingDelete.id)
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
