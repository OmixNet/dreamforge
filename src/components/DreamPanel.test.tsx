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

    // PR 34 + PR 41: short message is the user-facing summary; raw
    // stderr (which mentions the env var hint) is inside a
    // collapsed <details> block. The short message is what the user
    // sees by default; the raw body requires an explicit click.
    expect(await screen.findByText(/No API key configured/)).toBeInTheDocument()
    // Raw details are wrapped in <details>, default closed.
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
    // Fix action button is rendered
    const button = screen.getByRole('button', { name: /Open Settings → AI/ })
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
    // body inside <details>). Use the user-facing copy ("The request
    // timed out") which is the constant shortMessage for the timeout
    // category, distinct from the raw stderr wording.
    expect(await screen.findByText(/^The request timed out/i)).toBeInTheDocument()
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
    await screen.findByText(/Could not reach the provider/)

    // The short message (the user-facing copy that the user sees by
    // default) must NEVER contain the apiKey value. The apiKey value
    // is in the raw body, but the raw body is wrapped in a collapsed
    // <details> element that the user has to explicitly expand.
    const shortMessage = screen.getByText(/Could not reach the provider/)
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

    // The same shortMessage ("The API key was rejected.") appears
    // regardless of provider prefix — the UI copy is provider-neutral.
    expect(await screen.findByText(/API key was rejected/)).toBeInTheDocument()
    // Same fix action button label.
    expect(screen.getByRole('button', { name: /Open Settings → AI/ })).toBeInTheDocument()
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

    expect(await screen.findByText(/model does not exist/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Settings → AI/ })).toBeInTheDocument()
  })
})
