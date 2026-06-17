import { describe, expect, it } from 'vitest'
import { headingBlockText, hasTitleHeadingText } from './editorTitleHeadingText'

/**
 * v0.3 PR 12.2: editorTitleHeadingText branch coverage.
 * Pure helper used by the editor / knowledge-graph title probe.
 */

describe('headingBlockText', () => {
  it('returns an empty string when the block is undefined', () => {
    expect(headingBlockText(undefined)).toBe('')
  })

  it('returns an empty string when content is not an array', () => {
    expect(headingBlockText({ content: 'plain text' })).toBe('')
    expect(headingBlockText({ content: null })).toBe('')
    expect(headingBlockText({ content: { type: 'text', text: 'x' } })).toBe('')
  })

  it('joins text segments and trims the result', () => {
    const block = {
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ],
    }
    expect(headingBlockText(block)).toBe('Hello World')
  })

  it('ignores non-text inline items', () => {
    const block = {
      content: [
        { type: 'text', text: 'A' },
        { type: 'link', url: 'https://example.com' }, // not type=text
        { type: 'text', text: 'B' },
        null,
        'raw string', // not an object
        42,
      ],
    }
    expect(headingBlockText(block)).toBe('AB')
  })

  it('substitutes empty strings for missing text fields', () => {
    const block = {
      content: [
        { type: 'text' },
        { type: 'text', text: 'tail' },
      ],
    }
    expect(headingBlockText(block)).toBe('tail')
  })
})

describe('hasTitleHeadingText', () => {
  it('returns false when neither the DOM heading nor the block text is present', () => {
    // No selector match + empty block content.
    expect(hasTitleHeadingText({ content: [] })).toBe(false)
  })

  it('returns true when the block content has any text', () => {
    expect(hasTitleHeadingText({ content: [{ type: 'text', text: 'x' }] })).toBe(true)
  })
})
