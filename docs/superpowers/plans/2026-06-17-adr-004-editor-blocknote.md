# ADR-004: Editor — BlockNote 0.46.2 lock + 11 dep 物理删

- Status: Accepted (v0.1.3, 2026-06-17)
- Deciders: dreamforge core
- Source: PR 8 (TS dep 物理删), PR 9.5 (残 CSS rules + dead test trash), §21

## Context

Tolaria editor had:

- **BlockNote 0.46.2** as base editor framework (TipTap-based)
- **Tldraw whiteboard** (`@tldraw/tldraw` + `@tldraw/assets`) for canvas blocks
- **Mermaid diagram** (`mermaid` package) for diagram blocks
- **KaTeX math** (`katex` + `katex/dist/katex.min.css`) for math blocks
- **Sentry** (`@sentry/react`) for error reporting
- **PostHog** (`posthog-js`) for product analytics
- **Anthropic SDK** (`@anthropic-ai/sdk`) for AI agent integration
- **Deep link** (`@tauri-apps/plugin-deep-link`) for `tolaria://` URL scheme
- **Updater** (`@tauri-apps/plugin-updater`) for in-app update flow
- **Playwright** (`@playwright/test`) for e2e tests
- **Lara CLI** (`@translated/lara-cli`) for translation
- **ws** (`ws` + `@types/ws`) for WebSocket bridge
- **VitePress** (`vitepress`) for docs site

In v0.1 slim shell, these add 11 deps + 9 leaf files + 11 dead tests + 1000+ lines of integration code, **without** being used in the slim UI (5 entries: Notes/Wiki/Memory/Raw/Archive, no whiteboard/diagram/math need).

## Decision

- **Keep**: BlockNote 0.46.2 (lock) + Mantine 7 + React 19 + TipTap (transitively via BlockNote)
- **Pin**: `@tiptap/extension-highlight@3.19.0` via `pnpm.overrides` (PR 5 lesson — match core 3.19.0)
- **物理删 (11 deps)**: tldraw / @tldraw/assets / mermaid / katex / @sentry/react / posthog-js / @anthropic-ai-sdk / @tauri-apps/plugin-deep-link / @tauri-apps/plugin-updater / @playwright/test / @translated/lara-cli / @types/ws / vitepress / ws
- **Stub 化 (2 files)**: `src/lib/telemetry.ts` (no-op `trackEvent` + 7 fn), `src/utils/mathMarkdown.ts` (`MATH_BLOCK_TYPE` / `INLINE` + 4 fn no-op) — preserve type contracts for the 14 / 4 importing files
- **残 dep call sites** (PR 8): 4 `defaultAiAgent*` prop in `Editor.tsx` + `AppAiWorkspaceSurface.tsx` + `AiWorkspaceWindowApp.tsx` (删); `tolariaEditorFormattingConfig.ts` (删 `MERMAID_BLOCK_TYPE` / `TLDRAW_BLOCK_TYPE` / `createBoardId` / `createWhiteboardSlashMenuItem` / `createMermaidSlashMenuItem` imports)
- **残 test files trash (11)**: `editorSchema.math.test.tsx` (PR 9.5) + 10 others (App / StatusBar / editorModePosition / useEditorModePositionSync / appCommandCatalog / Dispatcher / useAppKeyboard / useCommandRegistry / useEditorTabSwap / useMenuEvents / main)
- **残 CSS rules trash** (PR 9.5): `Editor.css` 2 lines (mermaid/tldraw/katex PDF export), `EditorTheme.css` 199+199 lines (mermaid/tldraw/katex theme)
- **Residual test rename** (PR 9.5): `tauriCsp.test.ts` 1 it renamed to drop tldraw reference (test 实际测 CSP, 不测 tldraw)

## Consequences

### Bundle / compile

- 21MB → 18MB .app (-14%), 20.5MB → 16.6MB binary (-19%)
- `tsc -b` 7s, `pnpm build` 7s, `pnpm tauri build` 27.7s (cached)
- Test count: 3974 → 3973 (-1 dead test file with 6 tests in `math.test.tsx`; -1 test renames in tauriCsp)

### Lost features in v0.1

- No whiteboard drawing (tldraw)
- No diagram blocks (mermaid)
- No math rendering (katex)
- No error reporting (Sentry)
- No product analytics (PostHog)
- No AI agent integration (Anthropic SDK)
- No deep link routing
- No in-app updater
- No e2e tests (Playwright)
- No translation flow (Lara)
- No WebSocket bridge

### Forward compatibility

- v0.2+ re-introduction path: each is a separate ADR (e.g. ADR for "AI agent re-introduction" would re-add Anthropic SDK)
- Stub files (`telemetry.ts`, `mathMarkdown.ts`) preserve type contracts so adding real impl later is non-breaking

## Alternatives Considered

- **Keep tldraw for whiteboard**: high value for visual thinking, but 1.5MB+ bundle. Rejected: not in v0.1 slim scope, v0.2+ as separate feature.
- **Use TipTap directly (no BlockNote)**: lower-level, more flexible, more code. Rejected: BlockNote 0.46.2 is stable, dreamforge doesn't need TipTap-level control.
- **Keep Sentry for production error tracking**: useful but adds Sentry project + token management. Rejected: v0.1 is single-developer, `dreamforge-test-vault` is local, errors are visible in console.

## Implementation pointer

- `package.json` `pnpm.overrides` L20-30 (TipTap pin)
- `src/lib/telemetry.ts` (stub, 14 file imports)
- `src/utils/mathMarkdown.ts` (stub, 4 file imports)
- `src/components/Editor.css` 521 lines (post-cleanup)
- `src/components/EditorTheme.css` 382 lines (post-cleanup)
- 11 dep trashed in `package.json` + `pnpm-lock.yaml` regenerated
- 4 prop trashed in `Editor.tsx` / `AppAiWorkspaceSurface.tsx` / `AiWorkspaceWindowApp.tsx`
- Decision log §21 (PR 8 dep 物理删), §23 (PR 9.5 CSS + test cleanup)
