// DREAMFORGE_SLIM: PR 8 mathMarkdown stub — 删 katex.renderToString, 保留 math type + processor
// v0.1: 不渲染 math (katex dep 删), 但保留 type definition + block detection 让 BlockNote 集成可用

export const MATH_BLOCK_TYPE = 'math'
export const MATH_INLINE_TYPE = 'mathInline'

/** v0.1 stub: 不检测 inline math 文本, 返回 null (caller type: { match, latex, start, end } | null) */
export function readCompletedInlineMathAtEnd(_args: { text: string }): { match: string; latex: string; start: number; end: number } | null {
  return null
}

/** v0.1 stub: 不预处理 math markdown, 返回原文 (caller type: { markdown: string } → { markdown: string }) */
export function preProcessMathMarkdown(args: { markdown: string }): { markdown: string } {
  return args
}

/** v0.1 stub: 不注入 math block, 返回原 blocks */
export function injectMathInBlocks<T>(blocks: T[]): T[] {
  return blocks
}

/** v0.1 stub: 不渲染 math HTML, 返回空字符串 */
export function renderMathToHtml(_args: { latex: string; displayMode: boolean }): string {
  return ''
}
