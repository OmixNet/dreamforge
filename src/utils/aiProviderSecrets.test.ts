import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteAiModelProviderApiKey,
  hasAiModelProviderApiKey,
  saveAiModelProviderApiKey,
} from './aiProviderSecrets'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  mockInvoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}))

vi.mock('../mock-tauri', () => ({
  isTauri: mocks.isTauri,
  mockInvoke: mocks.mockInvoke,
}))

describe('aiProviderSecrets native dispatch', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.isTauri.mockReset()
    mocks.mockInvoke.mockReset()
    mocks.isTauri.mockReturnValue(false)
  })

  it('saves through native invoke when invoke is available even if isTauri detection is false', async () => {
    mocks.invoke.mockResolvedValue(undefined)

    await saveAiModelProviderApiKey('openrouter', 'sk-test')

    expect(mocks.invoke).toHaveBeenCalledWith('save_ai_model_provider_api_key', {
      providerId: 'openrouter',
      apiKey: 'sk-test',
    })
  })

  it('deletes through native invoke when invoke is available even if isTauri detection is false', async () => {
    mocks.invoke.mockResolvedValue(undefined)

    await deleteAiModelProviderApiKey('openrouter')

    expect(mocks.invoke).toHaveBeenCalledWith('delete_ai_model_provider_api_key', {
      providerId: 'openrouter',
    })
  })

  it('uses native has-key result before falling back to mock handlers', async () => {
    mocks.invoke.mockResolvedValue({ provider_id: 'openrouter', configured: true })

    await expect(hasAiModelProviderApiKey('openrouter')).resolves.toBe(true)

    expect(mocks.mockInvoke).not.toHaveBeenCalled()
  })

  it('falls back to mock has-key result when native invoke is unavailable in browser mode', async () => {
    mocks.invoke.mockRejectedValue(new Error('not in tauri'))
    mocks.mockInvoke.mockResolvedValue({ provider_id: 'openrouter', configured: false })

    await expect(hasAiModelProviderApiKey('openrouter')).resolves.toBe(false)

    expect(mocks.mockInvoke).toHaveBeenCalledWith('has_ai_model_provider_api_key', {
      providerId: 'openrouter',
    })
  })

  it('propagates native invoke errors when isTauri detection is true', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockRejectedValue(new Error('keychain denied'))

    await expect(hasAiModelProviderApiKey('openrouter')).rejects.toThrow('keychain denied')
  })
})
