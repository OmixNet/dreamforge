import type { useCreateBlockNote } from '@blocknote/react'
import { compactMarkdown } from './compact-markdown'
// DREAMFORGE_SLIM: serializeDurableEditorBlocks 物理删除 (PR 8, editorDurableMarkdown 删)
import { portableFileAttachmentUrls } from './fileAttachmentMarkdown'
import { portableImageUrls } from './vaultImages'
// DREAMFORGE_SLIM: restoreWikilinksInBlocks 物理删除 (PR 8, serializeDurableEditorBlocks caller 删, 改用 editor.document 直接)
import { splitFrontmatter } from './wikilinks'

export function serializeRichEditorBodyToMarkdown(
  editor: ReturnType<typeof useCreateBlockNote>,
  _vaultPath?: string,
): string {
  // DREAMFORGE_SLIM: serializeDurableEditorBlocks + restored 物理删除 (PR 8),
  // 直接 compactMarkdown(editor.blocksToMarkdownLossy(editor.document))
  return compactMarkdown(editor.blocksToMarkdownLossy(editor.document))
}

export function serializeRichEditorDocumentToMarkdown(
  editor: ReturnType<typeof useCreateBlockNote>,
  tabContent: string,
  vaultPath?: string,
  notePath?: string,
): string {
  const rawBodyMarkdown = serializeRichEditorBodyToMarkdown(editor, vaultPath)
  const bodyMarkdown = vaultPath
    ? portableFileAttachmentUrls(
      portableImageUrls(rawBodyMarkdown, vaultPath, notePath),
      vaultPath,
    )
    : rawBodyMarkdown
  const [frontmatter] = splitFrontmatter(tabContent)
  return `${frontmatter}${bodyMarkdown}`
}
