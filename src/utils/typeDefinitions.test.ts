import { describe, expect, it } from 'vitest'
import { typeWorkspaceKey } from './typeDefinitions'

// PR 18: NO_WORKSPACE_KEY was renamed from `__tolaria_no_workspace__` to
// `__dreamforge_no_workspace__`. The sentinel is internal (used as a key
// into the in-memory typeLookup map) — never persisted to user files or
// URLs — so a direct rename is safe. This test pins the new value so a
// future refactor cannot silently regress the brand.

describe('typeWorkspaceKey (PR 18 rebrand)', () => {
  it('uses the DreamX sentinel when path is empty', () => {
    expect(typeWorkspaceKey({ path: '' })).toBe('__dreamforge_no_workspace__')
  })

  it('uses the DreamX sentinel when path is null', () => {
    expect(typeWorkspaceKey({ path: null })).toBe('__dreamforge_no_workspace__')
  })

  it('uses the DreamX sentinel when path is whitespace only', () => {
    expect(typeWorkspaceKey({ path: '   ' })).toBe('__dreamforge_no_workspace__')
  })

  it('uses the trimmed path when path is non-empty', () => {
    expect(typeWorkspaceKey({ path: '/tmp/vault' })).toBe('/tmp/vault')
    expect(typeWorkspaceKey({ path: '  /tmp/vault  ' })).toBe('/tmp/vault')
  })

  it('does not leak the legacy Tolaria sentinel', () => {
    expect(typeWorkspaceKey({ path: '' })).not.toBe('__tolaria_no_workspace__')
    expect(typeWorkspaceKey({ path: null })).not.toBe('__tolaria_no_workspace__')
  })
})
