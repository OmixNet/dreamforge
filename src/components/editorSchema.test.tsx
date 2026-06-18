import { describe, expect, it } from 'vitest'
import {
  _wikilinkEntriesRef,
  mediaBlockPropsForPreviewRuntime,
  schema,
} from './editorSchema'
import type { VaultEntry } from '../types'

/**
 * v0.3 PR 13: editorSchema branch coverage.
 * Targets the pure helpers and the schema construction. The full BlockNote
 * spec rendering is exercised end-to-end via the schema export — this test
 * only asserts the schema exists + has the expected block + style specs.
 */

function makeEntry(id: string, title: string, icon: string | null = null): VaultEntry {
  return {
    path: `/Users/biomatrix/vault/${id}.md`,
    filename: `${id}.md`,
    title,
    isA: null,
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    trashed: false,
    trashedAt: null,
    modifiedAt: 0,
    createdAt: 0,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    outgoingLinks: [],
    properties: {},
  }
}

describe('editorSchema', () => {
  describe('mediaBlockPropsForPreviewRuntime', () => {
    it('returns the original props when external preview is disabled', () => {
      const props = { block: { props: { showPreview: true } } }
      expect(mediaBlockPropsForPreviewRuntime(props, false)).toBe(props)
    })

    it('forces showPreview=false when external preview is enabled', () => {
      const props = { block: { props: { showPreview: true } } }
      const result = mediaBlockPropsForPreviewRuntime(props, true)
      expect(result.block.props.showPreview).toBe(false)
    })

    it('keeps showPreview=false when external preview is enabled and the prop is already false', () => {
      const props = { block: { props: { showPreview: false } } }
      const result = mediaBlockPropsForPreviewRuntime(props, true)
      expect(result.block.props.showPreview).toBe(false)
    })
  })

  describe('_wikilinkEntriesRef', () => {
    it('starts with an empty entries array', () => {
      expect(_wikilinkEntriesRef.current).toEqual([])
    })

    it('can be reassigned to expose entries to the WikiLink renderer', () => {
      const original = _wikilinkEntriesRef.current
      const entries = [makeEntry('apple', 'Apple', 'apple-icon')]
      _wikilinkEntriesRef.current = entries
      expect(_wikilinkEntriesRef.current).toBe(entries)
      _wikilinkEntriesRef.current = original
    })
  })

  describe('schema', () => {
    it('exports a BlockNoteSchema instance with the slim block + style specs', () => {
      expect(schema).toBeDefined()
      // The schema object exposes its blockSpecs + styleSpecs — slim mode ships
      // audio / codeBlock / mathBlock / video on top of the default BlockNote
      // blocks (paragraph, heading, list, etc.). The DREAMFORGE_SLIM deletes
      // tldraw / mermaid (PR 8).
      const specs = (schema as unknown as { blockSpecs: Record<string, unknown> }).blockSpecs
      const specKeys = Object.keys(specs)
      expect(specKeys).toEqual(expect.arrayContaining(['audio', 'codeBlock', 'mathBlock', 'video']))
      expect(specKeys).not.toEqual(expect.arrayContaining(['tldraw', 'mermaid']))
      const styleSpecs = (schema as unknown as { styleSpecs: Record<string, unknown> }).styleSpecs
      expect(Object.keys(styleSpecs)).toContain('highlight')
    })
  })
})
