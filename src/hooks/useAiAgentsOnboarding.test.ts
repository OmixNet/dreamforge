import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DREAMFORGE_SLIM_MODE } from '../lib/dreamforgeMode'
import { useAiAgentsOnboarding } from './useAiAgentsOnboarding'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

describe('useAiAgentsOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stays hidden in DreamForge Slim mode even when enabled', () => {
    const { result } = renderHook(() => useAiAgentsOnboarding(true))

    expect(DREAMFORGE_SLIM_MODE).toBe(true)
    expect(result.current.showPrompt).toBe(false)
  })
})
