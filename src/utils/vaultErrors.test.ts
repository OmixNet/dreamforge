import { describe, expect, it } from 'vitest'
import {
  errorMessage,
  isActiveVaultUnavailableError,
} from './vaultErrors'

/**
 * v0.3 PR 12.1: small pure-helper module — easy branch coverage lift.
 */

describe('vaultErrors', () => {
  describe('errorMessage', () => {
    it('returns the message for Error instances', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom')
    })

    it('returns the string itself when given a string', () => {
      expect(errorMessage('plain text')).toBe('plain text')
    })

    it('coerces other values via String()', () => {
      expect(errorMessage(null)).toBe('null')
      expect(errorMessage(undefined)).toBe('undefined')
      expect(errorMessage(42)).toBe('42')
    })
  })

  describe('isActiveVaultUnavailableError', () => {
    it('matches the "no active vault selected" message (case-insensitive)', () => {
      expect(isActiveVaultUnavailableError('No active vault selected')).toBe(true)
      expect(isActiveVaultUnavailableError('no active vault selected.')).toBe(true)
    })

    it('matches the "active vault is not available" message', () => {
      expect(isActiveVaultUnavailableError('Active vault is not available right now')).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isActiveVaultUnavailableError('something else')).toBe(false)
      expect(isActiveVaultUnavailableError(new Error('disk full'))).toBe(false)
    })

    it('returns false for null / undefined', () => {
      expect(isActiveVaultUnavailableError(null)).toBe(false)
      expect(isActiveVaultUnavailableError(undefined)).toBe(false)
    })
  })
})
