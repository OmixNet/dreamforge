import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LlmSettingsField } from './LlmSettingsField'
import { writeLlmBaseUrl, writeLlmModel } from '../lib/dreamCliPath'

/**
 * v0.3 PR 12: targeted unit tests for the PR 10 cloud LLM settings UI.
 * Covers pre-fill defaults, onChange handlers, and the Clear button.
 */

describe('LlmSettingsField', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
    cleanup()
    vi.restoreAllMocks()
  })

  it('pre-fills the SiliconFlow defaults when localStorage is empty', () => {
    render(<LlmSettingsField />)
    const baseUrlInput = screen.getByTestId('settings-llm-base-url') as HTMLInputElement
    const modelInput = screen.getByTestId('settings-llm-model') as HTMLInputElement
    expect(baseUrlInput.value).toBe('https://api.siliconflow.cn/v1')
    expect(modelInput.value).toBe('deepseek-ai/DeepSeek-V4-Pro')
  })

  it('hydrates from existing localStorage values on mount', () => {
    writeLlmBaseUrl('https://api.openai.com/v1')
    writeLlmModel('gpt-4o')
    render(<LlmSettingsField />)
    const baseUrlInput = screen.getByTestId('settings-llm-base-url') as HTMLInputElement
    const modelInput = screen.getByTestId('settings-llm-model') as HTMLInputElement
    expect(baseUrlInput.value).toBe('https://api.openai.com/v1')
    expect(modelInput.value).toBe('gpt-4o')
  })

  it('writes to localStorage when base URL is edited', () => {
    render(<LlmSettingsField />)
    const baseUrlInput = screen.getByTestId('settings-llm-base-url') as HTMLInputElement
    fireEvent.change(baseUrlInput, { target: { value: 'https://api.deepseek.com/v1' } })
    expect(window.localStorage.getItem('dreamforge.llmBaseUrl')).toBe('https://api.deepseek.com/v1')
  })

  it('writes to localStorage when model is edited', () => {
    render(<LlmSettingsField />)
    const modelInput = screen.getByTestId('settings-llm-model') as HTMLInputElement
    fireEvent.change(modelInput, { target: { value: 'gpt-4-turbo' } })
    expect(window.localStorage.getItem('dreamforge.llmModel')).toBe('gpt-4-turbo')
  })

  it('Clear button removes both fields from localStorage', () => {
    writeLlmBaseUrl('https://api.siliconflow.cn/v1')
    writeLlmModel('deepseek-ai/DeepSeek-V4-Pro')
    render(<LlmSettingsField />)
    const clearButton = screen.getByRole('button', { name: /clear/i })
    fireEvent.click(clearButton)
    expect(window.localStorage.getItem('dreamforge.llmBaseUrl')).toBeNull()
    expect(window.localStorage.getItem('dreamforge.llmModel')).toBeNull()
  })
})
