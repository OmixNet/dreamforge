import { describe, expect, it } from 'vitest'
import { preProcessFileAttachmentMarkdown } from './fileAttachmentMarkdown'
import { isVaultAttachmentUrl } from './vaultAttachments'

// PR 18: file attachment token prefix migration (TOLARIA → DREAMFORGE).
// The internal read path (`readFileAttachmentToken`) dual-recognizes both
// prefixes so old notes continue to resolve attachments. New writes always
// emit the DreamForge prefix. These tests pin the write-side contract so
// a future refactor cannot silently regress the brand.

function buildVaultAttachmentLink(label: string, url: string): string {
  // Pick a URL that satisfies `isVaultAttachmentUrl` so the pre-processor
  // actually rewrites it. Portable attachment paths ("Attachments/foo.pdf")
  // are always valid; Tauri asset URLs require the `asset:` scheme plus a
  // vault path, which is harder to fake in unit tests.
  if (isVaultAttachmentUrl({ url })) {
    return `[${label}](${url})`
  }
  return `[${label}](Attachments/${label}.pdf)`
}

describe('fileAttachmentMarkdown token prefix', () => {
  it('emits the DreamForge prefix when rewriting a standalone attachment link', () => {
    // The pre-processor only rewrites links that occupy their own line
    // (the regex anchors with `^` and `[ \t]*$`). Inline links like
    // "See [report](...)" do not match — the pre-processor leaves them
    // alone, which is fine for the brand-pin test.
    const input = buildVaultAttachmentLink('report', 'asset:///vault/Attachments/report.pdf')
    const result = preProcessFileAttachmentMarkdown({ markdown: input })
    expect(result).toContain('@@DREAMFORGE_FILE_ATTACHMENT:')
    expect(result).not.toContain('@@TOLARIA_FILE_ATTACHMENT:')
  })

  it('does not emit the legacy Tolaria prefix under any input', () => {
    const input = [
      buildVaultAttachmentLink('a', ''),
      buildVaultAttachmentLink('b', ''),
    ].join('\n')
    const result = preProcessFileAttachmentMarkdown({ markdown: input })
    expect(result).not.toContain('@@TOLARIA_FILE_ATTACHMENT:')
  })
})
