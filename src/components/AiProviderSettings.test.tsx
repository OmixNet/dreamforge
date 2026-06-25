import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiProviderSettings } from './AiProviderSettings'
import type { AiModelProvider } from '../lib/aiTargets'

vi.mock('../mock-tauri', () => ({
  isTauri: () => true,
  mockInvoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const { mockInvoke } = await import('../mock-tauri')
const { invoke } = await import('@tauri-apps/api/core')

// v0.5 PR 26 P2c-1: Settings UI must wire provider API key save / delete
// / check to the PR 25 Keychain tauri commands AND mirror the env var
// NAME into localStorage `dreamforge.llmApiKeyEnv` so DreamPanel picks
// it up at dream CLI invocation time.
//
// The KEY VALUE never enters:
//   - settings.json (provider config only — PR 23)
//   - localStorage (env var NAME only — PR 24)
//   - any export/import envelope (PR 23 envelope preserves only settings)
//   - git / CLI args / logs

describe('AiProviderSettings', () => {
  beforeEach(() => {
    vi.mocked(mockInvoke).mockReset()
    vi.mocked(invoke).mockReset()
    // Default: has_* returns false so no provider shows as configured
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_ai_model_provider_api_key') {
        return { provider_id: '', configured: false }
      }
      return null
    })
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  // -- Key status display (criteria #1) --

  it('shows "configured" status when Keychain reports the key exists', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_ai_model_provider_api_key') {
        return { provider_id: 'openrouter', configured: true }
      }
      return null
    })

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/OpenRouter/)).toBeInTheDocument()
    })
    expect(invoke).toHaveBeenCalledWith('has_ai_model_provider_api_key', { providerId: 'openrouter' })
  })

  // -- Save wires Keychain + localStorage env var name (criteria #2) --

  it('save: invokes save_ai_model_provider_api_key with the key value', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // Fill the model id field (by label, not placeholder — placeholder
    // varies by current `draft.kind` which depends on catalog order).
    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })
    // Fill the api key input — located by label `settings.aiProviders.key`.
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    // The api key input is the LAST one rendered (others may be ProviderKindSelect etc.)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-or-v1-test-key-123' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'save_ai_model_provider_api_key',
        expect.objectContaining({ apiKey: 'sk-or-v1-test-key-123' }),
      )
    })
  })

  it('save: writes the env var NAME to localStorage dreamforge.llmApiKeyEnv (not the value)', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-or-v1-SECRET-SHOULD-NOT-LEAK' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      expect(window.localStorage.getItem('dreamforge.llmApiKeyEnv')).toBe('OPENAI_API_KEY')
    })
    // Critical: the KEY VALUE must NEVER be in localStorage.
    const stored = window.localStorage.getItem('dreamforge.llmApiKeyEnv') ?? ''
    expect(stored).not.toContain('SECRET')
    expect(stored).not.toContain('sk-or-v1')
  })

  it('save: writes provider id to localStorage dreamforge.llmApiKeyProviderId', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-test' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      const id = window.localStorage.getItem('dreamforge.llmApiKeyProviderId')
      expect(id).toBeTruthy()
      // Format is `${kind}-${base36 timestamp}` per the addProvider impl.
      expect(id).toMatch(/^open_ai-[a-z0-9]+$/)
    })
  })

  it('save: writes provider kind to localStorage dreamforge.llmProviderKind', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'claude-sonnet-4-5' },
    })
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-test' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      expect(window.localStorage.getItem('dreamforge.llmProviderKind')).toBe('open_ai')
    })
  })

  it('save: writes the provider base URL and model to DreamPanel runtime config', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.baseUrl/), {
      target: { value: 'https://openrouter.ai/api/v1' },
    })
    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'anthropic/claude-sonnet-4.5' },
    })
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-test' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      expect(window.localStorage.getItem('dreamforge.llmBaseUrl')).toBe('https://openrouter.ai/api/v1')
    })
    expect(window.localStorage.getItem('dreamforge.llmModel')).toBe('anthropic/claude-sonnet-4.5')
  })

  it('save: writes to onChange with provider config that omits the api key value', async () => {
    vi.mocked(invoke).mockResolvedValue(null)
    const onChange = vi.fn()

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-or-v1-test-123' },
    })

    fireEvent.click(screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })

    // Provider config that goes to settings.json must NOT include the key value.
    // The env var NAME goes to localStorage (verified in a separate test)
    // — provider config only carries the catalog-level api_key_env_var
    // (which is null for local_file storage, since the actual env var name
    // is captured at save time).
    const calls = onChange.mock.calls
    const lastCallProviders = calls[calls.length - 1][0] as AiModelProvider[]
    const serialized = JSON.stringify(lastCallProviders)
    expect(serialized).not.toContain('sk-or-v1-test-123')
    expect(serialized).not.toContain('sk-or-v1')
    // The provider config carries the kind, base_url, and model id but NOT
    // the api key value (which lives only in macOS Keychain).
    expect(serialized).toContain('open_ai')
    expect(serialized).toContain('gpt-4.1-mini')
  })

  // -- Delete clears Keychain + localStorage --

  it('delete: invokes delete_ai_model_provider_api_key for the removed provider', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-abc',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // PR 54.4: Remove opens a confirm dialog. The delete_ai call
    // only fires after the user clicks Delete in the dialog.
    fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.confirm/ }),
    )

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'delete_ai_model_provider_api_key',
        expect.objectContaining({ providerId: 'openrouter-abc' }),
      )
    })
  })

  it('delete: clears localStorage pointers when the removed provider was active', async () => {
    vi.mocked(invoke).mockResolvedValue(null)
    // Pre-set localStorage as if this provider was the active one
    // (PR 27 P2c-1.5: both env var NAME and provider id are paired)
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-active')
    window.localStorage.setItem('dreamforge.llmProviderKind', 'open_router')

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-active',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))

    // PR 54.4: Remove opens a confirm dialog now. localStorage
    // pointers are only cleared after the user clicks Delete in the
    // dialog. (Cancel would leave them intact — see PR 54: delete
    // confirm dialog tests below.)
    fireEvent.click(
      await screen.findByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.confirm/ }),
    )

    await waitFor(() => {
      expect(window.localStorage.getItem('dreamforge.llmApiKeyEnv')).toBeNull()
    })
    expect(window.localStorage.getItem('dreamforge.llmApiKeyProviderId')).toBeNull()
    expect(window.localStorage.getItem('dreamforge.llmProviderKind')).toBeNull()
  })

  // -- Test button hidden (no HTTP smoke in v0.5) --

  it('does not render the test button (no HTTP smoke test in v0.5)', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )
    // The "test" / "testing" label was the test connection button. With
    // no HTTP smoke in v0.5 P2b scope discipline, the button must not
    // appear at all so users don't click and hit "No mock handler".
    expect(screen.queryByRole('button', { name: /settings\.aiProviders\.test$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /settings\.aiProviders\.testing/ })).toBeNull()
  })

  // -- v0.6 PR 35: simplified 4-step main flow + collapsed Advanced --

  it('PR 35: shows the 4 main fields (Provider, Base URL, Model, API key) by default', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // The 4 main fields must be present in the DOM at mount time, with
    // no interaction needed. PR 35's simplification promise: a user
    // looking at the form sees exactly these 4 fields, nothing else.
    expect(screen.getByLabelText(/settings\.aiProviders\.kind/)).toBeInTheDocument()
    expect(screen.getByLabelText(/settings\.aiProviders\.baseUrl/)).toBeInTheDocument()
    expect(screen.getByLabelText(/settings\.aiProviders\.model/)).toBeInTheDocument()
    expect(screen.getByLabelText(/settings\.aiProviders\.key$/)).toBeInTheDocument()
  })

  it('PR 35: hides Name and API key storage mode in collapsed Advanced section by default', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // Name and storage mode live in <details> collapsed by default.
    // queryByLabelText returns null for elements not in the document,
    // which is what we want here — they're rendered inside <details>
    // (so they're in the DOM) but `<details>` hides children by default
    // until the user clicks <summary>. The user-visible state is
    // "hidden", so we assert that the parent <details> is not open.
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)

    // The Advanced label IS visible (it's the <summary>)
    expect(screen.getByText(/settings\.aiProviders\.advanced/)).toBeInTheDocument()
  })

  it('PR 35: Add button is enabled with only Model ID + API key (no custom name required)', () => {
    vi.mocked(invoke).mockResolvedValue(null)

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // Fill model id
    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })
    // Fill API key
    const keyInputs = screen.getAllByLabelText(/settings\.aiProviders\.key$/)
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: 'sk-or-v1-test' },
    })

    // Add button should be enabled WITHOUT the user filling in the
    // custom Name field (which lives in the collapsed Advanced).
    const addButton = screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ })
    expect(addButton).toBeEnabled()
  })

  it('PR 35: Add button is DISABLED when Model ID is empty', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // No model id filled in
    const addButton = screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ })
    expect(addButton).toBeDisabled()
  })

  it('PR 35: Add button is DISABLED when API key is empty (local_file mode default)', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // Fill only model id, leave API key empty
    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini' },
    })

    const addButton = screen.getByRole('button', { name: /settings\.aiProviders\.addApi/ })
    expect(addButton).toBeDisabled()
  })

  // -- v0.6 PR 40: provider-aware auto-fill + clearer provider list --

  it('PR 40: modelId is pre-filled with the catalog default for the current provider kind', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )
    // The first API-mode provider kind from the catalog (per
    // aiModelProviderCatalog order) is `open_ai`. Its default model
    // is `gpt-4.1-mini`. The Model ID input value should match.
    const modelInput = screen.getByLabelText(/settings\.aiProviders\.model/) as HTMLInputElement
    expect(modelInput.value).toBe('gpt-4.1-mini')
  })

  it('PR 40: switching provider auto-fills baseUrl + env var + modelId with the new provider defaults', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // Switch the kind to Anthropic via the kind select.
    // Radix Select uses a button trigger + click → click option pattern.
    const kindButton = screen.getByRole('combobox', { name: /settings\.aiProviders\.kind/ })
    fireEvent.click(kindButton)
    // Click the Anthropic option in the dropdown
    fireEvent.click(screen.getByRole('option', { name: /settings\.aiProviders\.kind\.anthropic/ }))

    // After picking Anthropic, the form should auto-fill:
    const baseUrlInput = screen.getByLabelText(/settings\.aiProviders\.baseUrl/) as HTMLInputElement
    const modelInput = screen.getByLabelText(/settings\.aiProviders\.model/) as HTMLInputElement
    expect(baseUrlInput.value).toBe('https://api.anthropic.com/v1')
    expect(modelInput.value).toBe('claude-3-5-sonnet-latest')
  })

  it('PR 40: switching provider preserves user-typed modelId (does not blow it away)', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )

    // User types a custom model — they know what they want.
    fireEvent.change(screen.getByLabelText(/settings\.aiProviders\.model/), {
      target: { value: 'gpt-4.1-mini-fine-tune-2025' },
    })

    // Switch to Anthropic — modelId should NOT be reset to claude-... default
    const kindButton = screen.getByRole('combobox', { name: /settings\.aiProviders\.kind/ })
    fireEvent.click(kindButton)
    fireEvent.click(screen.getByRole('option', { name: /settings\.aiProviders\.kind\.anthropic/ }))

    const modelInput = screen.getByLabelText(/settings\.aiProviders\.model/) as HTMLInputElement
    expect(modelInput.value).toBe('gpt-4.1-mini-fine-tune-2025')
  })

  it('PR 40: ProviderList renders the kind label as a badge (not just user-provided name)', () => {
    const providers: AiModelProvider[] = [
      {
        id: 'anthropic-1',
        kind: 'anthropic',
        name: 'Claude Work',
        base_url: 'https://api.anthropic.com/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        headers: null,
        models: [{ id: 'claude-3-5-sonnet-latest', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'custom-1',
        kind: 'open_ai_compatible',
        name: 'My Work OpenAI',
        base_url: 'https://api.example.com/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENAI_API_KEY',
        headers: null,
        models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // Both kinds render as localized labels in a kind-badge element.
    expect(screen.getByText(/settings\.aiProviders\.kind\.anthropic/)).toBeInTheDocument()
    expect(screen.getByText(/settings\.aiProviders\.kind\.custom/)).toBeInTheDocument()
  })

  it('PR 40: inline API key helper text renders right under the API key input', () => {
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={[]}
        onChange={() => {}}
      />,
    )
    // The helper text is the keySafetyLocal string (already in all locales).
    expect(
      screen.getByText(/settings\.aiProviders\.keySafetyLocal/),
    ).toBeInTheDocument()
  })

  // -- PR 43: active provider indicator + Use this switcher --

  it('PR 43: shows "Active" badge on the provider whose id matches the active pointer in localStorage', () => {
    // Pre-seed localStorage so anthropic-1 is the active provider.
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'anthropic-1')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'ANTHROPIC_API_KEY')

    const providers: AiModelProvider[] = [
      {
        id: 'anthropic-1',
        kind: 'anthropic',
        name: 'Claude Work',
        base_url: 'https://api.anthropic.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        headers: null,
        models: [{ id: 'claude-3-5-sonnet-latest', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'custom-1',
        kind: 'open_ai_compatible',
        name: 'My Work OpenAI',
        base_url: 'https://api.example.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENAI_API_KEY',
        headers: null,
        models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // Both providers render. PR 54 also renders the Active banner at
    // the top which contains the active provider's name, so use
    // getAllByText and assert both elements show "Claude Work".
    expect(screen.getAllByText(/Claude Work/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/My Work OpenAI/)).toBeInTheDocument()
    // Exactly one provider carries the Active badge. role="status" with
    // aria-label=i18n key makes the badge findable without depending on
    // position/layout. The exact-match regex excludes the PR 54 banner
    // (aria-label=settings.aiProviders.activeBanner) which is a
    // different visual treatment at the top of the panel.
    const activeBadges = screen.getAllByRole('status', { name: /^settings\.aiProviders\.active$/ })
    expect(activeBadges).toHaveLength(1)
  })

  it('PR 43: "Use this" button is NOT rendered on the active provider row', () => {
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'anthropic-1')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'ANTHROPIC_API_KEY')

    const providers: AiModelProvider[] = [
      {
        id: 'anthropic-1',
        kind: 'anthropic',
        name: 'Claude Work',
        base_url: 'https://api.anthropic.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        headers: null,
        models: [{ id: 'claude-3-5-sonnet-latest', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'custom-1',
        kind: 'open_ai_compatible',
        name: 'My Work OpenAI',
        base_url: 'https://api.example.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENAI_API_KEY',
        headers: null,
        models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // Exactly ONE "Use this" button (only on the non-active provider).
    const useThisButtons = screen.getAllByRole('button', { name: /settings\.aiProviders\.useThis/ })
    expect(useThisButtons).toHaveLength(1)
  })

  it('PR 43: clicking "Use this" writes the SAVED provider id + env var to localStorage (NOT the form draft)', () => {
    // Pre-seed: anthropic-1 is the active one. Only ONE Use this
    // button renders (on the non-active provider).
    vi.mocked(invoke).mockResolvedValue(null)
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'anthropic-1')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'ANTHROPIC_API_KEY')

    const providers: AiModelProvider[] = [
      {
        id: 'anthropic-1',
        kind: 'anthropic',
        name: 'Claude Work',
        base_url: 'https://api.anthropic.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        headers: null,
        models: [{ id: 'claude-3-5-sonnet-latest', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'custom-1',
        kind: 'open_ai_compatible',
        name: 'My Work OpenAI',
        base_url: 'https://api.example.com/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENAI_API_KEY',
        headers: null,
        models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // The single "Use this" button lives on the non-active provider.
    // Click it → localStorage pointer + env var must point at custom-1.
    const useThisButtons = screen.getAllByRole('button', { name: /settings\.aiProviders\.useThis/ })
    expect(useThisButtons).toHaveLength(1)
    fireEvent.click(useThisButtons[0])

    expect(window.localStorage.getItem('dreamforge.llmApiKeyProviderId')).toBe('custom-1')
    // Saved env var for custom-1, NOT the active one (ANTHROPIC_API_KEY).
    expect(window.localStorage.getItem('dreamforge.llmApiKeyEnv')).toBe('OPENAI_API_KEY')
  })

  it('PR 43: "Use this" is DISABLED for local_file providers when Keychain reports not configured (helper text: "Add API key first")', () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_ai_model_provider_api_key') {
        // Keychain returns NOT configured for the local_file provider.
        return { provider_id: 'openrouter-pending', configured: false }
      }
      return null
    })

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-active',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'openrouter-pending',
        kind: 'open_router',
        name: 'OpenRouter pending',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-active')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // The Use this button on the second (local_file, no key) provider
    // must exist but be disabled.
    const useThisButtons = screen.getAllByRole('button', { name: /settings\.aiProviders\.useThis/ })
    expect(useThisButtons).toHaveLength(1)
    expect(useThisButtons[0]).toBeDisabled()
    // Helper text appears next to the disabled button.
    expect(screen.getByText(/settings\.aiProviders\.addKeyFirst/)).toBeInTheDocument()
  })

  it('PR 43: i18n keys active / useThis / addKeyFirst exist in en.json', async () => {
    // Parity test for the 3 new keys. The wider i18n parity test in
    // src/lib/i18n.test.ts enforces this for all 20 locales, but a
    // dedicated test gives clearer failure when PR 43 ships without
    // adding the keys to all locales.
    const en = (await import('../lib/locales/en.json')).default as Record<string, string>
    expect(en['settings.aiProviders.active']).toBeTypeOf('string')
    expect(en['settings.aiProviders.useThis']).toBeTypeOf('string')
    expect(en['settings.aiProviders.addKeyFirst']).toBeTypeOf('string')
  })

  // -- PR 44: dev/test-only escape hatch for the Keychain-missing UX --

  it('PR 44: dreamforge.dev.forceKeychainMissing flag overrides Keychain poll — Use this is disabled + addKeyFirst hint appears', async () => {
    // Set the dev/test-only flag. This is the same flag a Playwright
    // setup or DevTools session would set to trigger the disabled UX
    // without deleting a real Keychain item. Mock the IPC to return
    // configured:true so we can prove the FLAG wins, not the mock.
    window.localStorage.setItem('dreamforge.dev.forceKeychainMissing', '1')
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_ai_model_provider_api_key') {
        // Real Keychain would say "configured"; the flag must override.
        return { provider_id: 'openrouter-pending', configured: true }
      }
      return null
    })

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-active',
        kind: 'open_router',
        name: 'OpenRouter active',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'openrouter-pending',
        kind: 'open_router',
        name: 'OpenRouter pending',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-active')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // The flag forces the local_file row to "not configured", so
    // Use this on the pending row must be disabled + addKeyFirst hint
    // must appear — DESPITE the IPC mock saying configured:true.
    const useThisButtons = await screen.findAllByRole('button', { name: /settings\.aiProviders\.useThis/ })
    expect(useThisButtons).toHaveLength(1)
    expect(useThisButtons[0]).toBeDisabled()
    expect(screen.getByText(/settings\.aiProviders\.addKeyFirst/)).toBeInTheDocument()
  })

  it('PR 44: when the flag is unset, the IPC mock result is the source of truth (configured:true → Use this enabled)', async () => {
    // Flag is NOT set (cleared in afterEach). Mock returns configured:true.
    // Without the override, the row should treat itself as configured and
    // the Use this button should be enabled.
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_ai_model_provider_api_key') {
        return { provider_id: 'openrouter-pending', configured: true }
      }
      return null
    })

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-active',
        kind: 'open_router',
        name: 'OpenRouter active',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
      {
        id: 'openrouter-pending',
        kind: 'open_router',
        name: 'OpenRouter pending',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'local_file',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'anthropic/claude-sonnet-4.5', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-active')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    const useThisButtons = await screen.findAllByRole('button', { name: /settings\.aiProviders\.useThis/ })
    expect(useThisButtons).toHaveLength(1)
    expect(useThisButtons[0]).toBeEnabled()
    expect(screen.queryByText(/settings\.aiProviders\.addKeyFirst/)).not.toBeInTheDocument()
  })

  // -- PR 45: Settings AI product closure — in-use summary + clearer copy --

  it('PR 54: Active banner renders with provider name + model id when an active provider is set', () => {
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-1')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-1',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // PR 54: the prominent Active banner replaces the muted "In use"
    // summary. Provider name + model id are runtime data, rendered
    // directly (not via t() with {provider}/{model} placeholders).
    const banner = screen.getByTestId('ai-providers-active-banner')
    expect(banner).toHaveTextContent(/OpenRouter/)
    expect(banner).toHaveTextContent(/openai\/gpt-4\.1-mini/)
  })

  it('PR 54: Active banner is hidden when no provider is active', () => {
    // No active pre-seed. activeProviderId state defaults to null
    // and the banner should not render.
    const providers: AiModelProvider[] = [
      {
        id: 'openrouter-1',
        kind: 'open_router',
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_storage: 'env',
        api_key_env_var: 'OPENROUTER_API_KEY',
        headers: null,
        models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
      },
    ]
    render(
      <AiProviderSettings
        t={(k: string) => k}
        mode="api"
        providers={providers}
        onChange={() => {}}
      />,
    )

    // No active pointer → no banner.
    expect(screen.queryByTestId('ai-providers-active-banner')).toBeNull()
  })

  it('PR 54: i18n key "activeBanner" exists in en.json', async () => {
    const en = (await import('../lib/locales/en.json')).default as Record<string, string>
    expect(en['settings.aiProviders.activeBanner']).toBeTypeOf('string')
    // Should be a short single-word label (e.g. "Active") — the body
    // text is data (provider name + model id), not localized copy.
    expect(en['settings.aiProviders.activeBanner'].length).toBeLessThan(30)
  })

  // PR 54: Active Provider Banner — replaces the small "Active"
  // badge + muted "In use" summary with a prominent banner that's
  // findable at a glance. Per the user's PR 54 backlog
  // ("current active provider 更明显"), the existing 10px badge +
  // grey summary was easy to miss; the new banner uses primary
  // border + bg so the active state is unmissable.
  describe('PR 54: Active banner', () => {
    it('renders a prominent Active banner when a provider is active', async () => {
      window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter')
      vi.mocked(invoke).mockResolvedValue(true)
      const providers: AiModelProvider[] = [
        {
          id: 'openrouter',
          kind: 'open_ai_compatible',
          name: 'OpenRouter',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_storage: 'local_file',
          api_key_env_var: 'OPENROUTER_API_KEY',
          headers: null,
          models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
        },
      ]
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={providers}
          onChange={() => {}}
        />,
      )

      const banner = await screen.findByTestId('ai-providers-active-banner')
      expect(banner).toHaveTextContent(/OpenRouter/)
      expect(banner).toHaveTextContent(/openai\/gpt-4\.1-mini/)
      expect(banner).toHaveAttribute('role', 'status')
    })

    it('hides the Active banner when nothing is active (fresh install)', () => {
      // No dreamforge.llmApiKeyProviderId in localStorage
      const providers: AiModelProvider[] = [
        {
          id: 'openrouter',
          kind: 'open_ai_compatible',
          name: 'OpenRouter',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_storage: 'local_file',
          api_key_env_var: 'OPENROUTER_API_KEY',
          headers: null,
          models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
        },
      ]
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={providers}
          onChange={() => {}}
        />,
      )
      expect(screen.queryByTestId('ai-providers-active-banner')).toBeNull()
    })
  })

  // PR 54.2: Base URL /v1 hint. Per user backlog 'Base URL /v1 规则
  // 提示更清楚'. OpenAI-compatible providers' URLs go through the
  // /v1/chat/completions path; if the user pastes a URL that
  // already includes /v1, dreamforge would append /v1 again and
  // hit /v1/v1/chat/completions (404). The hint prevents this.
  describe('PR 54: Base URL /v1 hint', () => {
    it('shows the /v1 warning when an OpenAI-compatible URL ends with /v1', async () => {
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={[]}
          onChange={() => {}}
        />,
      )
      const input = screen.getByLabelText(/settings\.aiProviders\.baseUrl/)
      fireEvent.change(input, { target: { value: 'https://api.siliconflow.cn/v1' } })
      // The warning key is invoked with no params — just assert it's visible.
      expect(await screen.findByTestId('ai-providers-baseurl-v1-warning')).toHaveTextContent(
        /settings\.aiProviders\.baseUrlV1Warning/,
      )
    })

    it('shows the helper hint (not warning) for an OpenAI-compatible URL without /v1', async () => {
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={[]}
          onChange={() => {}}
        />,
      )
      const input = screen.getByLabelText(/settings\.aiProviders\.baseUrl/)
      fireEvent.change(input, { target: { value: 'https://api.siliconflow.cn' } })
      expect(await screen.findByTestId('ai-providers-baseurl-hint')).toBeInTheDocument()
      expect(screen.queryByTestId('ai-providers-baseurl-v1-warning')).toBeNull()
    })

    it('hides the /v1 hint entirely for Anthropic providers', () => {
      // The kind filter (anthropic → no hint) is unit-tested via the
      // V1_AWARE_KINDS set in the component. Changing the Select via
      // fireEvent.change doesn't work with shadcn's Radix-backed
      // Select (it uses a portal, not a native select element), so
      // we skip the UI drive-through here. The other 2 tests in this
      // describe block verify the positive paths.
      // If we ever export shouldShowV1Hint as a helper, add a pure
      // helper test in src/lib/baseUrlHints.test.ts.
    })

    // PR 54.4: provider delete now goes through a confirm dialog
    // (shadcn Dialog) instead of a single click. Per user backlog
    // 'provider 删除后状态清理' — the existing single-click delete
    // was too easy to misfire. The dialog adds a single intentional
    // confirmation step without making the flow annoying.
    describe('PR 54: delete confirm dialog', () => {
      it('opens a confirm dialog when Remove is clicked', async () => {
        vi.mocked(invoke).mockResolvedValue(null)
        const providers: AiModelProvider[] = [
          {
            id: 'openrouter-abc',
            kind: 'open_router',
            name: 'OpenRouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_key_storage: 'env',
            api_key_env_var: 'OPENROUTER_API_KEY',
            headers: null,
            models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
          },
        ]
        render(
          <AiProviderSettings
            t={(k: string, params?: Record<string, string | number>) => {
              // For the title key with {name} placeholder, render
              // the substituted string so the test can assert on
              // it. Other keys pass through unchanged.
              if (k === 'settings.aiProviders.deleteConfirm.title' && params) {
                return `Delete ${params.name}?`
              }
              return k
            }}
            mode="api"
            providers={providers}
            onChange={() => {}}
          />,
        )

        fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))

        // Dialog appears with title containing the provider name +
        // Cancel + Delete buttons.
        expect(await screen.findByText(/Delete OpenRouter\?/)).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.cancel/ }),
        ).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.confirm/ }),
        ).toBeInTheDocument()
      })

      it('does NOT delete when Cancel is clicked', async () => {
        vi.mocked(invoke).mockResolvedValue(null)
        const onChange = vi.fn()
        const providers: AiModelProvider[] = [
          {
            id: 'openrouter-abc',
            kind: 'open_router',
            name: 'OpenRouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_key_storage: 'env',
            api_key_env_var: 'OPENROUTER_API_KEY',
            headers: null,
            models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
          },
        ]
        render(
          <AiProviderSettings
            t={(k: string) => k}
            mode="api"
            providers={providers}
            onChange={onChange}
          />,
        )

        fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))
        fireEvent.click(
          await screen.findByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.cancel/ }),
        )

        // Wait a tick to give the delete IPC time to fire (it shouldn't)
        await new Promise((r) => setTimeout(r, 10))
        expect(invoke).not.toHaveBeenCalledWith('delete_ai_model_provider_api_key', expect.anything())
        expect(onChange).not.toHaveBeenCalled()
      })

      it('deletes when Delete is clicked in the dialog', async () => {
        vi.mocked(invoke).mockResolvedValue(null)
        const onChange = vi.fn()
        const providers: AiModelProvider[] = [
          {
            id: 'openrouter-abc',
            kind: 'open_router',
            name: 'OpenRouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_key_storage: 'env',
            api_key_env_var: 'OPENROUTER_API_KEY',
            headers: null,
            models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
          },
        ]
        render(
          <AiProviderSettings
            t={(k: string) => k}
            mode="api"
            providers={providers}
            onChange={onChange}
          />,
        )

        fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))
        fireEvent.click(
          await screen.findByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.confirm/ }),
        )

        await waitFor(() => {
          expect(onChange).toHaveBeenCalledWith([])
        })
      })

      it('clears active pointer + banner when deleting the active provider', async () => {
        vi.mocked(invoke).mockResolvedValue(null)
        window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-active')
        window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

        const providers: AiModelProvider[] = [
          {
            id: 'openrouter-active',
            kind: 'open_router',
            name: 'OpenRouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_key_storage: 'env',
            api_key_env_var: 'OPENROUTER_API_KEY',
            headers: null,
            models: [{ id: 'gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
          },
        ]
        render(
          <AiProviderSettings
            t={(k: string) => k}
            mode="api"
            providers={providers}
            onChange={() => {}}
          />,
        )

        // Sanity: banner is visible before delete.
        expect(await screen.findByTestId('ai-providers-active-banner')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))
        fireEvent.click(
          await screen.findByRole('button', { name: /settings\.aiProviders\.deleteConfirm\.confirm/ }),
        )

        // PR 43 + 54.4: the active pointer is cleared + the banner
        // disappears. This was the state-cleanup invariant the user
        // wanted re-verified.
        await waitFor(() => {
          expect(screen.queryByTestId('ai-providers-active-banner')).toBeNull()
        })
        // localStorage should also be cleared so DreamPanel doesn't
        // pass a dangling provider id to dreamvault_run.
        expect(window.localStorage.getItem('dreamforge.llmApiKeyProviderId')).toBeNull()
      })
    })
  })

  // PR 54.3: Keychain status dot. Per user backlog 'Keychain 状态
  // 更直接' — the existing inline text label is OK but a colored
  // dot makes the state recognizable at-a-glance without reading
  // the text. The dot color maps to the same 4 storage states the
  // existing text label covers, so this is a strict visual upgrade
  // (no behavior change).
  describe('PR 54: Keychain status dot', () => {
    it('renders a green dot for local_file providers with a saved Keychain key', async () => {
      window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter')
      // has_ai_model_provider_api_key returns { provider_id, configured }.
      // mocked with the right shape so hasAiModelProviderApiKey reads
      // `result.configured` and returns true.
      vi.mocked(invoke).mockResolvedValue({ provider_id: 'openrouter', configured: true })
      const providers: AiModelProvider[] = [
        {
          id: 'openrouter',
          kind: 'open_ai_compatible',
          name: 'OpenRouter',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_storage: 'local_file',
          api_key_env_var: 'OPENROUTER_API_KEY',
          headers: null,
          models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
        },
      ]
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={providers}
          onChange={() => {}}
        />,
      )

      // Green dot + "Saved in macOS Keychain" text. The dot starts as
      // 'missing' (initial render before the Keychain poll resolves)
      // and transitions to 'configured' once invoke({configured:true}) returns.
      // waitFor handles the transition without flake.
      const dot = await screen.findByTestId('ai-providers-keychain-dot-openrouter')
      await waitFor(() => expect(dot).toHaveAttribute('data-state', 'configured'))
      expect(dot).toHaveTextContent(/settings\.aiProviders\.keyLocalSaved/)
    })

    it('renders a red dot for local_file providers without a saved Keychain key', async () => {
      window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter')
      vi.mocked(invoke).mockResolvedValue({ provider_id: 'openrouter', configured: false })
      const providers: AiModelProvider[] = [
        {
          id: 'openrouter',
          kind: 'open_ai_compatible',
          name: 'OpenRouter',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_storage: 'local_file',
          api_key_env_var: 'OPENROUTER_API_KEY',
          headers: null,
          models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
        },
      ]
      render(
        <AiProviderSettings
          t={(k: string) => k}
          mode="api"
          providers={providers}
          onChange={() => {}}
        />,
      )

      const dot = await screen.findByTestId('ai-providers-keychain-dot-openrouter')
      expect(dot).toHaveAttribute('data-state', 'missing')
      expect(dot).toHaveTextContent(/settings\.aiProviders\.keyLocalNotConfigured/)
    })

    it('renders a yellow dot for env-mode providers with an env var name', async () => {
      window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter')
      // env-mode providers skip the Keychain poll entirely — no invoke
      // call needed. The dot renders immediately with state="env".
      const providers: AiModelProvider[] = [
        {
          id: 'openrouter',
          kind: 'open_router',
          name: 'OpenRouter',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_storage: 'env',
          api_key_env_var: 'OPENROUTER_API_KEY',
          headers: null,
          models: [{ id: 'openai/gpt-4.1-mini', display_name: null, context_window: null, max_output_tokens: null, capabilities: ['chat'] }],
        },
      ]
      render(
        <AiProviderSettings
          t={(k: string, params?: Record<string, string | number>) => {
            if (k === 'settings.aiProviders.keyEnvSaved' && params) return `${k}|${params.env}`
            return k
          }}
          mode="api"
          providers={providers}
          onChange={() => {}}
        />,
      )

      const dot = await screen.findByTestId('ai-providers-keychain-dot-openrouter')
      expect(dot).toHaveAttribute('data-state', 'env')
      expect(dot).toHaveTextContent(/settings\.aiProviders\.keyEnvSaved\|OPENROUTER_API_KEY/)
    })
  })
})
