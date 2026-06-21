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

    // Short message is shown, NOT the raw stderr
    expect(await screen.findByText(/No API key configured/)).toBeInTheDocument()
    expect(screen.queryByText(/set DREAMFORGE_LLM_API_KEY/)).not.toBeInTheDocument()
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

    expect(await screen.findByText(/request timed out/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('never leaks API key value to the UI when body echoes it back', async () => {
    const SECRET = 'sk-or-v1-SECRET-LEAK-12345'
    vi.mocked(mockInvoke)
      .mockResolvedValueOnce({ stdout: 'status ok', stderr: '', success: true })
      .mockRejectedValueOnce(
        new Error(
          `[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: HTTP 500: ${SECRET}`,
        ),
      )

    const { container } = render(<DreamPanel vaultPath="/tmp/vault" />)
    await screen.findByText(/status ok/)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    // Wait for the error view to render
    await screen.findByText(/Could not reach the provider/)

    // The apiKey value must NOT appear anywhere in the rendered DOM.
    const html = container.innerHTML
    expect(html).not.toContain(SECRET)
  })
})
