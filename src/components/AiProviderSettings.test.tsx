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

    fireEvent.click(screen.getByRole('button', { name: /common\.remove/ }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'delete_ai_model_provider_api_key',
        expect.objectContaining({ providerId: 'openrouter-abc' }),
      )
    })
  })

  it('delete: clears localStorage dreamforge.llmApiKeyEnv when the removed provider was active', async () => {
    vi.mocked(invoke).mockResolvedValue(null)
    // Pre-set localStorage as if this provider was the active one
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')

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

    await waitFor(() => {
      expect(window.localStorage.getItem('dreamforge.llmApiKeyEnv')).toBeNull()
    })
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
})
