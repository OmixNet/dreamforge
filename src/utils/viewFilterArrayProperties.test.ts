import { describe, expect, it } from 'vitest'
import { evaluatePropertyArrayCondition } from './viewFilterArrayProperties'
import type { FilterCondition } from '../types'

/**
 * v0.3 PR 13: viewFilterArrayProperties branch coverage.
 * Covers every FilterCondition op (contains, not_contains, equals, not_equals,
 * any_of, none_of, is_empty, is_not_empty) plus the regex fast path and
 * the unknown-op fallback.
 */

describe('evaluatePropertyArrayCondition', () => {
  it('matches contains / not_contains with a plain value', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'contains' },
        ['apple', 'banana'],
        'apple',
        null,
      ),
    ).toBe(true)
    expect(
      evaluatePropertyArrayCondition(
        { op: 'not_contains' },
        ['apple', 'banana'],
        'cherry',
        null,
      ),
    ).toBe(true)
  })

  it('matches equals / not_equals only when the field has exactly one matching value', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'equals' },
        ['apple'],
        'apple',
        null,
      ),
    ).toBe(true)
    // Two entries with the same value — equals returns false (must be length 1).
    expect(
      evaluatePropertyArrayCondition(
        { op: 'equals' },
        ['apple', 'apple'],
        'apple',
        null,
      ),
    ).toBe(false)
    expect(
      evaluatePropertyArrayCondition(
        { op: 'not_equals' },
        ['apple', 'banana'],
        'apple',
        null,
      ),
    ).toBe(true)
  })

  it('matches any_of / none_of with a value list', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'any_of', value: ['banana', 'cherry'] },
        ['apple', 'banana'],
        '',
        null,
      ),
    ).toBe(true)
    expect(
      evaluatePropertyArrayCondition(
        { op: 'none_of', value: ['banana', 'cherry'] },
        ['apple', 'apple'],
        '',
        null,
      ),
    ).toBe(true)
  })

  it('matches is_empty / is_not_empty', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'is_empty' },
        [],
        '',
        null,
      ),
    ).toBe(true)
    expect(
      evaluatePropertyArrayCondition(
        { op: 'is_not_empty' },
        ['apple'],
        '',
        null,
      ),
    ).toBe(true)
  })

  it('uses the regex fast path when a regex is provided', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'contains' },
        ['apple', 'banana'],
        '',
        /ban/,
      ),
    ).toBe(true)
    expect(
      evaluatePropertyArrayCondition(
        { op: 'not_contains' },
        ['apple'],
        '',
        /zzz/,
      ),
    ).toBe(true)
  })

  it('returns false for any_of when the value is not an array', () => {
    // conditionList is strict — non-array values yield no matches.
    expect(
      evaluatePropertyArrayCondition(
        { op: 'any_of', value: 'banana' },
        ['banana'],
        '',
        null,
      ),
    ).toBe(false)
  })

  it('returns false for unknown ops', () => {
    expect(
      evaluatePropertyArrayCondition(
        { op: 'unknown_op' as FilterCondition['op'] },
        ['apple'],
        '',
        null,
      ),
    ).toBe(false)
  })
})
