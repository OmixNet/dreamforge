import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DreamPanel } from './DreamPanel'

vi.mock('../mock-tauri', () => ({
  isTauri: () => false,
  mockInvoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const { mockInvoke } = await import('../mock-tauri')
const { invoke } = await import('@tauri-apps/api/core')

describe('DreamPanel', () => {
  beforeEach(() => {
    vi.mocked(mockInvoke).mockReset()
    vi.mocked(invoke).mockReset()
    // PR 52: DreamPanel now also fetches typed stats via
    // dreamvault_status_json on vault change. Tests that don't
    // mock the typed call explicitly rely on this default
    // implementation: typed path returns a v1 all-zero report,
    // other commands return an empty text-output shape. This
    // keeps the existing `mockResolvedValueOnce` pattern working
    // for the text path (the typed call falls through to the
    // default when no Once is queued).
    vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'dreamvault_status_json') {
        return {
          schemaVersion: 1,
          vaultPath: '/tmp/vault',
          rawCandidatesCount: 0,
          processedCount: 0,
          archivedCount: 0,
          lastReportPath: null,
        }
      }
      return { stdout: '', stderr: '', success: true }
    })
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('auto-fetches status on mount with the active vault path', async () => {
    vi.mocked(mockInvoke).mockResolvedValueOnce({
      stdout: 'Vault: /tmp/vault\nMemory: present',
      stderr: '',
      success: true,
    })

    render(<DreamPanel vaultPath="/tmp/vault" />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_status', { vaultPath: '/tmp/vault' })
    })
    expect(await screen.findByText(/Vault: \/tmp\/vault/)).toBeInTheDocument()
  })

  it('sends the user-configured dream_cli_path from localStorage when present', async () => {
    window.localStorage.setItem('dreamforge.dreamCliPath', '/opt/dream/bin/dream')
    vi.mocked(mockInvoke).mockResolvedValueOnce({
      stdout: 'status ok',
      stderr: '',
      success: true,
    })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_status', {
        vaultPath: '/tmp/vault',
        dreamCliPath: '/opt/dream/bin/dream',
      })
    })
  })

  it('does not send LLM provider credentials for mount-time status checks', async () => {
    // v0.5 PR 27 P2c-1.5: closed-loop data flow. Settings → Keychain +
    // localStorage pointer pair → DreamPanel reads both → dreamvault_run
    // uses provider id to look up the key in macOS Keychain.
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-abc123')
    window.localStorage.setItem('dreamforge.llmProviderKind', 'open_router')
    vi.mocked(mockInvoke).mockResolvedValueOnce({
      stdout: 'status ok',
      stderr: '',
      success: true,
    })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_status', {
        vaultPath: '/tmp/vault',
      })
    })
  })

  it('sends both llmApiKeyEnv and llmApiKeyProviderId for explicit Run Dream', async () => {
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-abc123')
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockResolvedValueOnce({ stdout: 'dream ok', stderr: '', success: true })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_run', {
        vaultPath: '/tmp/vault',
        llmApiKeyEnv: 'OPENROUTER_API_KEY',
        llmApiKeyProviderId: 'openrouter-abc123',
      })
    })
  })

  it('sends OpenRouter routing config on explicit Run Dream', async () => {
    window.localStorage.setItem('dreamforge.llmBaseUrl', 'https://openrouter.ai/api/v1')
    window.localStorage.setItem('dreamforge.llmModel', 'anthropic/claude-sonnet-4.5')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'OPENROUTER_API_KEY')
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'openrouter-abc123')
    window.localStorage.setItem('dreamforge.llmProviderKind', 'open_router')
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockResolvedValueOnce({ stdout: 'dream ok', stderr: '', success: true })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_run', {
        vaultPath: '/tmp/vault',
        llmBaseUrl: 'https://openrouter.ai/api/v1',
        llmModel: 'anthropic/claude-sonnet-4.5',
        llmApiKeyEnv: 'OPENROUTER_API_KEY',
        llmApiKeyProviderId: 'openrouter-abc123',
        llmProviderKind: 'open_router',
      })
    })
  })

  it('sends Anthropic provider kind on explicit Run Dream', async () => {
    window.localStorage.setItem('dreamforge.llmBaseUrl', 'https://api.anthropic.com')
    window.localStorage.setItem('dreamforge.llmModel', 'claude-sonnet-4-5')
    window.localStorage.setItem('dreamforge.llmApiKeyEnv', 'ANTHROPIC_API_KEY')
    window.localStorage.setItem('dreamforge.llmApiKeyProviderId', 'anthropic-abc123')
    window.localStorage.setItem('dreamforge.llmProviderKind', 'anthropic')
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockResolvedValueOnce({ stdout: 'dream ok', stderr: '', success: true })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dreamvault_run', {
        vaultPath: '/tmp/vault',
        llmBaseUrl: 'https://api.anthropic.com',
        llmModel: 'claude-sonnet-4-5',
        llmApiKeyEnv: 'ANTHROPIC_API_KEY',
        llmApiKeyProviderId: 'anthropic-abc123',
        llmProviderKind: 'anthropic',
      })
    })
  })

  it('runs the Dream cycle on Run Dream click and surfaces the output', async () => {
    vi.mocked(mockInvoke)
      // mount-time status
      .mockResolvedValueOnce({ stdout: 'initial status', stderr: '', success: true })
      // explicit Run Dream
      .mockResolvedValueOnce({
        stdout: 'dream cycle complete\n- 收集 raw: 1\n- 通过整合: 3',
        stderr: '',
        success: true,
      })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    // Wait for mount-time status to finish so Run Dream button is enabled
    await screen.findByText(/initial status/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    expect(await screen.findByText(/dream cycle complete/)).toBeInTheDocument()
    expect(mockInvoke).toHaveBeenCalledWith('dreamvault_run', { vaultPath: '/tmp/vault' })
  })

  it('invokes the Open MEMORY.md callback when the button is clicked', async () => {
    const onOpenMemory = vi.fn()
    vi.mocked(mockInvoke).mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    render(<DreamPanel vaultPath="/tmp/vault" onOpenMemory={onOpenMemory} />)
    await screen.findByText(/status ok/)

    fireEvent.click(screen.getByRole('button', { name: 'MEMORY.md' }))
    expect(onOpenMemory).toHaveBeenCalledTimes(1)
  })

  it('invokes the Open wiki callback when the wiki button is clicked', async () => {
    const onOpenWiki = vi.fn()
    vi.mocked(mockInvoke).mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    render(<DreamPanel vaultPath="/tmp/vault" onOpenWiki={onOpenWiki} />)
    await screen.findByText(/status ok/)

    fireEvent.click(screen.getByRole('button', { name: 'wiki/' }))
    expect(onOpenWiki).toHaveBeenCalledTimes(1)
  })

  it('disables the open buttons when no callback is provided', async () => {
    vi.mocked(mockInvoke).mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)

    const memoryButton = screen.getByRole('button', { name: 'MEMORY.md' })
    const wikiButton = screen.getByRole('button', { name: 'wiki/' })
    expect(memoryButton).toBeDisabled()
    expect(wikiButton).toBeDisabled()
  })

  it('surfaces errors from the CLI in the output area', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(new Error('dream CLI not found'))

    render(<DreamPanel vaultPath="/tmp/vault" />)
    // Wait for mount-time status to finish so Run Dream button is enabled
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // v0.6 PR 34: error without a [OPENAI_*] tag maps to 'unknown'
    // category, which shows a generic message + the raw body in a pre
    // block. We assert both: the short message AND the body echo.
    expect(await screen.findByText(/Dream run failed/)).toBeInTheDocument()
    expect(await screen.findByText(/dream CLI not found/)).toBeInTheDocument()
  })

  it('renders structured error UI with fix-action button for [OPENAI_MISSING_KEY]', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error(
          '[OPENAI_MISSING_KEY] OpenAI-compatible missing API key: set DREAMFORGE_LLM_API_KEY',
        ),
      )

    const onOpenSettingsAi = vi.fn()
    render(<DreamPanel vaultPath="/tmp/vault" onOpenSettingsAi={onOpenSettingsAi} />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 34 + PR 41 + PR 46: short message is the user-facing summary; raw
    // stderr (which mentions the env var hint) is inside a
    // collapsed <details> block. The short message is what the user
    // sees by default; the raw body requires an explicit click.
    expect(await screen.findByText(/API key missing or not saved/)).toBeInTheDocument()
    // Raw details are wrapped in <details>, default closed.
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
    // Fix action button is rendered (PR 46: label changed from
    // "Open Settings → AI" to "Open Settings → API models")
    const button = screen.getByRole('button', { name: /Open Settings \u2192 API models/ })
    fireEvent.click(button)
    expect(onOpenSettingsAi).toHaveBeenCalledTimes(1)
  })

  it('renders Retry fix-action for [OPENAI_TIMEOUT]', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_TIMEOUT] OpenAI-compatible request timed out'),
      )

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 41: query the <p> short message specifically (not the raw
    // body inside <details>). PR 46: copy is now "Request timed out"
    // (was "The request timed out. Try again." — shorter for less
    // visual weight; the Retry button is the action).
    expect(await screen.findByText(/^Request timed out/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('never leaks API key value to the visible error UI (collapsed <details> is acceptable)', async () => {
    const SECRET = 'sk-or-v1-SECRET-LEAK-12345'
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error(
          `[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: HTTP 500: ${SECRET}`,
        ),
      )

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // Wait for the error view to render
    await screen.findByText(/Network or proxy unreachable/)

    // The short message (the user-facing copy that the user sees by
    // default) must NEVER contain the apiKey value. The apiKey value
    // is in the raw body, but the raw body is wrapped in a collapsed
    // <details> element that the user has to explicitly expand.
    const shortMessage = screen.getByText(/Network or proxy unreachable/)
    expect(shortMessage.textContent).not.toContain(SECRET)

    // The <details> element is closed by default — the user does NOT
    // see the raw body unless they click "Raw error details" or
    // "Copy details".
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  // -- v0.6 PR 41: Copy details + collapsible raw details --

  it('PR 41: renders a Copy details button for any error with a body', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(new Error('[OPENAI_TIMEOUT] OpenAI-compatible request timed out'))

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // Copy details button is rendered alongside Retry (primary action).
    expect(
      await screen.findByRole('button', { name: /Copy error details to clipboard/i }),
    ).toBeInTheDocument()
  })

  it('PR 41: Copy details writes the original error message to navigator.clipboard', async () => {
    const ERROR_MSG = '[OPENAI_AUTH_FAILED] OpenAI-compatible HTTP 401: invalid api key'
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(new Error(ERROR_MSG))

    // Mock navigator.clipboard.writeText
    const writeText = vi.fn().mockResolvedValue(undefined)
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    try {
      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      const copyButton = await screen.findByRole('button', {
        name: /Copy error details to clipboard/i,
      })
      fireEvent.click(copyButton)

      expect(writeText).toHaveBeenCalledWith(ERROR_MSG)
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      })
    }
  })

  it('PR 41: raw error details are wrapped in a collapsed <details> element', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_AUTH_FAILED] OpenAI-compatible HTTP 401: invalid api key'),
      )

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // The <details> block is present and closed by default. The user
    // must click "Raw error details" to see the long stderr.
    await screen.findByText(/Raw error details/)
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('PR 41: same error card for Anthropic tag (cross-provider UI)', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[ANTHROPIC_AUTH_FAILED] Anthropic HTTP 401: invalid x-api-key'),
      )

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 46: the refreshed shortMessage ("API key missing or not saved")
    // appears regardless of provider prefix — the UI copy is
    // provider-neutral. missing-key and auth-failed share the same
    // copy because the user-facing fix is identical.
    expect(await screen.findByText(/API key missing or not saved/)).toBeInTheDocument()
    // PR 46: button label refreshed to "Open Settings → API models"
    expect(screen.getByRole('button', { name: /Open Settings \u2192 API models/ })).toBeInTheDocument()
  })

  it('PR 41: same error card for Gemini tag (cross-provider UI)', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[GEMINI_MODEL_NOT_FOUND] Gemini HTTP 404: models/gemini-bogus not found'),
      )

    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 46: copy refreshed to "Model ID not available"
    expect(await screen.findByText(/Model ID not available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Settings \u2192 API models/ })).toBeInTheDocument()
  })

  // -- PR 46: actionable error copy + base URL hint in network-failed --

  it('PR 46: [OPENAI_MISSING_KEY] shortMessage is the new actionable "API key missing or not saved" copy', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_MISSING_KEY] OpenAI-compatible missing API key'),
      )
    const onOpenSettingsAi = vi.fn()
    render(<DreamPanel vaultPath="/tmp/vault" onOpenSettingsAi={onOpenSettingsAi} />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 46: short message is the user-facing actionable copy, NOT
    // a literal restatement of the Swift provider stderr.
    expect(await screen.findByText(/API key missing or not saved/i)).toBeInTheDocument()
    // Button label is now "Open Settings → API models" (more specific
    // than "Open Settings → AI" — user lands on the API section).
    const button = screen.getByRole('button', { name: /Open Settings \u2192 API models/ })
    fireEvent.click(button)
    expect(onOpenSettingsAi).toHaveBeenCalledTimes(1)
  })

  it('PR 46: [OPENAI_AUTH_FAILED] shares the same shortMessage as missing-key (user-facing fix is identical)', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_AUTH_FAILED] OpenAI-compatible HTTP 401: invalid api key'),
      )
    const onOpenSettingsAi = vi.fn()
    render(<DreamPanel vaultPath="/tmp/vault" onOpenSettingsAi={onOpenSettingsAi} />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // Same copy as missing-key — both route the user to Settings to
    // check the API key. Avoiding two near-identical shortMessages
    // (one per HTTP code) makes the UI consistent and predictable.
    expect(await screen.findByText(/API key missing or not saved/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Settings \u2192 API models/ })).toBeInTheDocument()
  })

  it('PR 46: [OPENAI_MODEL_NOT_FOUND] shortMessage is "Model ID not available"', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_MODEL_NOT_FOUND] OpenAI-compatible HTTP 404: model not found'),
      )
    const onOpenSettingsAi = vi.fn()
    render(<DreamPanel vaultPath="/tmp/vault" onOpenSettingsAi={onOpenSettingsAi} />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    expect(await screen.findByText(/Model ID not available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Settings \u2192 API models/ })).toBeInTheDocument()
  })

  it('PR 46: [OPENAI_NETWORK_FAILED] shortMessage includes the base URL hint (most common cause of network errors)', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: connection refused'),
      )
    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // PR 46: fold the base URL hint into the network-failed shortMessage
    // because a wrong base URL is the #1 cause of network errors in
    // practice (user types the full chat-completions URL or doubles the
    // /v1 suffix). DreamVault Swift provider can't tell the difference
    // from the error shape alone, so the hint lives in UI copy where
    // the user actually reads it.
    const shortMessage = await screen.findByText(/Network or proxy unreachable/i)
    expect(shortMessage.textContent).toMatch(/Base URL/i)
    expect(shortMessage.textContent).toMatch(/\/v1/i)
    // Network errors get Retry, not "Open Settings" (most are transient
    // or self-inflicted; the user retries after fixing the URL).
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('PR 46: [OPENAI_TIMEOUT] shortMessage is "Request timed out"', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_TIMEOUT] OpenAI-compatible URLError.timedOut'),
      )
    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    expect(await screen.findByText(/^Request timed out/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('PR 46: [OPENAI_MALFORMED] shortMessage is "Unexpected response from provider"', async () => {
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error('[OPENAI_MALFORMED] OpenAI-compatible bad response shape'),
      )
    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    expect(await screen.findByText(/Unexpected response from provider/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('PR 46: refresh of error copy preserves the security invariant (shortMessage never contains API key value)', async () => {
    const SECRET = 'sk-or-v1-SECRET-LEAK-12345'
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error(`[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: ${SECRET}`),
      )
    render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // The new shortMessage must not contain the secret even when the
    // server echoes it back. The body (containing the secret) lives
    // in a collapsed <details> by default.
    const shortMessage = await screen.findByText(/Network or proxy unreachable/i)
    expect(shortMessage.textContent).not.toContain(SECRET)
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('PR 46: cross-provider parity — Anthropic + Gemini share the same refreshed shortMessage copy', async () => {
    for (const tag of ['ANTHROPIC_MISSING_KEY', 'GEMINI_NETWORK_FAILED']) {
      // Reset mock between iterations
      vi.mocked(mockInvoke).mockReset()
      vi.mocked(mockInvoke)
        .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
        .mockRejectedValueOnce(new Error(`[${tag}] provider error`))
      const { unmount } = render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))
      if (tag === 'ANTHROPIC_MISSING_KEY') {
        expect(await screen.findByText(/API key missing or not saved/i)).toBeInTheDocument()
      } else {
        // GEMINI_NETWORK_FAILED → same network-failed shortMessage
        expect(await screen.findByText(/Network or proxy unreachable/i)).toBeInTheDocument()
      }
      unmount()
    }
  })

  // PR 52: typed stats section. The typed section is intentionally
  // click-to-show in the DreamPanel: initial mount and vault switches
  // keep the existing text output as the only visible status; clicking
  // Status fetches the typed JSON report and renders it above <pre>.
  describe('typed stats section (PR 52)', () => {
    it('hides the typed section on initial mount (silent default state)', () => {
      render(<DreamPanel vaultPath="/tmp/vault" />)
      expect(screen.queryByTestId('dream-panel-typed-stats')).toBeNull()
    })

    it('keeps typed stats hidden after a vault switch until the user clicks Status', async () => {
      const { rerender } = render(<DreamPanel vaultPath="/tmp/vault-a" />)
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault-b',
            rawCandidatesCount: 5,
            processedCount: 7,
            archivedCount: 1,
            lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
          }
        }
        return { stdout: '', stderr: '', success: true }
      })
      rerender(<DreamPanel vaultPath="/tmp/vault-b" />)
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('dreamvault_status', { vaultPath: '/tmp/vault-b' })
      })
      expect(screen.queryByTestId('dream-panel-typed-stats')).toBeNull()
    })

    it('fetches and renders typed stats when the user clicks Status', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault',
            rawCandidatesCount: 5,
            processedCount: 7,
            archivedCount: 1,
            lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
          }
        }
        return {
          stdout: 'vault: /tmp/vault\nLast dream: 2026-06-25T10:22:32Z',
          stderr: '',
          success: true,
        }
      })

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/vault: \/tmp\/vault/)
      expect(screen.queryByTestId('dream-panel-typed-stats')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Status' }))

      const section = await screen.findByTestId('dream-panel-typed-stats')
      expect(section.textContent).toContain('5 candidates · 7 processed · 1 archived')
      expect(section.textContent).toContain('Last dream:')
      expect(section.textContent).toContain('Last report: .dream/reports/dream-report-2026-06-25-090000.md')
    })

    it('uses the provided locale for the typed stats section', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000).toISOString()
      const props = {
        vaultPath: '/tmp/vault',
        locale: 'zh-CN',
      } satisfies Parameters<typeof DreamPanel>[0] & { locale: 'zh-CN' }
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault',
            rawCandidatesCount: 5,
            processedCount: 7,
            archivedCount: 1,
            lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
          }
        }
        return {
          stdout: `vault: /tmp/vault\nLast dream: ${thirtyMinutesAgo}`,
          stderr: '',
          success: true,
        }
      })

      render(<DreamPanel {...props} />)
      await screen.findByText(/vault: \/tmp\/vault/)
      fireEvent.click(screen.getByRole('button', { name: 'Status' }))

      const section = await screen.findByTestId('dream-panel-typed-stats')
      expect(section.textContent).toContain('5 候选 · 7 已处理 · 1 已归档')
      expect(section.textContent).toContain('上次 Dream: 30 min 前')
      expect(section.textContent).toContain('最近报告: .dream/reports/dream-report-2026-06-25-090000.md')
    })

    it('renders lastReportPath when present (typed JSON path)', async () => {
      const originalImpl = vi.mocked(mockInvoke).getMockImplementation()
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault-b',
            rawCandidatesCount: 5,
            processedCount: 7,
            archivedCount: 1,
            lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
          }
        }
        return { stdout: '', stderr: '', success: true }
      })
      render(<DreamPanel vaultPath="/tmp/vault-b" />)
      await screen.findByText('Command completed.')
      fireEvent.click(screen.getByRole('button', { name: 'Status' }))
      const reportLine = await screen.findByTestId('dream-panel-last-report')
      expect(reportLine.textContent).toContain('.dream/reports/dream-report-2026-06-25-090000.md')
      if (originalImpl) vi.mocked(mockInvoke).mockImplementation(originalImpl)
    })

    it('hides lastReportPath when null (no reports in vault)', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault-b',
            rawCandidatesCount: 0,
            processedCount: 0,
            archivedCount: 0,
            lastReportPath: null,
          }
        }
        return { stdout: '', stderr: '', success: true }
      })
      render(<DreamPanel vaultPath="/tmp/vault-b" />)
      await screen.findByText('Command completed.')
      fireEvent.click(screen.getByRole('button', { name: 'Status' }))
      // The section appears (counts are 0 but present), but
      // lastReportPath is null → no last-report line.
      await screen.findByTestId('dream-panel-typed-stats')
      expect(screen.queryByTestId('dream-panel-last-report')).toBeNull()
    })

    it('falls back silently when typed path rejects (old binary / IPC fail)', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_status_json') throw new Error('old dream binary — no --json flag')
        return { stdout: '', stderr: '', success: true }
      })
      render(<DreamPanel vaultPath="/tmp/vault-b" />)
      fireEvent.click(screen.getByRole('button', { name: 'Status' }))
      // No error UI, no typed section. The pre-existing text path
      // is unaffected. Wait a tick to let the catch block run.
      await new Promise((r) => setTimeout(r, 10))
      expect(screen.queryByTestId('dream-panel-typed-stats')).toBeNull()
    })
  })

  // PR 53: run-state UI. The run-state card appears above the
  // typed stats section and reflects the latest dream cycle:
  //   - 'Running'        while dreamvault_run is in flight
  //   - 'Completed'      parseDreamRunSummary returns kind='completed'
  //   - 'No new work'    parseDreamRunSummary returns kind='noop'
  //                     (zero-work, not a failure)
  //   - (no card)        before any run, or after a failed run
  //                     (failed runs use the existing ProviderErrorView)
  //
  // The run-state card is a frontend-only addition; it parses
  // the dream CLI text output (the same source as the typed
  // fallback path). The typed JSON contract (PR 50) doesn't
  // expose per-run stats — only cumulative vault stats.
  describe('run-state (PR 53)', () => {
    it('shows a running state while Run Dream is in flight', async () => {
      let resolveRun!: (value: { stdout: string; stderr: string; success: boolean }) => void
      vi.mocked(mockInvoke)
        .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
        .mockImplementationOnce(
          () =>
            new Promise<{ stdout: string; stderr: string; success: boolean }>((resolve) => {
              resolveRun = resolve
            }),
        )

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('Running')
      resolveRun({
        stdout: 'dream completed:\n  - collected raw: 1\n  - integrated: 1',
        stderr: '',
        success: true,
      })
    })

    it('shows completed summary after Run Dream succeeds and refreshes typed stats', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_run') {
          return {
            stdout: [
              'dream completed:',
              '  - collected raw: 2',
              '  - integrated: 1',
              '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
            ].join('\n'),
            stderr: '',
            success: true,
          }
        }
        if (cmd === 'dreamvault_status_json') {
          return {
            schemaVersion: 1,
            vaultPath: '/tmp/vault',
            rawCandidatesCount: 5,
            processedCount: 7,
            archivedCount: 1,
            lastReportPath: '.dream/reports/dream-report-2026-06-25-090000.md',
          }
        }
        return { stdout: 'status ok', stderr: '', success: true }
      })

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      const state = await screen.findByTestId('dream-panel-run-state')
      expect(state).toHaveTextContent('Completed')
      expect(state).toHaveTextContent('2 raw')
      expect(state).toHaveTextContent('1 integrated')
      // PR 53 also refreshes typed stats after Run Dream completes
      // (so the user doesn't need to click Status again).
      expect(await screen.findByTestId('dream-panel-typed-stats')).toHaveTextContent(
        '5 candidates · 7 processed · 1 archived',
      )
    })

    it('shows no-op summary after Run Dream has no raw work', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_run') {
          return {
            stdout: 'dream completed:\n  - collected raw: 0\n  - integrated: 0',
            stderr: '',
            success: true,
          }
        }
        return { stdout: 'status ok', stderr: '', success: true }
      })

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      expect(await screen.findByTestId('dream-panel-run-state')).toHaveTextContent('No new work')
    })

    it('clears the run-state card when Run Dream fails (ProviderErrorView takes over)', async () => {
      vi.mocked(mockInvoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'dreamvault_run') {
          throw new Error(
            '[OPENAI_MISSING_KEY] OpenAI-compatible missing API key: set DREAMFORGE_LLM_API_KEY',
          )
        }
        return { stdout: 'status ok', stderr: '', success: true }
      })

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      // ProviderErrorView surfaces the failure; run-state card is gone.
      expect(await screen.findByText(/API key missing or not saved/i)).toBeInTheDocument()
      expect(screen.queryByTestId('dream-panel-run-state')).toBeNull()
    })

    it('renders Open latest report when Run Dream output includes a report path', async () => {
      const onOpenReport = vi.fn()
      vi.mocked(mockInvoke)
        .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
        .mockResolvedValueOnce({
          stdout: [
            'dream completed:',
            '  - collected raw: 1',
            '  - integrated: 1',
            '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
          ].join('\n'),
          stderr: '',
          success: true,
        })

      render(<DreamPanel vaultPath="/tmp/vault" onOpenReport={onOpenReport} />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

      const openBtn = await screen.findByRole('button', { name: 'Open latest report' })
      fireEvent.click(openBtn)
      expect(onOpenReport).toHaveBeenCalledWith('.dream/reports/dream-report-2026-06-25-090000.md')
    })

    it('hides the Open latest report button when onOpenReport prop is missing', async () => {
      vi.mocked(mockInvoke)
        .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
        .mockResolvedValueOnce({
          stdout: [
            'dream completed:',
            '  - collected raw: 1',
            '  - integrated: 1',
            '  - dream-report: .dream/reports/dream-report-2026-06-25-090000.md',
          ].join('\n'),
          stderr: '',
          success: true,
        })

      render(<DreamPanel vaultPath="/tmp/vault" />)
      await screen.findByText(/status ok/)
      fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))
      await screen.findByTestId('dream-panel-run-state')
      // No onOpenReport prop → no Open button (silent, not a warning)
      expect(
        screen.queryByRole('button', { name: 'Open latest report' }),
      ).toBeNull()
    })
  })
})
