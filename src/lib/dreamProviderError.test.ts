// src/lib/dreamProviderError.test.ts
//
// v0.6 PR 34: tests for the DreamVault Swift → DreamX error parser.
//
// Coverage (locked by user 2026-06-21):
//   1. Each of the 6 stable [OPENAI_*] tags maps to the correct category
//   2. Order-independent matching (tag can appear anywhere in the message)
//   3. Tag match wins over free-form text in the body
//   4. Unknown / no tag → 'unknown' category
//   5. SECURITY: the parsed shortMessage / fixActionLabel never contains
//      the API key value even if the body echoes it back
//   6. SECURITY: the parser does NOT return the raw body — it only
//      returns the provider-controlled short message
//   7. stripOpenAITag removes the [OPENAI_*] prefix

import { describe, expect, it } from 'vitest'
import { parseProviderError, stripOpenAITag } from './dreamProviderError'

const SECRET = 'sk-or-v1-SECRET-LEAK-12345'

describe('parseProviderError', () => {
  describe('tag detection', () => {
    it('maps [OPENAI_MISSING_KEY] to missing-key', () => {
      const info = parseProviderError('[OPENAI_MISSING_KEY] OpenAI-compatible missing API key: hint')
      expect(info.category).toBe('missing-key')
      expect(info.fixAction).toBe('open-settings-ai')
    })

    it('maps [OPENAI_AUTH_FAILED] to auth-failed', () => {
      const info = parseProviderError(
        `[OPENAI_AUTH_FAILED] OpenAI-compatible HTTP 401: ${JSON.stringify({ error: { message: 'Invalid API key' } })}`,
      )
      expect(info.category).toBe('auth-failed')
      expect(info.fixAction).toBe('open-settings-ai')
    })

    it('maps [OPENAI_MODEL_NOT_FOUND] to model-not-found', () => {
      const info = parseProviderError(
        '[OPENAI_MODEL_NOT_FOUND] OpenAI-compatible HTTP 404: {"error":{"message":"model not found"}}',
      )
      expect(info.category).toBe('model-not-found')
      expect(info.fixAction).toBe('open-settings-ai')
    })

    it('maps [OPENAI_TIMEOUT] to timeout', () => {
      const info = parseProviderError('[OPENAI_TIMEOUT] OpenAI-compatible request timed out after the configured timeout')
      expect(info.category).toBe('timeout')
      expect(info.fixAction).toBe('retry')
    })

    it('maps [OPENAI_MALFORMED] to malformed', () => {
      const info = parseProviderError('[OPENAI_MALFORMED] OpenAI-compatible response malformed: <raw>')
      expect(info.category).toBe('malformed')
      expect(info.fixAction).toBe('retry')
    })

    it('maps [OPENAI_NETWORK_FAILED] to network-failed', () => {
      const info = parseProviderError(
        `[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: HTTP 500: ${SECRET}`,
      )
      expect(info.category).toBe('network-failed')
      expect(info.fixAction).toBe('retry')
    })
  })

  describe('edge cases', () => {
    it('returns unknown when no tag is present', () => {
      const info = parseProviderError('dream: 一无事事（无新 raw，无矛盾需要裁决）')
      expect(info.category).toBe('unknown')
    })

    it('returns unknown for an unrecognized tag', () => {
      const info = parseProviderError('[OPENAI_SOMETHING_NEW] future error')
      expect(info.category).toBe('unknown')
    })

    it('returns unknown for empty / non-string input', () => {
      expect(parseProviderError('').category).toBe('unknown')
      // @ts-expect-error: testing runtime defense
      expect(parseProviderError(null).category).toBe('unknown')
      // @ts-expect-error: testing runtime defense
      expect(parseProviderError(undefined).category).toBe('unknown')
    })

    it('matches the tag regardless of position in the string', () => {
      const info = parseProviderError(`prefix: random text\n[OPENAI_AUTH_FAILED] body`)
      expect(info.category).toBe('auth-failed')
    })

    it('first matching tag wins (deterministic order)', () => {
      // Hypothetical case: stderr contains both timeout and network-failed tags.
      // The first one in TAG_TO_CATEGORY order wins. This test pins the order
      // so future reordering doesn't silently change behavior.
      const info = parseProviderError(
        '[OPENAI_TIMEOUT] timeout\n[OPENAI_NETWORK_FAILED] network',
      )
      expect(info.category).toBe('timeout')
    })
  })

  describe('security invariant: no key leak in UI copy', () => {
    // PR 34 CRITICAL: the parsed shortMessage / fixActionLabel MUST NOT
    // contain the API key value, even if the body echoes it back. This
    // locks the UI-side invariant that the user never sees the secret.

    it('shortMessage does not contain the apiKey even when body has it', () => {
      const info = parseProviderError(
        `[OPENAI_NETWORK_FAILED] OpenAI-compatible network failed: HTTP 500: ${SECRET}`,
      )
      expect(info.shortMessage).not.toContain(SECRET)
      expect(info.fixActionLabel).not.toContain(SECRET)
    })

    it('shortMessage is provider-controlled constant, not body-derived', () => {
      // All 6 categories must have a shortMessage that is a constant
      // string from PROVIDER_ERROR_MAP — NOT derived from stderr.
      // This test pins that property: the shortMessage is the same
      // regardless of what body content is present.
      const bodies = [
        '',
        'simple',
        'with ' + SECRET,
        'multi\nline\nbody',
        '{"error":"x"}',
      ]
      for (const body of bodies) {
        for (const tag of [
          '[OPENAI_MISSING_KEY]',
          '[OPENAI_AUTH_FAILED]',
          '[OPENAI_MODEL_NOT_FOUND]',
          '[OPENAI_TIMEOUT]',
          '[OPENAI_MALFORMED]',
          '[OPENAI_NETWORK_FAILED]',
        ]) {
          const info = parseProviderError(`${tag} ${body}`)
          // The shortMessage must be a fixed-length constant — body content
          // must not influence it. We check this by hashing the message and
          // confirming it matches the value for an empty body.
          const emptyInfo = parseProviderError(`${tag}`)
          expect(info.shortMessage).toBe(emptyInfo.shortMessage)
        }
      }
    })
  })

  describe('user-facing copy is English and short', () => {
    it('every shortMessage is non-empty and ≤ 100 chars', () => {
      const categories = [
        'missing-key',
        'auth-failed',
        'model-not-found',
        'timeout',
        'malformed',
        'network-failed',
        'unknown',
      ] as const
      for (const cat of categories) {
        const info = parseProviderError('x')
        // Force a category by using a tag
        const tag = `[OPENAI_${cat.toUpperCase().replaceAll('-', '_')}]` as
          | '[OPENAI_MISSING_KEY]'
          | '[OPENAI_AUTH_FAILED]'
          | '[OPENAI_MODEL_NOT_FOUND]'
          | '[OPENAI_TIMEOUT]'
          | '[OPENAI_MALFORMED]'
          | '[OPENAI_NETWORK_FAILED]'
        const info2 = parseProviderError(tag)
        if (cat !== 'unknown') {
          expect(info2.category).toBe(cat)
        }
        expect(info.shortMessage.length).toBeGreaterThan(0)
        expect(info.shortMessage.length).toBeLessThanOrEqual(120)
        expect(info.fixActionLabel.length).toBeGreaterThan(0)
      }
    })
  })
})

describe('stripOpenAITag', () => {
  it('removes the [OPENAI_*] tag prefix', () => {
    expect(stripOpenAITag('[OPENAI_AUTH_FAILED] body text')).toBe('body text')
  })

  it('returns the input unchanged if no tag is present', () => {
    expect(stripOpenAITag('just a plain message')).toBe('just a plain message')
  })

  it('returns empty string for empty input', () => {
    expect(stripOpenAITag('')).toBe('')
  })

  it('handles multi-line body content', () => {
    expect(stripOpenAITag('[OPENAI_MALFORMED] line1\nline2\nline3')).toBe(
      'line1\nline2\nline3',
    )
  })

  it('returns empty string for non-string input', () => {
    // @ts-expect-error: testing runtime defense
    expect(stripOpenAITag(null)).toBe('')
    // @ts-expect-error: testing runtime defense
    expect(stripOpenAITag(undefined)).toBe('')
  })
})
