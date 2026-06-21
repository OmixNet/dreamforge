import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readDreamCliPath,
  writeDreamCliPath,
  resolveDreamCliPathForInvoke,
  readLlmBaseUrl,
  writeLlmBaseUrl,
  readLlmModel,
  writeLlmModel,
  resolveLlmConfigForInvoke,
  readLlmProviderKindPublic,
  resolveLlmProviderKindForInvoke,
  writeLlmProviderKind,
} from './dreamCliPath'

/**
 * v0.3 PR 12: targeted unit tests for dreamforge cloud LLM + dream CLI path
 * localStorage persistence. Covers the main branches (empty string trim,
 * null/missing localStorage, fallback behavior) that drive the branches
 * coverage metric from 60% baseline toward the 70% v0.3 target.
 */

describe('dreamCliPath', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  describe('readDreamCliPath / writeDreamCliPath', () => {
    it('returns empty string when localStorage is empty', () => {
      expect(readDreamCliPath()).toBe('')
    })

    it('roundtrips a value through localStorage', () => {
      writeDreamCliPath('/path/to/dream')
      expect(readDreamCliPath()).toBe('/path/to/dream')
    })

    it('trims whitespace on read', () => {
      window.localStorage.setItem('dreamforge.dreamCliPath', '  /path/to/dream  ')
      expect(readDreamCliPath()).toBe('/path/to/dream')
    })

    it('removes the localStorage entry when written with empty value', () => {
      writeDreamCliPath('/initial')
      expect(window.localStorage.getItem('dreamforge.dreamCliPath')).toBe('/initial')
      writeDreamCliPath('')
      expect(window.localStorage.getItem('dreamforge.dreamCliPath')).toBeNull()
    })
  })

  describe('resolveDreamCliPathForInvoke', () => {
    it('returns null when localStorage is empty', () => {
      expect(resolveDreamCliPathForInvoke()).toBeNull()
    })

    it('returns the path when localStorage has a non-empty value', () => {
      writeDreamCliPath('/path/to/dream')
      expect(resolveDreamCliPathForInvoke()).toBe('/path/to/dream')
    })
  })

  describe('readLlmBaseUrl / writeLlmBaseUrl', () => {
    it('returns empty string when localStorage is empty', () => {
      expect(readLlmBaseUrl()).toBe('')
    })

    it('roundtrips a value through localStorage', () => {
      writeLlmBaseUrl('https://api.siliconflow.cn/v1')
      expect(readLlmBaseUrl()).toBe('https://api.siliconflow.cn/v1')
    })

    it('removes the localStorage entry when written with empty value', () => {
      writeLlmBaseUrl('https://example.com')
      writeLlmBaseUrl('')
      expect(window.localStorage.getItem('dreamforge.llmBaseUrl')).toBeNull()
    })
  })

  describe('readLlmModel / writeLlmModel', () => {
    it('returns empty string when localStorage is empty', () => {
      expect(readLlmModel()).toBe('')
    })

    it('roundtrips a value through localStorage', () => {
      writeLlmModel('deepseek-ai/DeepSeek-V4-Pro')
      expect(readLlmModel()).toBe('deepseek-ai/DeepSeek-V4-Pro')
    })
  })

  describe('resolveLlmConfigForInvoke', () => {
    it('returns both nulls when localStorage is empty', () => {
      expect(resolveLlmConfigForInvoke()).toEqual({ llmBaseUrl: null, llmModel: null })
    })

    it('returns both values when localStorage has them', () => {
      writeLlmBaseUrl('https://api.siliconflow.cn/v1')
      writeLlmModel('deepseek-ai/DeepSeek-V4-Pro')
      expect(resolveLlmConfigForInvoke()).toEqual({
        llmBaseUrl: 'https://api.siliconflow.cn/v1',
        llmModel: 'deepseek-ai/DeepSeek-V4-Pro',
      })
    })

    it('returns partial when only baseUrl is set', () => {
      writeLlmBaseUrl('https://api.openai.com/v1')
      expect(resolveLlmConfigForInvoke()).toEqual({
        llmBaseUrl: 'https://api.openai.com/v1',
        llmModel: null,
      })
    })
  })

  describe('readLlmProviderKind / writeLlmProviderKind', () => {
    it('roundtrips the active provider kind through localStorage', () => {
      writeLlmProviderKind('anthropic')
      expect(readLlmProviderKindPublic()).toBe('anthropic')
      expect(resolveLlmProviderKindForInvoke()).toBe('anthropic')
    })

    it('clears the active provider kind when written with an empty value', () => {
      writeLlmProviderKind('gemini')
      writeLlmProviderKind('')
      expect(window.localStorage.getItem('dreamforge.llmProviderKind')).toBeNull()
      expect(resolveLlmProviderKindForInvoke()).toBeNull()
    })
  })
})
