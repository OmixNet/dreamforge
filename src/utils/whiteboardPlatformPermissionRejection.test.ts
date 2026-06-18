import { describe, expect, it } from 'vitest'
import {
  hasActiveWhiteboardPlatformPermissionGuard,
  isWhiteboardPlatformPermissionRejection,
  retainWhiteboardPlatformPermissionGuard,
} from './whiteboardPlatformPermissionRejection'

/**
 * v0.3 PR 13: whiteboardPlatformPermissionRejection branch coverage.
 * Pure helpers that survive the DREAMFORGE_SLIM whiteboarding removal —
 * the production runtime still needs to detect "not allowed" rejections
 * even after the whiteboard UI itself is gone.
 */

describe('isWhiteboardPlatformPermissionRejection', () => {
  it('matches Error instances whose name is NotAllowedError (case-insensitive)', () => {
    const err = new Error('something')
    err.name = 'NotAllowedError'
    expect(isWhiteboardPlatformPermissionRejection(err)).toBe(true)
  })

  it('matches string rejection reasons that contain "notallowederror"', () => {
    expect(isWhiteboardPlatformPermissionRejection('NotAllowedError: nope')).toBe(true)
  })

  it('matches string reasons that combine "not allowed" with "permission" / "platform" / "user agent"', () => {
    expect(isWhiteboardPlatformPermissionRejection('Not allowed: permission denied')).toBe(true)
    expect(isWhiteboardPlatformPermissionRejection('Not allowed: platform error')).toBe(true)
    expect(isWhiteboardPlatformPermissionRejection('Not allowed: user agent')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isWhiteboardPlatformPermissionRejection(new Error('boom'))).toBe(false)
    expect(isWhiteboardPlatformPermissionRejection({ name: 'TypeError' })).toBe(false)
    expect(isWhiteboardPlatformPermissionRejection(null)).toBe(false)
    expect(isWhiteboardPlatformPermissionRejection(undefined)).toBe(false)
  })

  it('returns false when only "not allowed" appears without the supporting keywords', () => {
    expect(isWhiteboardPlatformPermissionRejection('operation not allowed')).toBe(false)
  })
})

describe('retainWhiteboardPlatformPermissionGuard', () => {
  it('increments and decrements the active guard count', () => {
    const release = retainWhiteboardPlatformPermissionGuard()
    expect(hasActiveWhiteboardPlatformPermissionGuard()).toBe(true)
    release()
    expect(hasActiveWhiteboardPlatformPermissionGuard()).toBe(false)
  })

  it('releasing twice is a no-op', () => {
    const release = retainWhiteboardPlatformPermissionGuard()
    release()
    release()
    expect(hasActiveWhiteboardPlatformPermissionGuard()).toBe(false)
  })
})
