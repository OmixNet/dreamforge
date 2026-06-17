import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SlimSidebar } from './SlimSidebar'
import { isSlimFolderId } from '../utils/slimSelection'
import type { VaultEntry } from '../types'

function makeEntry(path: string, title: string): VaultEntry {
  return {
    path,
    filename: path.split('/').pop() ?? '',
    title,
    isA: null,
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
  }
}

const VAULT = '/Users/test/dreamforge-test-vault'

describe('SlimSidebar', () => {
  it('renders all five fixed entries with the right labels', () => {
    render(
      <SlimSidebar
        vaultPath={VAULT}
        entries={[]}
        selection={null}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByTestId('slim-sidebar-notes')).toHaveTextContent('Notes')
    expect(screen.getByTestId('slim-sidebar-wiki')).toHaveTextContent('Wiki')
    expect(screen.getByTestId('slim-sidebar-memory')).toHaveTextContent('Memory')
    expect(screen.getByTestId('slim-sidebar-raw')).toHaveTextContent('Raw')
    expect(screen.getByTestId('slim-sidebar-archive')).toHaveTextContent('Archive')
  })

  it('counts entries under each folder using absolute path prefix', () => {
    const entries: VaultEntry[] = [
      makeEntry(`${VAULT}/notes/a.md`, 'A'),
      makeEntry(`${VAULT}/notes/sub/b.md`, 'B'),
      makeEntry(`${VAULT}/wiki/page.md`, 'Wiki Page'),
      makeEntry(`${VAULT}/raw/source.txt`, 'Source'),
      makeEntry(`${VAULT}/MEMORY.md`, 'Memory'),
      makeEntry(`${VAULT}/unrelated.md`, 'Unrelated'),
    ]

    render(
      <SlimSidebar
        vaultPath={VAULT}
        entries={entries}
        selection={null}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByTestId('slim-sidebar-notes')).toHaveTextContent('2')
    expect(screen.getByTestId('slim-sidebar-wiki')).toHaveTextContent('1')
    expect(screen.getByTestId('slim-sidebar-memory')).toHaveTextContent('1')
    expect(screen.getByTestId('slim-sidebar-raw')).toHaveTextContent('1')
    expect(screen.getByTestId('slim-sidebar-archive')).toHaveTextContent('0')
  })

  it('marks the active folder with aria-current="page"', () => {
    render(
      <SlimSidebar
        vaultPath={VAULT}
        entries={[]}
        selection={'wiki'}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByTestId('slim-sidebar-wiki')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('slim-sidebar-notes')).not.toHaveAttribute('aria-current')
  })

  it('invokes onSelect with the folder id when clicked', () => {
    const onSelect = vi.fn()
    render(
      <SlimSidebar
        vaultPath={VAULT}
        entries={[]}
        selection={null}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByTestId('slim-sidebar-memory'))
    expect(onSelect).toHaveBeenCalledWith('memory')

    fireEvent.click(screen.getByTestId('slim-sidebar-raw'))
    expect(onSelect).toHaveBeenCalledWith('raw')
  })

  it('isSlimFolderId narrows unknown values', () => {
    expect(isSlimFolderId('notes')).toBe(true)
    expect(isSlimFolderId('archive')).toBe(true)
    expect(isSlimFolderId('inbox')).toBe(false)
    expect(isSlimFolderId(null)).toBe(false)
    expect(isSlimFolderId(undefined)).toBe(false)
    expect(isSlimFolderId(42)).toBe(false)
  })
})
