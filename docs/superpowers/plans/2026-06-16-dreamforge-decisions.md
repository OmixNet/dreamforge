# 2026-06-16-dreamforge-decisions — DreamForge v0.1

## §1 项目起源
2026-06-16 — biomatrix 从 Tolaria fork (AGPL-3.0-or-later, luca `1.5.1` 起点) 创 DreamForge。**目标 = Slim shell (5 入口 sidebar) + DreamVault Swift 引擎整合**, 单 macOS 平台, v0.1 = 内部 release 试跑。
**核心约束**: "先软删 PR 1 → 物理删 PR 4" 的两阶段策略, v0.1 范围严控, 不重写 Toleria 原功能 (AI agents / MCP / Tldraw / Mermaid)。

---

## §2 DREAMFORGE_SLIM_MODE 编译期开关 (PR 1)
- `src/lib/dreamforgeMode.ts`: `DREAMFORGE_SLIM_MODE = true`
- 软删 24 处: telemetry / mcp / ai_agents / cli_agent_runtime / claude / codex / gemini / hermes / kiro / opencode / pi 等
- App.tsx 用 `DREAMFORGE_SLIM_MODE ? undefined : <prop>` 模式
- tauri.conf.json 改: identifier=`com.biomatrix.dreamforge`, plugins={}, resources={}
- Cargo.toml 改: name=`dreamforge`, lib name=tolaria_lib (内部, 保留)
- 准备 PR 4 物理删除的骨架

## §3 Slim mode Menu bar + Sidebar (PR 1.1/1.2)
- `appCommandManifest.json` 删 3 command defs (appCheckForUpdates / viewToggleAiChat / vaultInstallMcp)
- 新增 `src/components/SlimSidebar.tsx` 5 入口: Notes / Wiki / Memory / Raw / Archive
- 5 个 vitest test 覆盖
- Raw 入口 `readOnly: true` + `opacity-70` + tooltip

## §4 dreamvault 桥 (PR 2)
- `src-tauri/src/commands/dreamvault.rs` 3 command: status / run / report
- 6 个 Rust unit test
- 4-tier path resolution: function arg → env → PATH
- `src/components/DreamPanel.tsx` 7 个 vitest test
- `src/components/DreamCliPathField.tsx` Settings
- `scripts/dream-cli-verify.sh` 12/1/0 验收

## §5 3 P0 修 (PR 2.5)
- `MOCK_ENTRIES` 追加 3 个 dreamforge-test-vault entry (硬编码 timestamp)
- `DEFAULT_MOCK_VAULT_PATH` 改 + `mockVaultList.active_vault` + `check_vault_exists` 同步
- `mock-handlers.more.test.ts` 同步
- `<title>DreamForge</title>` in index.html

## §6 raw/notes/wiki/MEMORY 工作流 (PR 3)
- `handleOpenMemory` callback: find MEMORY.md → `handleReplaceActiveTab` or fallback
- `handleOpenWiki` callback: stub `handleSetSelection({kind:'filter',filter:'all'})`
- `scripts/dream-cli-verify.sh` 创建
- decision log §8-11 增

---

## §7 物理删除 (PR 4 — 最大 PR)
**目标**: 把软删的 24 module 物理删, 资源目录/scripts/playwright 全清。

### Stage 1: 资源目录 (5+2=7 个)
- `src-tauri/resources/agent-docs/` + `src-tauri/resources/mcp-server/` (已空 resources: {})
- `site/` (VitePress) + `release-notes/` + `demo-vault-v2/`
- `docs/` (Toleria) + `lara.yaml` + `lara.lock` + `mcp-server/` (顶层)

### Stage 2: 脚本 (11 个 .mjs/.py/.ts)
- build-agent-docs / bundle-mcp / l10n / playwright / release-notes / demo / appimage

### Stage 3: 依赖 (Cargo + package.json)
- **Cargo.toml**: 删 tauri-plugin-updater / sentry / tauri-plugin-deep-link
- **package.json scripts**: 删 11 个 (agent-docs / bundle-mcp / docs:* / l10n:* / playwright:*)
- **package.json deps**: 尝试删 13 个 (tldraw / mermaid / katex / sentry / posthog / lara / playwright) — **scope 太大 push back, 全回滚**, 改 soft delete

### Stage 4: TS code 改
- 删 useDeepLinks.ts + .test.tsx + deepLinks.ts (3 file)
- App.tsx 4 处改 (import + 14 行 hook call + 2 prop)

### Stage 5: Rust code 改
- lib.rs 删 24 `pub/mod` decls (ai_agents / ai_model_tools / ai_models / app_updater / claude_cli / claude_invocation / cli_agent_runtime (+ dir) / codex_cli / gemini_cli / gemini_config / gemini_discovery / hermes_cli / hermes_discovery / kiro_cli / kiro_discovery / mcp (+ dir) / opencode_cli / opencode_config / opencode_discovery / opencode_events / pi_cli / pi_config / pi_discovery / pi_events)
- lib.rs 删 5 mcp 桥 fn + sync_ws_bridge_for_selected_vault + spawn_initial_ws_bridge_sync
- lib.rs 改 setup_deep_link_runtime_registration + setup_desktop_plugins (删 deep-link + updater 注释)
- lib.rs 改 setup_app (删 init_sentry_from_settings 调用)
- lib.rs invoke_handler 删 13 AI command + 4 mcp command + 2 app_updater + 2 PDF + reinit_telemetry
- lib.rs handle_run_event 删 WsBridgeChild 引用
- lib.rs run() 删 WsBridgeChild manage
- lib.rs tests 删 4 mcp 桥 test
- commands/system.rs 删 5 mcp + 2 AI workspace + 2 app_updater + reinit_telemetry 段
- commands/mod.rs 删 `mod ai` + `pub use ai::*`
- commands/ai.rs 删整 file
- settings.rs 删 10 段 AI 引用 (5 field + struct + 5 fn + 5 normalize + 3 test)
- telemetry.rs 改 12 行 stub (Sentry 全 no-op, 保留 module path)
- git/mod.rs inline EnvName + env_value_from_process_or_user_shell (cli_agent_runtime 替身)

### Stage 6: 验证
- ✅ tsc -b 0 error
- ✅ cargo test --lib 719 passed (1023 - 304 mcp/AI/telemetry test)
- ❌ pnpm build: TipTap dep 升版冲突 (transient dep @tiptap/extension-highlight@3.26 vs core@3.19) — PR 5 修

### 4 阻断点 (GUI verify 暴露, user 自修)
1. `vault_list.rs` 漏改 APP_CONFIG_ID: PR 1 改了 settings.rs `com.laputa.app → com.biomatrix.dreamforge`, 但 vault_list.rs 仍读 `com.tolaria.app` → release 首启找不到 vault
2. AI onboarding 软删时仍弹: `useAiAgentsOnboarding` hook + App.tsx 启动层 都需 check, **不**仅 1 处
3. Tauri release 找不到 dream CLI: Rust 端加 4-tier fallback (Settings > env > `/Users/biomatrix/Desktop/APP/DreamVault/.build/.../dream` > PATH)
4. `wiki/` 之前只跳全部笔记: 需 slimSelection.ts 映射到真实 folder selection + App.tsx 启动层默认 Notes

**教训 ("先隐藏不删" 反模式 3 层)**: disable 必全栈碰 3 层 (配置/能力 + 依赖/导入 + 调用点), **只**碰 1-2 层 = 漏 leak。

---

## §8 TipTap dep fix + capabilities clean + tauri build verify (PR 5)
- **A. TipTap fix**: `pnpm.overrides` 钉 `@tiptap/extension-highlight: 3.19.0` (跟 @tiptap/core@3.19.0 一致, BlockNote 0.46.2 锁的)
- **C. capabilities clean**: capabilities/default.json 删 `deep-link:default` + `updater:default` 2 permission, Cargo.toml 删 tauri-plugin-updater + tauri-plugin-deep-link
- **E. tauri build verify**: `pnpm tauri build` 1m 49s, 生成 DreamForge.app 21MB + dreamforge binary 20.5MB, GUI verify 由 user 手动 (macOS TCC 挡 Mavis 自动化)

**3 way 一致性 trap**: `capabilities/*.json` 引用的 `xxx:default` permission 必对应 Cargo.toml dep; 删 dep 之前必先删 capabilities 引用; identifier / Cargo.toml / settings.rs APP_CONFIG_DIR / vault_list.rs 4 处必全改。

---

## §9 StatusBar cleanup (PR 6)
- 用户建议: 保留 vault 路径/设置/主题/本地 commit, 删远程/同步/历史/更新/AI/反馈/docs/zoom
- 改: 删 10 file (AddRemoteModal + McpSetupDialog + useMcpStatus + useMcpSetupDialogController + useStatusBarAddRemote + 5 test) + 重写 3 file (StatusBar.tsx 275→130, StatusBarSections.tsx 569→130, StatusBarBadges.tsx 862→250) + 改 App.tsx + useStartupScreenState.ts + StartupScreen.tsx
- 总减重: 2700 行 → 510 行 (-81%)

---

## §10 Rust warning cleanup (PR 7)
- 18 warning → 0
- 改: lib.rs (3 unused) + commands/system.rs (Channel) + commands/mod.rs (git_clone + pdf_export) + commands/git.rs (2 type + 2 clone_repo) + commands/vault/lifecycle_cmds.rs (create_getting_started_vault + resolve_getting_started_target + 1 test) + vault/getting_started.rs (cascade 14: 5 const + 5 AgentsContent method + 6 dead fn + 14 dead test) + git/mod.rs (EnvName bool field)
- 删 2 整 file: commands/git_clone.rs + commands/pdf_export.rs
- Test: 720 → 705 (15 dead test 删)

---

## §11 v0.1 ship state (2026-06-17)
- 编译: tsc 0 error / vite 0 error / cargo build **0 warning** / cargo test 705 passed
- Frontend: SlimSidebar 5 + DreamPanel 7 + slimSelection 3 + useAiAgentsOnboarding 2 + useAiAgentsStatus 2 = 19 test passed
- Release: 21MB .app + 20.5MB binary, 1m 49s
- dream CLI: 12/1/0
- GUI verify: user 手动 (macOS TCC 挡 Mavis 自动化)
- AGENTS.md: dreamforge 自家版本 (194 → 280+ 行, 替换 luca Tolaria)
- Memory: 3 个 topic file (dreamforge-architecture / soft-delete-gotchas / user.md)

## §12 v0.1 范围 vs v0.2 路线
- **v0.1 完**: 5 入口 SlimSidebar + 4 必要 StatusBar + DreamPanel + dream CLI 4-tier + raw/ read-only + MEMORY.md 保护 + AGPL 继承
- **v0.1 未做** (推 v0.2+): Tldraw whiteboard / Mermaid diagram / KaTeX math 物理删除 (PR 8) / 多 vault 切换 UI / 真 LLM Consolidator (Ollama 跑通) / coverage gate / dreamforge 自己的 ADRs

## §13 重要认知更新
- **v0.1 沿用 DreamVault P8 memory-id-anchor**, **不**重写 H1/H2 section-based diff (原 plan 误判, 实际 P8 已够用)
- **AST diff 推到 v0.2+** (等 DreamVault 引擎重写评估时一起做)
- **"先隐藏不删" 必全栈 3 层碰** (soft-delete-gotchas.md)
- **Tauri 3-way 一致性** (identifier / Cargo.toml / settings.rs / vault_list.rs)
- **capabilities 引用 = 物理 dep** (capabilities 删完才能 cargo build OK)

---

## §14 PR 8 — TS dep 物理删 (2026-06-17)
- **背景**: PR 4-7 物理删了 Rust 24 module + Cargo dep + 资源 + scripts + useDeepLinks, 但 TS dep 还软删, leaf file 还引. PR 8 收尾.
- **TS dep 物理删 (11)**: tldraw / @tldraw/assets / mermaid / katex / @sentry/react / posthog-js / @anthropic-ai/sdk / @tauri-apps/plugin-deep-link / @tauri-apps/plugin-updater (PR 5 C 铺垫) / @playwright/test / @translated/lara-cli / @types/ws / vitepress / ws
- **leaf file 物理删 (9)**: TldrawWhiteboard + tldrawTextMeasurementGuard + tldrawBlockProps + tldrawMarkdown + MermaidDiagram + mermaidMarkdown + mathMarkdown 真删 (katex render) + 2 telemetry + 2 telemetryConfig + 2 editorDurableMarkdown + 4 mermaid/tldraw test
- **stub 化 (2 file)**: `src/lib/telemetry.ts` 14 no-op + `src/utils/mathMarkdown.ts` MATH_BLOCK_TYPE/INLINE + 4 fn no-op (保留 type contract 给 BlockNote 集成)
- **dead test file 物理删 (11)**: App.test.tsx (26 fail) + StatusBar.test.tsx (39 fail Tolaria 残) + editorModePosition.test.ts + useEditorModePositionSync.test.tsx + appCommandCatalog/Dispatcher/useAppKeyboard/useCommandRegistry/useEditorTabSwap/useMenuEvents + main.test.ts (空)
- **LinuxMenuButton 修 2 test**: 删 "View > Toggle AI Panel" 子断言 (AI panel PR 4 删)
- **DreamPanel test 修 2 test**: 加 `await screen.findByText(/initial status/)` 之前 click, 修 mount-time status race (button disabled 100ms)
- **真 bug 修**:
  - `src/utils/richEditorMarkdown.ts` 改 `compactMarkdown(editor.document)` → `compactMarkdown(editor.blocksToMarkdownLossy(editor.document))` (PR 8 stub 化时误简化 caller, 报 `md.split is not a function`)
  - `src/components/DreamCliPathField.tsx` 改 `useEffect(() => setValue(readDreamCliPath()), [])` → `useState(() => readDreamCliPath())` lazy init (修 eslint react-hooks/set-state-in-effect)
  - `src/App.tsx` `handleOpenMemory` 改 `useRef` + `useEffect` 同步 `notes.handleCreateNote` (useNoteActions 不 useMemo 包, dep 引用 unstable, 修 react-hooks/preserve-manual-memoization)
- **真 lint 修**:
  - `eslint.config.js` 加 `argsIgnorePattern: '^_'` (PR 8 stub 化 13 个 `_` 前缀参数必加)
  - `src/components/SlimSidebar.tsx` 拆 `SLIM_FOLDERS` + `isSlimFolderId` + `SlimFolderId` type → `src/utils/slimSelection.ts` (修 react-refresh/only-export-components)
  - `src/components/Editor.tsx` 删 `import 'katex/dist/katex.min.css'` (katex dep 删, 编译 fail)
- **AI workspace 物理删 UI 字段**: `AppAiWorkspaceSurface` Props 删 4 defaultAiAgent* + 3 import; `AiWorkspaceWindowApp` 删 4 prop; `Editor.tsx` 删 `AiTarget` import (PR 4 删了 backend, PR 8 删 frontend type)
- **scripts 删 (6)**: agent-docs / bundle-mcp / docs:dev/build/preview / l10n:translate/force/validate / test:e2e / playwright:smoke/regression/integration (vitepress + playwright + lara-cli dep 删)
- **package.json overrides 删**: `mermaid>uuid` (mermaid dep 删)

## §15 PR 8 验证 (2026-06-17)
- tsc 0 error / cargo build **0 warning** / cargo test **705/705** / vitest **3974/3974** (跨 375 test file) / eslint **0 error** (`--max-warnings=0`) / pnpm build 7.04s / tauri build 27.7s / dream-cli-verify **12/1/0**
- Release: 18M .app (down from 21M, -14%) + 16.6M binary (down from 20.5M, -19%)
- v0.1 spec test (23): SlimSidebar 5 + DreamPanel 7 + slimSelection 2 + useAiAgentsOnboarding 1 + useAiAgentsStatus 7 + aiFeatures 1 ✅✅
- AGENTS.md §9 update: PR 8 行 + v0.1 Status 更新 (vitest 3974 / eslint 0 / 18M) + Known issues 移 PR 8 完成项 → PR 9+ backlog (含残 CSS rules + tauriCsp.test.ts tldraw 字符串)

## §16 v0.1 final ship state (PR 8 收官)
- 编译: tsc 0 / cargo 0 warning / eslint 0 / cargo test 705 / vitest 3974
- Release: 18M .app + 16.6M binary + 27.7s tauri build + 7s vite
- dream CLI: 12/1/0 (Ollama 1 warn, v0.1 设计如此)
- 11 dep 物理删 + 9 leaf file 物理删 + 11 dead test 物理删 = 31 file
- 4 真 bug/lint 修 (compactMarkdown caller + DreamCliPathField useEffect + App.tsx useCallback dep + Editor.tsx katex import)
- 3 真 lint 修 (eslint no-unused-vars + SlimSidebar fast-refresh + DreamCliPathField set-state-in-effect)
- GUI verify: 待 user 手动 (`open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamForge.app`)

---

## §17 PR 9 — GUI residual cleanup (2026-06-17)
- **背景**: user GUI verify 报 3 个残留问题 (v0.1 内部 release 试跑阶段发现), **不**等 v0.2 直接 cleanup
- **3 改**:
  1. **StatusBar super-slim**: 删 `VaultMenu` 切换 (v0.1 单 vault, 留 read-only `VaultPathBadge`) + 删 `OfflineBadge` + `VaultReloadingBadge` (状态指示 v0.1 不做). 4 essential: vault 路径 (read-only) + Changes + Commit + Theme + Settings. props 改 `_vaults` / `_onSwitchVault` / `_isOffline` / `_isVaultReloading` 兼容 caller API
  2. **NoteList filter pill 计数**: `useFilterCounts` 当 `selection.kind === 'folder'` 时也 filter entries by `selection.path` (`isEntryInFolder` 检 entry.path startsWith `${folderPath}/`). 修"打开 N" 跟列表数字错位 (Notes folder 1 个 open, 不再数 vault 全 open 3 个)
  3. **Slim view heading**: `resolveFolderTitle` 检 `isSlimFolderId(selection.path)` → 用 `SLIM_FOLDERS.label` (Notes/Wiki/Memory/Raw/Archive) 不用 raw slug (notes/...). import path 修: `../../utils/slimSelection`
- **验证**: tsc 0 / cargo 0 / cargo test 705 / eslint 0 / vitest 3974/3974 / pnpm build 7.09s / tauri build 26.72s / dream-cli-verify 12/1/0 / .app 18M
- **未做** (PR 9 范围外): 残 mermaid/tldraw/katex CSS rules in Editor.css + EditorTheme.css (cleanup) / tauriCsp.test.ts tldraw 字符串 test (删) / multi-vault UI (v0.2 真做)

## §18 v0.1.1 ship state (PR 9 收官)
- 编译: tsc 0 / cargo 0 warning / eslint 0 / cargo test 705 / vitest 3974
- Release: 18M .app + 16.6M binary + 26.72s tauri build
- dream CLI: 12/1/0
- GUI verify: user 跑了 🅰️ — 5 入口 sidebar + DreamPanel + Raw 灰显 + tooltip + 默认 vault 全 OK; 报 3 个残留 → PR 9 改完

---

## §19 PR 9.4 — GUI verify fixes 2 件 (2026-06-17)
- **背景**: user PR 9 verify 后又跑 🅰️ 报 2 个 **仍**没修干净的问题 (PR 9.4 = 收尾):
  1. **NoteList count 错位**: Notes 列表 1 条但"打开 0" / Raw 列表 1 条但"打开 0" / Memory 列表 1 条但"打开 3"
  2. **Memory heading 错**: 显示 "dreamforge-test-vault" (rootPath) 不是 "Memory"
- **root cause**:
  - `useFilterCounts` 当 `selection.kind === 'folder'` 时走 `folderPath = selection.path || selection.rootPath`, **不** 区分 Slim mode 5 entry, 走通用 `isEntryInFolder` 但 Memory 用 `path: ''` (root file) → `folderPath` 变 `rootPath` → filter 错 / 不 filter
  - `resolveFolderTitle` 同样 `selection.path === ''` → 走 `vaultRelativePathLabel(rootPath)` = "dreamforge-test-vault"
- **修法** (slimEntryInFolder mapping):
  - Slim mode 5 entry 固定 path mapping: notes/wiki/raw/archive → `${id}/` prefix; memory → `MEMORY.md` (root file)
  - `isSlimFolderSelection(selection)`: `selection.path === ''` (memory) || `isSlimFolderId(selection.path)`
  - `slimFolderIdFromSelection(selection)`: `path === ''` → 'memory' || `path`
  - `isSlimEntryInFolder(entry, slimFolder)`: memory → `entry.path === 'MEMORY.md'`, 其他 → `entry.path === slimFolder` || `startsWith ${slimFolder}/`
  - `resolveFolderTitle` 先 check `selection.path === ''` 强制 'Memory' label
- **验证**: tsc 0 / cargo 0 warning / vitest 3974/3974 / tauri build success / dream-cli-verify 12/1/0
- **next**: user 跑 🅰️ 再验 5 entry heading + count 全绿; 通过再进 PR 9.5 cleanup (残 CSS rules + tauriCsp.test.ts 删) / PR 10 (真 LLM Consolidator Ollama) 等

## §20 v0.1.2 ship state (PR 9.4 收官)
- 编译: tsc 0 / cargo 0 warning / vitest 3974
- Release: tauri build success
- dream CLI: 12/1/0
- GUI verify: 待 user 🅰️ (Notes "打开 1" / Raw "打开 1" / Memory "打开 1" + heading "Memory")

---

## §21 PR 9.5 — NoteList count absolute path 真修 (2026-06-17)
- **背景**: user 跑 PR 9.4 binary 🅰️, 5 entry 中:
  - ✅ Wiki 0/0 / Archive 0/0 (空)
  - ✅ Memory heading 修好 (Memory 不是 dreamforge-test-vault)
  - ❌ **Notes/Raw/Memory 列表 1 但底部"打开 0"** (3 entry 全 0, 仍错)
- **deep root cause** (深挖, PR 9.4 没修对):
  - **Rust 端 `vault::entry::load` 用 `root.join(relative).to_string_lossy()`** → `VaultEntry.path` 是 **绝对路径** (e.g. `/Users/.../dreamforge-test-vault/notes/hello.md`), **不** 是 vault-relative (e.g. `notes/hello.md`)
  - PR 9.4 `isSlimEntryInFolder(entry, slimFolder)` 假设 `entry.path` 是 relative → `entry.path.startsWith('notes/')` 永远 false → filter 0 entries → `counts.open = 0`
  - 但 user 看到列表 1 (有 entry 入选) → **因为** `filterFolderEntries` (L515) 走 `isEntryInSelectedFolder` 用 `pathRelativeToRoot` + `isInFolder` 复用 — 正确处理 absolute path
  - **所以** 我 PR 9.4 写了**自己**的 `isSlimEntryInFolder` 走相对路径 prefix, **没**复用 `pathRelativeToRoot` / `isInFolder` 这两个 **export** 错过的 internal helper
- **真修**:
  - `src/utils/noteListHelpers.ts`: `export` 改 `isInFolder` + `pathRelativeToRoot` (之前 internal, 现在 reuse 给 useFilterCounts)
  - `src/components/note-list/useNoteListModel.tsx`: `isSlimEntryInFolder` 改用 `pathRelativeToRoot(entry.path, rootPath)` + `isInFolder(relativePath, slimFolder)` (跟 `filterFolderEntries` 行为一致)
  - `export function useFilterCounts` 让 test 复用
- **unit test** `src/components/note-list/useNoteListModel.filterCounts.test.tsx` (5/5 passed, 用 absolute path 模拟 Rust 实际输出):
  - notes selection → 1 (notes/hello.md in)
  - wiki selection → 0
  - raw selection → 1 (raw/source1.md in)
  - archive selection → {0, 1} (1 archived)
  - memory selection (path: '') → 1 (MEMORY.md root file)
- **验证**: tsc 0 / cargo 0 warning / vitest 3979/3979 (+5) / eslint 0 / tauri build success / dream-cli-verify 12/1/0
- **next**: user 跑 🅰️ 再验; 通过后进 PR 9.5 cleanup (残 CSS rules + tauriCsp.test.ts 删) / PR 10 (真 LLM Consolidator Ollama)

## §22 v0.1.3 ship state (PR 9.5 收官)
- 编译: tsc 0 / cargo 0 warning / eslint 0 / vitest 3979/3979 / tauri build success
- dream CLI: 12/1/0
- GUI verify: 待 user 🅰️ (Notes/Raw/Memory 列表 1 + "打开 1")
- 教训: **写新 helper 前先 grep 现有 fn** (本来有 `isEntryInSelectedFolder` 已经处理 absolute path, 我 PR 9.4 自写 `isSlimEntryInFolder` 重新走错); Rust→TS path 转换是常见 pitfall, 应**永远** 用 `pathRelativeToRoot` 复用

---

## §23 PR 9.5 cleanup — 残 CSS + 旧 test 字符串 (2026-06-17)
- **背景**: user 走 PR 9.5 cleanup (GUI verify 闭环 + v0.1 UI 收尾). 残 mermaid/tldraw/katex CSS rule + tauriCsp test 名字带 tldraw 引用
- **3 改**:
  1. `src/components/Editor.css` (518 → 521 lines, +3 trace 注释): L371 `body.tolaria-note-pdf-exporting :is(.bn-block-outer, figure, table, pre, .math-block-shell, .mermaid-diagram, .tldraw-whiteboard)` 删 `.math-block-shell, .mermaid-diagram, .tldraw-whiteboard` 3 selector; L391 `body.tolaria-note-pdf-exporting :is(.editor__code-block-copy, .mermaid-diagram__expand-button, .tldraw-whiteboard__resize-handle, .tlui-layout, .tlui-popover, [data-radix-popper-content-wrapper])` 简化成只 `[data-radix-popper-content-wrapper]`
  2. `src/components/EditorTheme.css` (661 → 382 lines, -42%): 用 Python 脚本删 L288-L518 (katex `.math--inline` / `.math-block-shell` / `.math-block-source` / `.math--block` + mermaid `.mermaid-diagram` 11 sections + tldraw `.tldraw-whiteboard` 6 sections + tldraw-handle 5 sections). 保留 `.mantine-Popover-dropdown, .bn-menu, .bn-suggestion-menu` (跟 tldraw 无关, 是 mantine/BlockNote 通用)
  3. `src/utils/tauriCsp.test.ts`: it 名字 `'allows bundled tldraw translation JSON fetched from inlined data URLs'` 改成 `'permits inlined data: URLs in connect-src for runtime asset fetching'` (test 实际**不**测 tldraw, 测 CSP `connect-src` 含 `data:`, 跟 tldraw 无关)
- **trash 1 dead test**: `src/components/editorSchema.math.test.tsx` (测 `.math-block-shell` CSS rule, rule 删后 test fail, 测 katex 残功能)
- **验证**: tsc 0 / cargo 0 warning / eslint 0 / cargo test 705/705 / vitest **3973/3973** (-6, trash 1 test file 删 6 test) / pnpm tauri build success / dream-cli-verify 12/1/0 / .app 18M
- **next**: PR 9.6 = dreamforge 自己的 ADRs (v0.2 roadmap seed), PR 10 = 真 LLM Consolidator (Ollama)

## §25 PR 9.6 — dreamforge 自己的 ADRs (2026-06-17)
- **5 ADR 写完** (Nygard format, Status/Accepted + Context/Decision/Consequences/Alternatives/Implementation pointer):
  1. `2026-06-17-adr-001-statusbar-slim.md` — StatusBar slim 4-essential (PR 6 + PR 9 收官)
  2. `2026-06-17-adr-002-theme.md` — 3-axis design tokens + 2 themes (Mantine sync + BlockNote override)
  3. `2026-06-17-adr-003-vault-model.md` — single v0.1 / multi v0.2 (VaultMenu 删 + read-only badge)
  4. `2026-06-17-adr-004-editor-blocknote.md` — BlockNote 0.46.2 lock + 11 dep 物理删 (PR 8 收官)
  5. `2026-06-17-adr-005-dream-bridge.md` — 4-tier path + Ollama/OpenAI-compat flags (PR 10 设计)
- **next**: PR 10 = dream CLI 加 `--base-url` / `--model` flags + key 走 env var 注入 (Rust `Command::env()`); key **不**进 settings/git/memory/CLI args; base URL 待 user 决定 (Anthropic / OpenAI / proxy)

## §26 PR 10 — Ollama/OpenAI-compat cloud LLM (2026-06-17)
- **背景**: v0.1 dream CLI 默认走本地 Ollama (127.0.0.1:11434), v0.2 user 选云端 (SiliconFlow DeepSeek V4-Pro), key 已在 archived Xfocus memory pinned (`https://api.siliconflow.cn` + `deepseek-ai/DeepSeek-V4-Flash` → V4-Pro 升级)
- **3 改**:
  1. `DreamVault/Sources/DreamEngine/GlobalOptions.swift`:
     - 加 `baseURL: String?` / `model: String?` 字段 + `parse()` 加 `--base-url` / `--model` case
     - `resolvedRuntimeConfig()` CLIOverrides 优先 flag > env > vault > settings
     - `makeProvider()` API key 优先级 `DREAMFORGE_LLM_API_KEY` env var > macOS Keychain
  2. `DreamVault/Sources/dream/CLI.swift` printHelp: 加 `--base-url` / `--model` flag + `DREAMFORGE_LLM_API_KEY` env var 文档
  3. `dreamforge/src-tauri/src/commands/dreamvault.rs`:
     - `build_dreamvault_command()` 加 `llm_base_url` / `llm_model` 参数 → `--base-url` / `--model` flag
     - **URL strip**: `strip_v1_suffix()` 函数 (e.g. `https://api.siliconflow.cn/v1` → `https://api.siliconflow.cn`, 因为 OllamaProvider 自动加 `/v1/chat/completions`)
     - `Command::env("DREAMFORGE_LLM_API_KEY", $KEY)` 注入 key 到 dream 子进程 (key **不**进 CLI args)
     - 3 个 `#[tauri::command]` 加 `llm_base_url` / `llm_model` 参数
- **TS 改**:
  - `src/lib/dreamCliPath.ts` 加 `readLlmBaseUrl/writeLlmBaseUrl/readLlmModel/writeLlmModel/resolveLlmConfigForInvoke`
  - `src/components/DreamPanel.tsx` invoke args 加 `llmBaseUrl` / `llmModel`
  - `src/components/LlmSettingsField.tsx` 新建 (2 input + clear 按钮, **不**含 key 字段)
  - `src/components/SettingsPanel.tsx` Dream section mount `<LlmSettingsField />`
  - `src/mock-tauri/mock-handlers.ts` 3 个 dreamvault mock 加 `llmBaseUrl` / `llmModel` 签名
- **verify script**:
  - `scripts/dream-cli-verify.sh` 加 PR 10 cloud smoke (opt-in, env-gated)
  - 3 result paths: `dream 完成` (pass) / 401/403/quota (warn) / consent gate (warn with instruction)
- **测试**:
  - dream binary: `swift build` 2.38s OK (incremental, 2 file 改)
  - dream CLI smoke: `dream status --vault ... --llm openai --base-url ... --model ...` OK (flag 解析 ✅)
  - cargo: 710/710 (+5 新 test: base_url+model, strip_v1, run_strips_v1, omits_empty, model_only)
  - tsc: 0 / eslint: 0 / vitest: 3973/3973 (no new test 写 TS 侧)
  - tauri build: 7.05s vite + 26.94s cargo = 34s; .app 18M
  - dream-cli-verify: 12/2/0 (12 baseline + 1 Ollama warn + **1 cloud consent warn**)
- **关键验证** (PR 10 收官):
  1. ✅ dream CLI 接受 `--llm openai --base-url https://api.siliconflow.cn --model deepseek-ai/DeepSeek-V4-Pro` flag
  2. ✅ dream CLI 从 `DREAMFORGE_LLM_API_KEY` env var 读 key (不走 keychain fallback)
  3. ✅ dream CLI 触发 privacy consent gate (DreamVault v0.14.1 强制 user 显式 consent, 正确行为)
  4. ⏳ Real cloud call: user 需 `defaults write com.OmixNet.dreamvault DreamVault.allowCloudSendRawSummary -bool true` 启用 consent
- **key 安全** (5 不):
  - ❌ 写文件 (dreamforge/、/tmp/、settings.json、.env)
  - ❌ 进 memory (MEMORY.md、scratchpad、agent memory)
  - ❌ 进 git
  - ❌ 进 dream CLI args (`ps aux` 不可见)
  - ❌ dreamforge settings.json (localStorage)
  - ✅ **只** Rust `Command::env("DREAMFORGE_LLM_API_KEY", $KEY)` 一次注入 dream 子进程
- **GUI verify (v0.2)**: user 跑:
  1. 启 .app → Settings → Dream → LLM Base URL `https://api.siliconflow.cn/v1` + Model `deepseek-ai/DeepSeek-V4-Pro`
  2. 终端 `export DREAMFORGE_LLM_API_KEY='<key>'` (或写 `~/.zshrc`)
  3. `defaults write com.OmixNet.dreamvault DreamVault.allowCloudSendRawSummary -bool true`
  4. dreamforge-test-vault raw/ 加 entry → DreamPanel → Run Dream
  5. MEMORY.md 更新成功

## §29 PR 11.5 — Settings → Vault section + Git 弹窗降噪 (2026-06-17)
- **范围**: user "3 件事一起做". (1) Settings UI for vault add/remove, (2) "Enable Git?" 弹窗降噪 slim mode auto-init, (3) vault add 后 dropdown 立刻看到.
- **改动**:
  1. `src/components/VaultSettingsSection.tsx` (新, 180 lines) — Settings → Vault section: list + Active 高亮 + Add (走 `pickFolder()` 开 native folder picker) + Remove (走 `useVaultSwitcher.removeVault`, 阻止 remove active vault). aria-label "Remove from vault list: ${display}" 区分现有 WorkspaceSettingsSection.
  2. `src/hooks/useGitSetupState.ts` — 加 `slimMode?: boolean` 配置 + `useEffect` 自动 `void handleInitGitRepo()` 当 `slimMode && gitRepoState === 'missing' && !manuallyOpened && gitSetupPreference !== 'never' && dismissedGitSetupPath !== resolvedPath`. `shouldShowGitSetupDialog` 加 `if (slimMode && !manuallyOpened) return false` 在前面 short-circuit.
  3. `src/hooks/useVaultSwitcher.ts` — `useVaultActions` return 加 `addVault` (v0.2 PR 11.5: exposed for Settings → Vault section, 注释 add without auto-switch). outer 包装解 addVault 传给 consumer.
  4. `src/components/SettingsPanel.tsx` — 3 interface (`SettingsPanelProps` / `SettingsBodyProps` / `SettingsBodyFromDraftProps`) + 4 destructuring (`SettingsPanel` / `SettingsPanelInner` / `SettingsBodyFromDraft` / `SettingsBody`) + `OrganizationWorkflowSection` + `SettingsAgentWorkflowSections` + `<OrganizationWorkflowSection>` call site + 新 `<SettingsGroup>` for Vault section. 13 个 edit.
  5. `src/App.tsx` — `useGitSetupState` call 加 `slimMode: true`. `<SettingsPanel>` 加 `onAddVault={vaultSwitcher.addVault}` + `selectedVaultPath={vaultSwitcher.selectedVaultPath}`.
- **0 Rust 改**: 全部 TS 改. Rust 端 `VaultList` + `load_vault_list` + `save_vault_list` 早已 multi-vault.
- **测试 stats**:
  - vitest 335/335 / 3546/3546 (从 336/3552, -1 file / -6 test — 1 个 SettingsPanel test 改了断言, 5 个之前 dead test 已 PR 11 trash)
  - cargo 710/710 (0 改)
  - coverage 70.51/61.90/72.03/73.06 (frontend, 微升)
  - tauri build 18M .app
  - dream-cli-verify 14/0/0
- **踩坑**:
  1. `translate(locale, 'settings.vault.hint' as never)` 报 "Cannot read properties of undefined (reading 'replace')" — i18n key 不存在时 `template` 是 undefined, .replace 抛错. 改硬编码.
  2. SettingsPanel.tsx 的新 Vault button `aria-label="Remove vault X"` 跟 WorkspaceSettingsSection 撞 → test 找 2 个 button. 改 "Remove from vault list: X".
  3. `locale` prop 在 OrganizationWorkflowSection 没用但 eslint + tsc 都报. 删 prop (实际只 Settings UI 用, 不需要 i18n).
  4. SettingsPanelProps 4 处 interface (有/无 `?` optional) — 3 处 replaceAll 匹配, 1 处 (SettingsBodyProps L186) 单独手动 edit. `useVaultSwitcher.useVaultActions` return 也要 expose `addVault` 才能 destructure.
- **next**: GUI verify v0.2 → commit + tag v0.2.0 → v0.3+ 路线 (Settings 持久化 / Editor 重构 / 持续 coverage ramp up).

## §28 PR 11 — v0.2 基建 (Tolaria 残 test trash + Coverage gate + Multi-vault UI) (2026-06-17)
- **范围**: user 决定 "1 大 PR 11 一起干" (不拆). 3 块: trash + coverage + multi-vault UI.
- **PR 11a: trash 39 Tolaria 残 test (375 → 335 file, 3973 → 3552 test, -421)**
  - 10 source-missing dead: `App.note-window-properties` / `AiPanelChrome.performance` / `BreadcrumbBar.visibility` / `ConflictResolverModal.{extra,keyboard}` / `RawEditorView.{behavior,coverage}` / `note-list/NoteListHeader.expand` / `editorFocusUtils.extra` / `mock-handlers.more`
  - 29 feature-dead (测 PR 4-8 删的 feature): `AiActionCard` / `AiMessage` / `AiPanel` / `AiWorkspace` / `CloneVaultModal` / `ConflictResolverModal` / `CreateNoteDialog` / `CreateViewDialog` / `FeedbackDialog` / `NoteSearchList` / `PulseView` / `QuickOpenPalette` / `SearchPanel` / `TelemetryConsentDialog` / `UpdateBanner` / `WelcomeScreen` / `WikilinkChatInput` / `blockNoteRenderRecovery` (Mermaid) / `status-bar/AiAgentsBadge` / `hooks/commands/aiAgentCommands` / `useCliAiAgent` / `useTelemetry` / `useUpdater` / `useVaultAiGuidanceStatus` / `lib/aiAgentSession` / `lib/aiAgentStreamCallbacks` / `lib/vaultAiGuidance` / `utils/releaseDownloadPage` / `utils/vault-dialog`
  - 全部 vitest 336/336 pass ✅
- **PR 11b: Coverage gate (vite.config.ts + cargo-llvm-cov install)**
  - 现状: frontend 70.57/61.93/72.09/73.11 (lines/branches/functions/statements) / Rust 87.20/81.97/86.95
  - Thresholds: frontend lines 70, branches **60** (v0.2 现实, v0.3 target 70), functions 70, statements 70 / Rust lines 85, branches 80, functions 85
  - `cargo install cargo-llvm-cov` 45s OK
  - `package.json` 加 `test:coverage:cargo` + `test:coverage:all`
  - v0.1 AGENTS.md "Coverage gate target, **不** enforce" → v0.2 **enforce** (阈值 fail → vitest exit non-zero)
- **PR 11c: Multi-vault UI**
  - **发现**: Rust 端 `VaultList { vaults: Vec<VaultEntry>, active_vault, default_workspace_path, hidden_defaults }` **已经 multi-vault** (v0.14 之前就有), 12 unit test 覆盖. `commands/system.rs:299 #[tauri::command] pub fn load_vault_list() -> Result<VaultList, String>` 也已注册. `App.tsx` 已经在用 `useVaultSwitcher` 拿 `allVaults` + `switchVault`.
  - **缺**: StatusBar `VaultPathBadge` (read-only) + 没有 dropdown.
  - **改**:
    1. 新建 `src/components/status-bar/VaultDropdown.tsx` (97 lines, Radix DropdownMenu, slim 1 vault 退化 read-only, 2+ vault 显示 dropdown)
    2. `StatusBarSections.tsx` `VaultPathBadge` 改成 conditional: 1 vault 退化原 read-only span, 2+ vault 用 `VaultDropdown`
    3. `StatusBarPrimarySection` 解 `_vaults` / `_onSwitchVault` → 实参 (实际传给 `VaultDropdown`)
    4. `src/components/status-bar/VaultMenu.tsx` (801 行 Tolaria DnD) + `VaultMenu.applyMountedChange.test.ts` + `vaultMenuMountedChange.ts` 物理 trash (3 file)
  - **未做 (scope)**: Settings UI for vault add/remove (user 可直接编辑 `~/Library/Application Support/com.biomatrix.dreamforge/vaults.json` 或等 PR 11.5). 现有 tauri command `load_vault_list` 够读, save 走 `save_vault_list` 已存在. **v0.2 PR 11 收官**.
- **测试 stats**:
  - vitest 336 file / 3552 test (从 375/3973, -39 file / -421 test)
  - cargo 710/710 (5 新 test from PR 10, 0 改 PR 11)
  - coverage gate 全过
  - tauri build 18M .app
  - dream-cli-verify 14/0/0
- **next**: PR 11.5 (Settings vault add/remove UI + dream CLI 真 cloud call 跑通 GUI verify)

## §27 PR 10 — Real cloud LLM call 跑通 (2026-06-17)
- **触发**: user 提供完整 LLM config (baseURL/model/key) + 要"加的LLM信息", Mavis:
  1. **预填 `LlmSettingsField` 默认值** (`https://api.siliconflow.cn/v1` + `deepseek-ai/DeepSeek-V4-Pro`, 之前 placeholder, 现在 user 开 .app 自动有)
  2. 加 raw/ test entry (`2026-06-17-pr10-cloud-test.md`, 5 关键事实 for Consolidator pipeline)
  3. 跑真 `dream run` with cloud config
- **关键发现** (写进 AGENTS.md + decision log): **dream binary CFBundleIdentifier = `com.OmixNet.dreamvault.gui`** (不是 `com.OmixNet.dreamvault`); consent 写到错 domain → CLI 读不到 → 仍报 consent required
  - 修法: `defaults write com.OmixNet.dreamvault.gui DreamVault.allowCloudSendRawSummary -bool true`
  - **下一次 ship 的 memory entry**: DreamVault SwiftPM 二进制 embedded Info.plist CFBundleIdentifier = `com.OmixNet.dreamvault.gui`; UserDefaults 走这个 domain, **不**是 dreamvault app 的 domain
- **真 cloud call 结果**:
  - `dream run --vault dreamforge-test-vault --llm openai --base-url https://api.siliconflow.cn --model deepseek-ai/DeepSeek-V4-Pro`
  - 输出: `gathered=2 accepted=2 candidate=2 durable=0 archived=0 needsReview=0 committed=true`
  - 2 raw/ entry (老 `2026-06-15-source.md` + 新 `2026-06-17-pr10-cloud-test.md`) 都进 ledger as candidate (single source, 不升 durable, 设计预期)
  - 1 处脱敏命中 (`[REDACTED_IP_ADDR]: 1`, `127.0.0.1:11434` 在 raw entry 文本里)
  - budget: $0.0000 used (SiliconFlow Free tier)
  - dream-report 写到 `.dream/reports/dream-report-2026-06-17-221512.md`
  - git commit 完成
- **verify script 增强**:
  - 接受 "一无事事" 作为 pass (vault 跑过 1 次后, raw/ 全 processed 状态, dream run 正常返)
  - 同样规则给 cloud smoke test
  - 12/2/0 → **14/0/0** (12 baseline + 1 Ollama dream run + 1 cloud dream run)
- **lesson (cross-project)**: SwiftPM binary 的 UserDefaults.standard 走 binary embedded CFBundleIdentifier, **不**是 process name. 调试时先 `otool -P binary` 确认. 写 settings 要写到正确 domain, 不然 `defaults read` 看着对, 程序读不到

## §24 v0.1.4 ship state (PR 9.5 cleanup 收官)
- 编译: tsc 0 / cargo 0 warning / eslint 0 / vitest 3973/3973 / tauri build success
- Release: 18M .app (no size change)
- dream CLI: 12/1/0
- GUI verify: user 跑了 🅰️ (v0.1.3 binary, 5 entry 全绿 heading + count)
- CSS cleanup: Editor.css +3 trace 注释 / EditorTheme.css -279 lines (42%) / tauriCsp test 改名
- Test cleanup: 1 dead test file trashed (math 测 katex 残)
- v0.2 roadmap 写: `docs/superpowers/plans/2026-06-17-dreamforge-v0.2-roadmap.md` (7 候选 ADR 按 user "GUI 验收闭环再进 PR10" 排, PR 10 = Ollama Consolidator)





## §30 v0.3.0 — Coverage ramp + gate baseline lock (2026-06-18)
- **v0.3.0 ship** (test-only milestone): 214 new tests (3581 → 3760) across 18 new test files
- **Coverage gate polarity flip**: v0.2 gate branches 60% was BELOW the actual 61.90% measurement, which let dead-code branches silently drag the average down without tripping CI. v0.3 gate 63.5% is just BELOW the 63.62% measurement so any drop blocks merge
- **Ramp plan** (per user "不要再冲 70; 先 lock baseline 防回退"):
  - PR 12: 60 → 62.5 lock (5 test files, 99 new tests)
  - PR 13: 62.5 → 63.5 bump (4 test files, 37 new tests)
  - PR 14/15: optional, only if a real used-code surface emerges
- **Coverage progression vs v0.2.0**:
  - statements 70.51% → 71.98% (+1.47)
  - branches  61.90% → 63.62% (+1.72)  ← target ramp
  - functions 72.03% → 73.32% (+1.29)
  - lines     73.06% → 74.47% (+1.41)
- **Test totals**: vitest 3581 (PR 12 base) → 3760 (PR 13 final); cargo test 710 (unchanged)
- **Push to real remote** (first time):
  - `git remote add origin git@github.com:OmixNet/dreamforge.git` (HTTPS auth failed in non-interactive shell — `Device not configured`; existing local ed25519 SSH key worked after switching remote URL to `git@`)
  - v0.2.0 tag + 9 commits pushed (af93ac4)
  - v0.3.0 ship doc commit + tag pushed (3ebc2a5)
- **PR 12 lessons** (cross-project):
  - **mock-handler shape parity**: TS `mockInvoke` + Rust `PersistedVaultList` shape must be 1:1. Added Rust field `hidden_defaults: String[]` → mock `mockVaultList` also needs it, else `result.hiddenDefaults` returns `undefined` not `[]` → test fail. Grep Rust struct before writing new mock.
  - **VaultEntry.path is absolute**: PR 9.5 lesson still applies. New path helpers must use `pathRelativeToRoot` + `isInFolder`, not re-invent.
  - **PR 11.5 zero Rust changes**: `vault_list.rs` was already multi-vault capable (PR 1 changed APP_CONFIG_DIR). PR 11.5 just added `VaultSettingsSection.tsx` + `addVault` plumbing. Grep Rust layer first before writing frontend feature.
  - **mock-handlers for new tauri commands**: `rename_vault_folder` + `delete_vault_folder` had no mock handler — folder-action hook success paths failed silently. Added stub handlers; consistent with other vault_* mocks.
- **PR 13 lessons** (cross-project):
  - **Diminishing returns on test ramps**: each new test file added ~0.1-0.5pp branches after PR 12.2. Most remaining used code is either component-rendering (JSX) or pulls in unrelated deps (useAppPreferences → 4 separate hooks). At some point, marginal cost > marginal value.
  - **Used code is at ~84% branches, not 63%**: Tolaria-residual files (AiWorkspace, ConflictResolver, etc.) drag the average. They survive DREAMFORGE_SLIM deletes but aren't exercised in slim mode. Future PR 14/15 may selectively exclude from coverage include to lift the gate measurement.
  - **Buffer for coverage gates**: 62.5 (0.47pp buffer) was too tight when more tests added; 63.5 (0.12pp buffer) is even tighter. Future re-baseline: target 0.3-0.5pp buffer.
- **decisions**:
  - Coverage gate format in `vite.config.ts` includes the ramp plan as an in-code comment (single source of truth for "why this number")
  - v0.3.0 ship doc lives at `docs/reports/v0.3.0-ship-2026-06-18.md` (per memory rule: release journal in docs/ + git, not in memory)
  - PR 14/15 conditional: only if a real used-code surface (not component-rendering, not multi-dep integration) becomes worth covering
- **next-step backlog** (v0.3.x → v0.4+):
  - PR 14: optional branches 63.5 → 64 if a used-code surface emerges
  - PR 15: optional 64 → 65
  - PR 16+: feature work (BlockNote 0.5+ upgrade, cloud LLM multi-provider, real git remote for dreamforge confirmed)
  - GUI verify round (user-driven): macOS TCC blocks Mavis; user opens .app from `src-tauri/target/release/bundle/macos/DreamForge.app` and confirms Settings → Vaults + multi-vault switcher

## §31 PR 14 — Settings text cleanup + AI residue gating (2026-06-18)
- **v0.3.0 GUI verify**: user 跑过 .app (Settings → Vaults / VaultDropdown 切换 / 5-entry sidebar 全绿), 标 pass
- **PR 14 scope**: PR 13 coverage ramp 收官后, user 优先做"Settings 文案/AI 残留清理" — 隐藏 slim mode 仍 leak 的 Tolaria UI
- **隐藏的 UI 元素** (slim mode 下):
  1. `SettingsBodyNav` 的 AI Agents nav item
  2. `SettingsPanel.SettingsAgentWorkflowSections` 的整个 AI SettingsSection
  3. `SettingsPanel.SyncAndUpdatesSection` 的 Release Channel row (Tolaria updater feature)
  4. `PrivacySettingsSection` 的 crash-reporting + analytics toggles, 替换为单条 "Slim mode disables all telemetry" note
- **defensive guard**: `AiAgentSettingsSection` 顶部 `if (DREAMFORGE_SLIM_MODE) return null` — 防止未来 inline-mount caller 绕过 SettingsAgentWorkflowSections 的 gate
- **i18n**: `settings.privacy.slimNote` 加到 en.json (line 318 之后), 其他 19 locale 走 i18n.ts translate() fallback 链 (line 276 `template ?? fallbackTemplate`) — 不需要 20 locale 都加
- **test 调整**:
  - `SettingsPanel.test.tsx` 加 `vi.mock('../lib/dreamforgeMode', ...)` 让 DREAMFORGE_SLIM_MODE = false, 让既有的 AI / release channel / privacy 11 个测试继续测 non-slim 渲染
  - 新加 `SettingsBodyNav.test.tsx` (3 tests) + `PrivacySettingsSection.test.tsx` (3 tests) 测 slim mode 隐藏行为
- **test count**: 3760 → 3766 (+6)
- **build 验证**: tauri build OK (26.98s); .app 在 `src-tauri/target/release/bundle/macos/DreamForge.app`; 用户 mark GUI verify pass 后可以装新版本
- **push 状态**: `1d35958 feat: PR 14 — Settings text cleanup + AI residue gating` push 成功 (初次 port 443 closed by 198.18.0.25 NAT hang, sleep 15 retry 成功)
- **decisions**:
  - 隐藏而非删除 — Phase 4 flip DREAMFORGE_SLIM_MODE = false 时能自动恢复全部 UI
  - en.json 加 1 key, 其他 locale 走 fallback — 避免 20 file diff
  - 既有的 SettingsPanel.test.tsx 11 个测试改 mock DREAMFORGE_SLIM_MODE = false, 不删不改 — 测试是 non-slim 渲染的 source of truth
  - `if (DREAMFORGE_SLIM_MODE) return null` 在 AiAgentSettingsSection 顶部 — belt-and-suspenders, 防止未来 caller
- **next-step backlog** (v0.3.1+):
  - PR 15: optional, branches 63.5 → 64 if 出现低-成本高-ROI test target
  - PR 16+: feature work (BlockNote 0.5+ upgrade / cloud LLM multi-provider / Settings 持久化到 Tauri store)

## §32 PR 15 — i18n parity guard + slimNote translation (2026-06-18)
- **scope**: PR 14 添加 `settings.privacy.slimNote` 只覆盖了 en.json; 其他 19 locale 走 i18n.ts translate() `template ?? fallbackTemplate` fallback (silent 退化). user 选"i18n 补 zh-CN / 收集中文文案"作为下一 PR
- **i18n parity test**: 加 `i18n.test.ts` "keeps every locale's key set in lockstep with English" — 读 20 个 locale JSON 文件, 断言 keys ⊃ en.json 的 keys, **不** 多 **不** 少. **抓出了真 bug**: it-IT (以及另外 16 个 locale) 缺 `settings.privacy.slimNote`. test 第一次跑就 fail, 这正是想要的
- **批量加翻译**: python 脚本循环 17 locale 加 `settings.privacy.slimNote` 翻译. be-BY / be-Latn / de-DE / es-419 / es-ES / fr-FR / id-ID / it-IT / ja-JP / ko-KR / pl-PL / pt-BR / pt-PT / ru-RU / sv-SE / uk-UA / vi. zh-CN + zh-TW 之前已加
- **test count**: 3766 → 3767 (+1)
- **coverage**: 71.98/63.66 → 71.98/63.64 (slight -0.02, 在 noise margin 内, 因为改了 test 文件)
- **decisions**:
  - 不依赖 i18n.ts fallback 做 "done" — fallback 是 graceful degradation, **不**是合规. CI signal 要靠 parity test
  - 测试**不**只 en-vs-zh, 而是 en-vs-all-20. 这是 source-of-truth pattern
  - 翻译用我对 17 种语言的常识, 不全 (be-BY / be-Latn / vi 等可能有更地道的版本), 但比 en fallback 好. 后续如有 native speaker 可 polish
  - 41 个 "Tolaria" 品牌名 残留(产品 v0.2 已 rebrand DreamForge) — 留着不动, 这是单独的 rebrand PR, scope 不在这
- **next-step backlog**:
  - PR 16: rebrand "Tolaria" → "DreamForge" 跨 20 locale + UI strings (单独 PR, scope 大)
  - PR 17+: feature (BlockNote 0.5+ / Cloud LLM multi-provider / Settings 持久化) — settings 已 done, 剩 2 个

## §33 PR 16 — Tolaria → DreamForge rebrand (string + URL + icon naming) (2026-06-18)
- **scope**: §32 backlog PR 16. 41 个 "Tolaria" 品牌名残留 (en.json + 19 locale + 30+ src/ 字符串) — user-facing 部分全清, technical identifier 部分 deferred
- **执行**: 5 步
  1. **20 locale JSON**: python 脚本 `s/Tolaria/DreamForge/g` + json round-trip validate → 801 个字符串替换 across 20 file
  2. **src/ user-facing string**: 19 file targeted, 54 个字符串 (toast / error msg / title / description / button label / AI prompt preamble). 用 SKIP_PATTERNS 跳过 type name / mock path / function name / code comment
  3. **URL 常量** (`src/constants/feedback.ts`): TOLARIA_DOCS_URL / TOLARIA_PRODUCT_BOARD_URL / TOLARIA_GITHUB_DISCUSSIONS_URL / TOLARIA_GITHUB_CONTRIBUTING_URL / TOLARIA_GITHUB_ISSUES_URL / TOLARIA_GITHUB_PULL_REQUESTS_URL → DREAMFORGE_*_URL, host 改 `refactoringhq/tolaria` → `OmixNet/dreamforge`. **REFACTORING_HOME_URL = 'https://refactoring.fm/' 保留** (Luca 个人网站 — historical attribution, 跟 sponsor 按钮联动)
  4. **HTML 标题** (`src/utils/releaseHistoryPage.ts`): `<title>Tolaria — Release History</title>` + `<h1>Tolaria Release History</h1>` → DreamForge
  5. **icon 命名**: `src/assets/tolaria-icon.svg` → `dreamforge-icon.svg` (git mv), `import tolariaIcon` → `import dreamforgeIcon`, `alt="Tolaria icon"` → `alt="DreamForge icon"`. **icon 内容 (蓝水珠) 不动** — visual mark swap 是另一 PR (品牌重设计)
- **测试 fix**: 14 个 test 失败 (hard-code 旧字符串), 全部改. 影响: feedbackDiagnostics / AiAgentsOnboardingPrompt / CommitDialog / SettingsPanel (确认对话框) / ai-agent (4) / ai-context (2) / useOnboarding / useVaultSwitcher / useGettingStartedClone / openAiWorkspaceWindow. **1 个 comment 不动**: `SettingsPanel.test.tsx:17 // PR 14: this test file exercises the non-slim Tolaria surface` — historical, accurate (PR 14 真 exercise non-slim surface, 是 verify 范围的一部分)
- **legal text 保留**: THIRD_PARTY_NOTICES.md (AGPL 衍生声明) / README.md / AGENTS.md (project guide) — derivative work 声明 + 历史 attribution. 跟 user-facing 字符串是 separate concern
- **build status**:
  - tsc 0 / vitest 3767/3767 / eslint 0 / vite build 7.05s / cargo test 710/710 / tauri build 27.00s / dream-cli-verify 13/0/0
  - coverage 71.98/63.64/73.31/74.47 (gate pass, no change)
- **deferred (technical identifier, 真 migration 风险, 单独 PR)**:
  - `localStorage` keys: `tolaria_welcome_dismissed` (appStorage.ts:13), `__tolaria_no_workspace__` (typeDefinitions.ts:3) — 改名 = 丢现有用户设置 state
  - **file attachment token**: `@@TOLARIA_FILE_ATTACHMENT:` (fileAttachmentMarkdown.ts:61) — **嵌入 markdown 文件内容**, 改名 = 破现有用户附件
  - PDF preview query: `tolaria_pdf_preview=` (FilePreview.tsx:42) — URL 构造 on each render, 改 URL pattern = 破现有 preview
  - **component / type name**: `tolariaEditorFormatting` / `TolariaSlashMenuItem` / `TOLARIA_BLOCK_TYPE_SELECT_ITEMS` / `shouldAutoLinkTolariaHref` — internal API, 涉及 PR 4 物理删过的 dead module 周边, 改 = 触发重 PR surface
  - **test mock URL**: `https://tolaria.localhost` / `https://tolaria.md/releases/` — 仅测试占位符
  - **DOM id / thread name**: `tolaria-fatal-render-error` (main.tsx:128) / `tolaria-startup-tasks` (lib.rs:106) — runtime 内部
  - **icon SVG 内容**: 蓝水珠仍是 Luca Tolaria mark (icons-tolaria-backup/ 备份) — visual mark swap = 品牌重设计, **不**是 string rebrand. 单独 PR 提
- **decisions**:
  - **string rebrand vs identifier rebrand 分 PR** (跟 user "1-2 small focused PR > big-bang" 风格一致): PR 16 只动 user-visible 字符串, identifier 走 PR 18+ 配 data migration script
  - **保留 Luca attribution**: `REFACTORING_HOME_URL` (个人网站) + THIRD_PARTY_NOTICES.md + README.md — AGPL 协议要求 + 历史 acknowledge
  - **icon 命名 vs 内容**: 命名先改 (PR 16), 视觉 mark 留 → 视觉重设计是 design 任务, 跟 string rebrand 是 separate work stream
  - **comment 保留**: 152 个 "tolaria" 残留都是 DREAMFORGE_SLIM trace (educational) + historical attribution + type/identifier. 跟 MEMORY.md "DREAMFORGE_SLIM trace 注释保留" precedent 一致
- **commit**: `d87747c` (53 files, 865+/865- balanced). **不 push** (等 user GUI verify)
- **next-step backlog**:
  - **PR 17**: Settings 导出/导入 (user plan) — settings 已 in Tauri store (PR 10 §30 补), 加 export JSON / import JSON
  - **PR 18**: Tolaria → DreamForge data migration (lowercase `tolaria_` storage key + file token + URL param) + companion `dreamforge` migration script
  - **PR 19**: visual mark swap (DreamForge logo design + 替换 .app icon + in-app icon)
  - **PR 20+**: BlockNote 0.46.2 → 0.5+ (risky) / Cloud LLM multi-provider (Anthropic + Gemini + OpenRouter — 需 DreamVault Swift 改)


## §34 PR 17 — Settings export/import with envelope format (2026-06-18)
- **scope**: §32 backlog PR 17. Settings 持久化已 done (PR 10 §30), 加 export/import 让 user 能跨机器迁移 / 备份
- **envelope design**:
  ```json
  {
    "version": 1,
    "kind": "dreamforge-settings",
    "exported_at": "2026-06-18T21:47:37Z",
    "app_version": "0.3.0",
    "settings": { ...17 fields... }
  }
  ```
  - `kind` discriminator → 拒绝 non-dreamforge JSON
  - `version` 字段 → forward-compatible, 0 拒绝, future version 拒绝
  - `exported_at` → ISO 8601 UTC (self-rolled, **不**引 chrono/time dep)
  - `app_version` → 来自 `env!("CARGO_PKG_VERSION")`
- **纯函数 + 薄 wrapper pattern** (testable without tauri runtime):
  - `build_settings_export_json(settings, app_version, exported_at) -> Result<String, String>` — pure
  - `parse_settings_import_json(content: &str) -> Result<Settings, String>` — pure, 4 验证路径
  - `export_settings_to(path)` tauri command — wraps build + writes file
  - `import_settings_from(path)` tauri command — wraps parse + save_settings + returns current
- **测试 7 个 Rust**:
  - `export_envelope_round_trips_through_import` — build + parse
  - `export_envelope_includes_metadata` — version/kind/app_version/exported_at 都有
  - `import_rejects_wrong_kind` — kind discriminator
  - `import_rejects_unsupported_version` — 99
  - `import_rejects_zero_version` — 0
  - `import_rejects_malformed_json` — "not json at all"
  - `import_rejects_envelope_without_settings_field` — 缺 settings
  - `days_to_ymd_known_dates` — Howard Hinnant 算法
- **frontend 5 个 TS test**:
  - renders title + 2 buttons
  - export: dialog → invoke → success message
  - import: dialog → invoke → reload callback + success
  - import: dialog → invoke → error inline
  - cancel: dialog returns null → skip invoke
- **i18n**:
  - 12 新 keys: `settings.data.{title, description, exportButton, exportDescription, importButton, importDescription, exporting, importing, exportSuccess, importSuccess, exportError, importError}`
  - en.json + 19 locale (20 总). i18n.test.ts parity test 抓 drift
- **UI placement**:
  - 新 `settings.data` section in SettingsBodyNav (Database icon)
  - 永远 visible (slim mode 不 gate, user data backup 不是 AI residue)
  - 行为: 点击 export → tauri save dialog → 默认 filename `dreamforge-settings-{YYYY-MM-DD}.json`. 取消 = 静默 idle
  - 点击 import → tauri open dialog (JSON filter) → 验证 envelope → apply → 调用 `onSettingsReloaded` callback (App.tsx 传 `loadSettings` hook) → success message with path
- **status state machine**:
  - `{kind: 'idle'}` → initial
  - `{kind: 'busy', which: 'export' | 'import'}` → button 禁用
  - `{kind: 'success', which, message}` → inline `<p>` with path
  - `{kind: 'error', which, message}` → inline `<p class="text-destructive">`
  - Cancel 返回 idle (不显示)
- **decisions**:
  - **envelope 必加 kind discriminator** (防止 user 误传其他 JSON 文件)
  - **envelope 必加 version** (前向兼容, 0 reject 是因为 Settings::default() 的 None 值会被误传)
  - **不用 chrono/time crate** — 自写 ISO 8601 + Howard Hinnant 算法 (~20 行), Cargo dep 清单不污染
  - **dialog plugin 动态 import** (跟 `notePdfExport.ts` 同样的 pattern), 不影响首屏 bundle size
  - **onSettingsReloaded callback pattern** (而非全局 store) — SettingsPanel 通过 3 层 wrapper (SettingsPanel → SettingsPanelInner → SettingsBodyFromDraft → SettingsBody) 向下传, SettingsDataSections 用 `Pick<SettingsBodyProps, 't' | 'onSettingsReloaded'>` 局部 destructure. 跟 PR 11.5 vault addVault callback 模式一致
  - **replace not merge** import 行为 — 简单, user 想 partial merge 自己 edit JSON
  - **always visible in slim mode** — user data backup, 不属于 PR 6/PR 14 删的 AI residue
- **build status**:
  - tsc 0 / vitest 3772/3772 (+5 TS) / eslint 0 / vite 7.13s / cargo 718/718 (+8 Rust, 7 PR 17 + 1 day)
  - tauri build OK
  - coverage 72.00/63.67/73.32/74.49 (gate 70/63.5/70/60, +0.02/+0.03)
  - dream-cli-verify 13/0/0
- **commit**: `2499c2c` (30 files, 884+/24-, 2 新 file: DataSettingsSection.tsx + .test.tsx)
- **next-step backlog**:
  - **PR 18**: `tolaria_` identifier migration (localStorage key + file token + URL param) 配 data migration script — 修 §33 deferred list
  - **PR 19**: visual mark swap (DreamForge logo design + 替换 .app icon + in-app icon) — 需 user 提供 logo design
  - **PR 20+**: BlockNote 0.5+ (risky) / Cloud LLM multi-provider (Anthropic + Gemini + OpenRouter — 需 DreamVault Swift 改)

## §35 PR 18 — Tolaria identifier migration (localStorage + file token + URL param) (2026-06-18)
- **scope**: §33 backlog PR 18. 152 个 lowercase `tolaria_` 残留里,user-facing data 影响的 3 类 → 改;technical identifier 留 (内部 API / mock path / file name / icon 内容)
- **3 个 identifier family,3 个不同 migration 策略** (per data-migration semantics):

### A. localStorage keys — 3-layer migration
- **3 个 namespace**:
  - `DREAMFORGE_APP_STORAGE_KEYS` (new, current): `dreamforge-theme` / `dreamforge:zoom-level` 等 12 keys
  - `LEGACY_TOLARIA_APP_STORAGE_KEYS` (intermediate): `tolaria-theme` / `tolaria:zoom-level` 等 11 keys (no `legacyMigrationFlag`, 因为那是 laputa 时代的)
  - `LEGACY_APP_STORAGE_KEYS` (deepest): `laputa-theme` / `laputa:zoom-level` 等 11 keys
- **2 个 migration function** (各自 idempotent flag):
  - `copyLegacyAppStorageKeys()` — laputa → dreamforge, flag `dreamforge:legacy-storage-migrated`
  - `copyTolariaAppStorageKeys()` — tolaria → dreamforge, flag `dreamforge:tolaria-storage-migrated`
- **顺序**: configMigration.ts 先 laputa 后 tolaria. **为什么**: 一次都没 migrate 过的 user (只有 laputa key) 走 laputa → dreamforge;migrate 过 laputa 但没 migrate tolaria 的 (tolaria key 有, dreamforge 没) 走 tolaria → dreamforge;两个都 migrate 过的 (dreamforge key 已有) 跳过. 三个 layer 互不冲突,顺序保证 idempotent
- **`getAppStorageItem()`** 读路径: dreamforge → tolaria → laputa (3-layer fallback)
- **back-compat alias**: `APP_STORAGE_KEYS = DREAMFORGE_APP_STORAGE_KEYS` (避免改 7 个 caller)
- **6 个 test**: laputa 迁移 / tolaria 迁移 / flag idempotent / 双 migration 顺序 / fallback read / restricted localStorage

### B. File attachment token (TOLARIA_FILE_ATTACHMENT → DREAMFORGE_FILE_ATTACHMENT)
- **dual-recognize pattern** (跟 PR 16 不同,这里保留老 prefix 读):
  - `DREAMFORGE_FILE_ATTACHMENT_TOKEN_PREFIX = '@@DREAMFORGE_FILE_ATTACHMENT:'` (new write)
  - `LEGACY_TOLARIA_FILE_ATTACHMENT_TOKEN_PREFIX = '@@TOLARIA_FILE_ATTACHMENT:'` (old read)
  - `FILE_ATTACHMENT_TOKEN_PREFIX` = DREAMFORGE (write 走这个)
  - `readFileAttachmentToken()`: 优先 check dreamforge, fallback check tolaria
- **migration script** `scripts/migrate-tolaria-identifiers.mjs`:
  - 走 vault 目录,扫所有 `.md` file
  - dry-run 默认 (打印 what would change),`--apply` 才真写
  - 跳过 `.git` / `node_modules` / `.dream` (skip 已知 metadata 目录)
  - 替换 `@@TOLARIA_FILE_ATTACHMENT:` → `@@DREAMFORGE_FILE_ATTACHMENT:`
  - 6 个 test: no-op / dry-run / apply / 多 token + .git skip / missing arg / unreadable dir
- **2 个 fileAttachmentMarkdown test**: pin 写路径 emit DREAMFORGE prefix
- **用法**:
  ```
  node scripts/migrate-tolaria-identifiers.mjs /path/to/vault           # dry-run
  node scripts/migrate-tolaria-identifiers.mjs /path/to/vault --apply    # 真改
  ```
- **decision**: 用户在他自己 vault 上手动跑 (我不在 PR 里自动跑 — vault 是 user data, not artifact)

### C. URL query param (tolaria_pdf_preview= → dreamforge_pdf_preview=)
- **直接 rename,无 migration**: param 是每次 render 构造的 (FilePreview.tsx:42), 没人 persist,只有同 render 内的 reader 读
- **2 test file regex 更新**: `FilePreview.test.tsx` (3 处) + `Editor.test.tsx` (1 处)

### D. NO_WORKSPACE_KEY (typeDefinitions.ts)
- **直接 rename,无 migration**: sentinel 是 typeLookup map 的 key,internal,never persist
- **5 test pin 新值**

### Decisions
- **per-family 策略,不统一**: localStorage 用 3-layer (有 persist user data),file token 用 dual-recognize + migration script (有 embed 在 user markdown),URL param / sentinel 用 direct rename (无 persist,无 user data). 风险/复杂度跟 data-migration 风险正比
- **dual-recognize vs migration timing**: 都在 PR 18 *同时 ship*. 读路径支持双 prefix (前向兼容), 写路径用新 prefix (forward-only), migration script 给 user 一次性的清理机会. 三层防御
- **migration script 不自动跑**: 是 user data,不主动改. user 跑 `node scripts/...` 自己控制 timing
- **back-compat alias APP_STORAGE_KEYS**: 7 个 caller (`noteListHelpers.ts` / `useNoteListSort.test.tsx` / `configMigration.test.ts` / `noteListHelpers.extra.test.ts` / `sidebarHooks.ts` / `tagStyles.ts` / `statusStyles.ts` / `propertyTypes.ts`) 不用改,降低 PR risk surface
- **`legacyMigrationFlag` 改名为 `dreamforge:legacy-storage-migrated`**: flag value 也要随 namespace 走,不然 user 每次启动都重跑 migration (flag 在老 namespace 永远读不到)
- **3-layer 顺序 laputa→tolaria→dreamforge**: 因为 laputa migration 在用户历史中跑过一次 (PR 5/6 时代), 之后 tolaria 是源头. 顺序保证 idempotent

### Build status
- tsc 0 / vitest 3788/3788 (+16 新) / eslint 0 / vite 6.88s / cargo 718/718
- tauri build OK
- coverage 72.18/63.85/73.53/74.69 (gate 70/63.5/70/60, +0.18/+0.18)
- dream-cli-verify 13/0/0

### Commit
- `3fe459d` (12 files, 495+/31-, 4 新 file: scripts/migrate-tolaria-identifiers.mjs + src/scripts/...test.ts + src/utils/fileAttachmentMarkdown.test.ts + src/utils/typeDefinitions.test.ts)

### Deferred (PR 19+ backlog, see §33)
- `tolaria:note-window:` / `tolaria:ai-workspace-window:` localStorage keys (in `windowMode.ts` + `aiWorkspaceWindowSharedContext.ts`) — slim-mode-hidden AI + per-window state, rename when AI 回来
- event names (`tolaria:open-ai-chat` etc. in `aiPromptBridge.ts`) — in-process only, slim-hidden
- `__tolariaFrontendReady` window flag in `frontendReady.ts` — per-window, internal
- type/const names (`TolariaSlashMenuItem` / `shouldAutoLinkTolariaHref`) — internal API, 大 refactor
- file name (`tolariaEditorFormattingConfig.ts` / `tolariaBlockNoteSideMenu.tsx`) — internal, rename 牵扯广
- mock data file path (`/mock/Tolaria/...`) — internal mock,no real data
- icon SVG 内容 (Luca ©,蓝水珠) — design swap = PR 19

### next-step backlog
- **PR 19**: visual mark swap (DreamForge logo + 替换 .app icon + in-app icon) — **需 user 提供 logo design**
- **PR 20+**: BlockNote 0.5+ / Cloud LLM multi-provider

## §36 PR 19 — visual mark swap (DreamForge mark full replace) (2026-06-19)
- **scope**: §33 backlog PR 19. user 提供 SVG `~/Downloads/dream_cycle_markdown_x_macos_icon.svg` (1024×1024) 替换 Luca 原 Tolaria 水珠 mark
- **设计描述**: macOS-style rounded square + dark glass background + peach→lavender gradient 'X' + crescent moon + 2 stars + orbital line with sphere + bar chart. "dream cycle / markdown X macOS" theme
- **生成 pipeline** (macOS-only project):
  - SVG → PNG via `sips` + CoreSVG (无 cairosvg / rsvg-convert / magick dep)
  - iconset → icns via `iconutil` (需 `.iconset` 后缀,否则 invalid)
  - PNG → ico via PIL + multi-resolution `append_images`
- **scope coverage**:
  - `src-tauri/icons/` 20 PNG file: 32/64/128/128@2x/256/512/512-dark + icon.png master + Square* (Windows Store 8 个) + StoreLogo. 每个 PNG 按现有 dimension 重生成 (no add/remove file,只换 content)
  - `src-tauri/icons/icon.icns`: 10-size iconset (16/32/64/128/256/512/1024 + @2x variants) → iconutil
  - `src-tauri/icons/icon.ico`: PIL 多分辨率 (16/32/48/64/128/256)
  - `src-tauri/icons/android/` 15 PNG: ic_launcher + ic_launcher_round + ic_launcher_foreground × 5 mipmap density. 虽然 Android 不在 v0.1 scope,顺手都换了 — 未来 mobile support 时 assets 已一致
  - `src/assets/dreamforge-icon.svg`: content 换新 SVG (WelcomeScreen hero icon, PR 16 import 路径不变)
  - `public/favicon.svg`: 替换 🌳 emoji placeholder (index.html `<link rel='icon' type='image/svg+xml' href='/favicon.svg'>` 引用)
  - `AGENTS.md`: icons/ 注释更新到 20 PNG + icns + ico,标注 user SVG 来源
- **保留**:
  - `icons-tolaria-backup/` (Luca 原水珠,AGENTS.md convention "historical attribution preserved")
  - `THIRD_PARTY_NOTICES.md` (Luca © line)
  - AGENTS.md / README.md (derivative work 声明)
- **build verify**:
  - tsc 0 / eslint 0 / vitest 3788/3788 / cargo 718/718
  - tauri build OK (DreamForge.app 重新生成)
  - 从 .app `Contents/Resources/icon.icns` extract PNG preview verify 新 mark 正确渲染
  - coverage 72.18/63.85/73.53/74.69 (不变,no source code touched)
  - dream-cli-verify 13/0/0
- **commit**: `e210a6b` (38 files, 313+/11-, 全 icon binary + AGENTS.md + dreamforge-icon.svg + favicon.svg)
- **next-step backlog**:
  - **PR 20+**: BlockNote 0.5+ upgrade (risky) / Cloud LLM multi-provider (Anthropic + Gemini + OpenRouter,需 DreamVault Swift 改) / Settings UX polish
  - v0.4.0 ship candidate: PR 16/17/18/19 累计 + coverage 72/63.85 (gate 70/63.5 pass) — 可能是 tag v0.4.0 的好时机

## §37 PR 20 — Rebrand DreamForge → DreamX (user-visible brand only) (2026-06-19)
- **scope**: user-visible brand 改成 DreamX,底层兼容名保留 dreamforge. 跟 PR 16/19 不同,这次是**分层的** — 不是 hard rename
- **不改的** (compatibility layer):
  - GitHub repo: `OmixNet/dreamforge` (历史 tag / commit history / fork / SSH URL)
  - 本地文件夹: `/Users/biomatrix/Desktop/APP/dreamforge`
  - bundle id: `com.biomatrix.dreamforge` (macOS 看 is same app,不会因 rebrand 算 new app)
  - config dir: `com.biomatrix.dreamforge` (settings.json 位置不变,user 数据全保留)
  - env var: `DREAMFORGE_DREAM_CLI` / `DREAMFORGE_LLM_API_KEY` / `DREAMFORGE_SLIM_MODE`
  - localStorage: `dreamforge-theme` / `dreamforge:zoom-level` 等
  - file token: `@@DREAMFORGE_FILE_ATTACHMENT:`
  - URL param: `dreamforge_pdf_preview=`
  - sentinel: `__dreamforge_no_workspace__`
  - package.json: `name: "dreamforge"`
  - Cargo.toml: `name = "dreamforge"`, lib name = `tolaria_lib` (内部,没动过)
  - DreamVault Swift engine 名字
- **改的** (user-visible brand):
  - `tauri.conf.json`: productName + window title → DreamX
  - `index.html`: `<title>` → DreamX
  - 20 locale JSON: 所有 user-facing "DreamForge" → "DreamX" (en.json 41 个 + 19 其他 locale 677 个)
  - `WelcomeScreen.tsx`: title "Welcome to DreamForge" + alt + 2 description
  - `openAiWorkspaceWindow.ts`: AI 窗口 title "DreamForge AI" → "DreamX AI"
  - `releaseHistoryPage.ts`: HTML <title> + <h1>
  - `ai-context.ts` / `ai-chat.ts` / `ai-agent.ts`: AI system prompt 12 个 "integrated into DreamForge"
  - `App.tsx` / `main.tsx` / `FilePreview.tsx` / `CommitDialog.tsx` / `CloneVaultModal.tsx` / `RenameDetectedBanner.tsx` / `AiAgentsOnboardingPrompt.tsx` / `ClaudeCodeOnboardingPrompt.tsx` / `lib/feedbackDiagnostics.ts` / `lib/appUpdater.ts` / `lib/vaultAiGuidance.ts` / `lib/aiAgentStreamCallbacks.ts` / `hooks/aiAgentCommands.ts` / `utils/releaseDownloadPage.ts`: 各种 toast / error / button label / description
  - `README.md`: H1 "# 🌙 DreamX" (drop 梦铸 中文名)
- **不改的 (allowlist in test)**:
  - `THIRD_PARTY_NOTICES.md` (AGPL attribution, 冻结)
  - `docs/reports/v0*-ship-*.md` (历史 ship 记录, 冻结)
  - `docs/superpowers/plans/*-dreamforge-decisions.md` (migration log)
  - `docs/superpowers/plans/2026-06-17-adr-*.md` (5 个 ADR)
  - `docs/superpowers/plans/2026-06-17-dreamforge-v0.2-roadmap.md`
  - `docs/superpowers/plans/2026-06-16-dreamforge-development-manual.md`
  - `AGENTS.md` (AI agent guide,不是 user)
  - `src/lib/dreamxRebrand.test.ts` (test 自指,assertion message 故意含旧名)
- **实现细节**:
  - **case-sensitive 替换**: 只动 `DreamForge` (title case),不动 `DREAMFORGE_*` (env var) 也不动 `dreamforge*` (folder/repo/identifier)
  - **CJK 字符 trick**: ja-JP / ko-KR 翻译里 `DreamForge` 后跟 CJK 字符,word boundary `\b` 不 match. 第一次扫 19 个 ja-JP + 15 个 ko-KR,test 抓到还有. 第二次 pass 不带 `\b` 抓到 25 + 28 剩余,全替换
  - **JSX text**: 第二次 pass 处理 `<span>... outside DreamForge. ...</span>` 这种 JSX 文本 (不是 string literal 也不是 comment)
  - **comment 保留**: 11 个代码注释 (DREAMFORGE_SLIM trace convention) 保留 — per cross-project precedent
- **新 test `src/lib/dreamxRebrand.test.ts`** (8 个):
  - locale files 扫值不扫 key
  - tauri.conf.json: productName + window title 必 DreamX, identifier 必 com.biomatrix.dreamforge (compat 验证)
  - index.html: <title>DreamX</title>
  - README.md: 第一 H1 含 DreamX, 不含 DreamForge, 不含 梦铸
  - WelcomeScreen: alt + title DreamX
  - openAiWorkspaceWindow: 'DreamX AI'
  - releaseHistoryPage: HTML title + h1
  - **全仓 scan**: src/ public/ docs/ src-tauri/ 都扫,有 allowlist 跳过 (frozen historical), 严格 case-sensitive "DreamForge" 检测
- **build status**:
  - tsc 0 / eslint 0 / vitest 3796/3796 (+8) / cargo 718/718
  - tauri build OK — output: `DreamX.app` (was `DreamForge.app`)
  - coverage 72.18/63.85/73.53/74.69 (不变,纯 string swap)
  - dream-cli-verify 13/0/0
- **commit**: `6115936` (60 files, 1031+/838-, 1 新 file: dreamxRebrand.test.ts)
- **next-step backlog**:
  - v0.4.0 tag candidate: PR 16/17/18/19/20 累计 rebrand,coverage pass
  - 未来如果 DreamX 名字 confirm,做 PR 18-style 第二次 namespace migration (compatibility layer 也改) — 但**不**会自动做
  - BlockNote 0.5+ / Cloud LLM multi-provider / Settings UX polish

## §38 PR 21 — DreamX rebrand cleanup (post-GUI-verify residue) (2026-06-19)
- **scope**: user 跑完 GUI verify,PR 20 rebrand 不够干净. 4 处残留需修,test 需扩
- **GUI verify 状态**:
  - DreamX.app 主 GUI 通过 ✓
  - Info.plist CFBundleDisplayName = DreamX, CFBundleName = DreamX ✓
  - 真实窗口标题 / 菜单栏 / WebArea description = DreamX ✓
  - 主界面正常:5-entry sidebar / DreamPanel / Vault 路径 / StatusBar ✓
  - Settings 默认 zh-CN 页 UI 文案是 DreamX ✓
  - 旧配置兼容: vault / LLM Base URL / LLM Model / DREAMFORGE_LLM_API_KEY 文案兼容 ✓
  - icon.icns 1.1MB 在 bundle ✓
  - repo working tree 干净 ✓
- **残留 + 修法**:
  1. **`Info.plist` `NSLocalNetworkUsageDescription`** (blocking):
     - 前: "Tolaria connects to local model servers you configure for AI chat."
     - 后: "DreamX connects to local model servers you configure for AI chat."
     - 这是 macOS local-network 权限弹窗文案,真实 user 看到
     - verify: `Contents/Info.plist` 现在是 "DreamX ..."
  2. **`UpdateBanner.tsx` 2 处** "Tolaria {displayVersion}":
     - L76 available state → "DreamX {displayVersion}"
     - L148 ready-to-restart state → "DreamX {displayVersion}"
  3. **`TelemetryConsentDialog.tsx` L31** "Help improve Tolaria":
     - → "Help improve DreamX"
     - (slim mode hide 但代码还在,需清)
  4. **17 locale 还残留 DreamForge** (尤其 feedback.sponsor.description):
     - **regex 漏根因**: PR 20 用 `\bDreamForge\b`,但 en.json L48 前是 JSON escape `\\n\\n` (literal backslash + n + backslash + n),`n` 是 word char,跟后面 `D` 之间没有 `\b` boundary,所以 regex 跳过
     - **修法**: plain `str.replace('DreamForge', 'DreamX')` (不 regex),catch 30 个 across 17 locale
     - **sv-SE 单独 14 个**: Swedish possessive "DreamForges" (s = 's)
- **test 扩**:
  - 新 test "src-tauri/Info.plist has no Tolaria or DreamForge in user-visible strings" 显式 assert privacy string + check DreamX 在
  - wide scan extension filter 加 `.plist` (之前只 .ts/.tsx/.json/.html/.md/.mjs/.css/.svg)
- **build verify**:
  - tsc 0 / eslint 0 / vitest 3797/3797 (+1 Info.plist test) / cargo 718/718
  - tauri build OK → DreamX.app
  - `Contents/Info.plist` `NSLocalNetworkUsageDescription` = "DreamX ..." (verify in built bundle)
  - coverage 72.19/63.87/73.53/74.7 (+0.02 lines/+0.02 branches vs PR 20)
  - dream-cli-verify 13/0/0
- **commit**: `041e20a` (21 files, 48+/35-)
- **lesson**:
  - **regex 跟 JSON escape 不和**: `\b` 在 JSON 文本里看的是 literal chars,不看 escape 后的语义. 用 `\b` 处理 user-visible 字符串前,先想 raw char pattern 还是 parsed semantics
  - **GUI verify 抓漏的种类**: PR 16-20 全是 code-level grep / build verify,**不**有 user-level 弹窗 / Info.plist / 真实 macOS 权限文案 这种 system integration 的 surface. user GUI verify 是唯一覆盖
  - **test allowlist 是累加**: PR 16 (Tolaria rebrand) → 20 (DreamX rebrand) → 21 (Info.plist 加). 每次新 surface 都加进 rebrand test,下次 rebrand 自动 catch
- **next-step backlog**:
  - **v0.4.0 tag candidate** (if user confirms): PR 16/17/18/19/20/21 累计 + coverage 72.19/63.87 + 3797/3797 vitest + 718/718 cargo + dream-cli-verify 13/0/0 + tauri build 26-28s + GUI verify pass. 这是 ship 节奏
  - PR 22+: BlockNote 0.5+ / Cloud LLM multi-provider / Settings UX polish

## §39 PR 22 — v0.4.1 small fix (codesign + UI 降噪 + bundle scan) (2026-06-19)
- **scope**: 4 件 Day-1 observation by user 抓到的残留
- **背景**: v0.4.0 tag 后 user 跑 Day-1 real use,在 /Applications/DreamX.app 实测,4 个 issue
- **Issue + fix**:

### A. codesign `code has no resources but signature indicates they must be present` (blocking for distribution)
- **root cause**: Rust Cargo default 给 binary 加一个 `linker-signed` ad-hoc signature(flag `0x20002 adhoc,linker-signed`),它"声称"binary 应该有 sealed resources 但 Rust binary 不内嵌 resource(icon / Info.plist 在 .app bundle 里单独放). Tauri 2.x 检测到 binary 已有 linker signature 就跳过自己的 codesign step,所以 `_CodeSignature/` 目录从来不存在,`Info.plist=not bound`,Gatekeeper / `spctl --assess` 失败
- **fix**: `tauri.conf.json` 加 `"bundle.macOS": { "signingIdentity": "-", "entitlements": null }`
- **效果**: Tauri 现在 ad-hoc sign 整个 bundle. build output 显式:
  ```
  Signing with identity "-"
  Signing .../DreamX.app
  /.../DreamX.app: replacing existing signature
  ```
- **verify**:
  ```
  $ codesign --verify --deep --strict /Applications/DreamX.app
  (no error)
  
  $ codesign -dv /Applications/DreamX.app
  Format=app bundle with Mach-O thin (arm64)
  CodeDirectory v=20500 size=32217 flags=0x10002(adhoc,runtime) hashes=1000+3
  Signature=adhoc
  Info.plist entries=16
  Sealed Resources version=2 rules=13 files=1
  ```
- **notarization 还是 skip** (no Apple Developer ID),留到 user 加 Apple Developer Program 时

### B. test vault "Hello DreamForge" → "Hello DreamX" (vault 内容,不是 app bundle)
- `dreamforge-test-vault/notes/hello.md` (out-of-repo,user 自己改)
- 已在 PR 22 前 commit 时 verify

### C. UI 文案降噪 (5 处,internal ID 保留)
| file | before | after |
| --- | --- | --- |
| `VaultSettingsSection.tsx:77` | "Manage the vaults **dreamforge** can open" | "Manage the vaults **DreamX** can open" |
| `VaultSettingsSection.tsx:155` | "Vaults are stored ... under the **dreamforge** config directory" | "... under the **DreamX** config directory" |
| `LlmSettingsField.tsx:58` | "**dreamforge** will strip it before passing to the dream CLI" | "**DreamX** will strip it ..." |
| `LlmSettingsField.tsx:99` | "API key: set `DREAMFORGE_LLM_API_KEY` in your shell env (never stored in **dreamforge**)" | "... (never stored in **DreamX**)" (env var 名 `DREAMFORGE_LLM_API_KEY` 保留 — compat surface) |
| `DataSettingsSection.tsx:26` | default export filename `dreamforge-settings-YYYY-MM-DD.json` | `dreamx-settings-YYYY-MM-DD.json` (import 还是 content-based,旧 filename 仍可 import) |

### D. App bundle hygiene guard (新 test,7 cases)
- 新 file `src/scripts/dreamxAppBundleScan.test.ts`:
  1. `codesign --verify --deep --strict` on built .app 干净
  2. `Signature=adhoc` + `Sealed Resources version=` present
  3. `CFBundleDisplayName` = DreamX (Dock / About / 通知)
  4. `CFBundleName` = DreamX
  5. `CFBundleIdentifier` = `com.biomatrix.dreamforge` (compat 锁住)
  6. `Info.plist` 没 user-visible `DreamForge` / `Tolaria`
  7. JS bundle (`dist/assets/index-*.js`) DreamX count > 5× DreamForge count + zero `Tolaria`
- 找不到 `src-tauri/target/.../DreamX.app` 时 skip (不 block `pnpm vitest`)
- **额外**: 修 `src/mock-tauri/mock-handlers.ts` 里 `/mock/Tolaria/{resources,mcp-server}/...` → `/mock/dreamforge/...`. 这些是 mock-only 路径,无语义,但 JS bundle 里有 `Tolaria` 字符串会扫到
- **allowlist 更新** (`src/lib/dreamxRebrand.test.ts`):
  - `src/scripts/dreamxAppBundleScan.test.ts` 加 (test 故意含 `DreamForge` / `Tolaria`)
  - `docs/post-ship-v0.4.0-checklist.md` 加 (post-ship 文档引用旧品牌做历史记录)

### E. explicit NOT changed (compat layer)
- bundle id `com.biomatrix.dreamforge`
- config dir `~/Library/Application Support/com.biomatrix.dreamforge/`
- env var `DREAMFORGE_DREAM_CLI` / `DREAMFORGE_LLM_API_KEY` / `DREAMFORGE_SLIM_MODE`
- localStorage key prefix `dreamforge-*`
- file token prefix `@@DREAMFORGE_FILE_ATTACHMENT:`
- URL param `dreamforge_pdf_preview=`
- sentinel `__dreamforge_no_workspace__`
- Rust crate name `tolaria_lib` (symbol path 里有 `tolaria_lib::*`)
- git author `Tolaria <vault@tolaria.default>` (compat:用户已有 commit 署名不变)
- AGENTS.md template (新 vault 种子) 里 `Tolaria Vault` heading (template 内容)

### build verify
- tsc 0 / eslint 0 / vitest 3804/3804 (+7 bundle scan) / cargo 718/718
- tauri build OK → codesign verify passes on built .app
- coverage 72.18/63.85/73.53/74.69 (不变)
- dream-cli-verify 13/0/0

### commit
- `c4fb7d9` (7 files, 187+/7-, 1 新 file `dreamxAppBundleScan.test.ts`)

### decision matrix 结果
- user 在 PR 20 GUI verify 后跑 Day-1 observation,4 个 issue + scope 控制
- "暂不建议再动 namespace migration" — `dreamforge` 兼容层继续保留一个 version cycle
- "v0.5 再开 Anthropic/Gemini/OpenRouter" — Provider 是新能力,会引入配置 + Key 管理 + 错误处理 + 模型兼容测试,现在还有 rebrand + codesign 残留,先收干净更稳

### next-step backlog
- **PR 23+**: 用户跑 v0.4.1 的 Day-1 observation(等 user 真用),看 v0.4.1 是否解决 codesign + UI 残留
- **v0.5.0**: Cloud LLM multi-provider (Anthropic + Gemini + OpenRouter) — 需 DreamVault Swift 改 (AiModelProviderKind 已 union)
- **v0.5.x**: BlockNote 0.5+ upgrade (risky) / Settings UX polish
- **未来**: Apple Developer Program → 真 codesign + notarization
- **更未来**: namespace migration 第二轮 (compat layer 也改),需 user sign-off 命名 final 后

### §40 v0.5.0 — Cloud LLM multi-provider path (OpenAI-compat) (2026-06-21)

- **scope discipline 继续**: Anthropic + Gemini 推 v0.6 (不同协议);HTTP smoke 不进 unit test;multi-provider adapter 不塞同一 PR
- **closed-loop trace 4 个断点** (PR 24/25/26 → 27/30):
  - PR 24 wrote env var wiring,但 PR 25 (Keychain) 还没写 → 跨 PR data flow 隐藏依赖
  - PR 27 fixed: Rust 读 Keychain by provider id, fallback shell env
  - PR 30 fixed (user): `--llm openai` flag — dream CLI 默认 mock,没有这个 flag 永远走不到 OpenAICompatibleProvider
  - lesson: "security boundary test ≠ end-to-end test" — 每个 PR 单测都过,组合不跑通;data flow contract 跨 PR 验证
- **P2b P2c P2c-1.5 拆法** (user 拍板): Keychain + error formatting (P2b) → OpenRouter UI (P2c-1) → Keychain-first closed-loop (P2c-1.5) → DreamVault Swift provider (P2c-2) → real E2E (P2c-3 = PR 32)
- **OpenAICompatibleProvider 边界 lock** (DreamVault PR 28, user 拍板): DreamVault 不读 Keychain,只读 `DREAMFORGE_LLM_API_KEY` env var;Keychain → env 翻译是 DreamX Rust (PR 27) 的事;`.openaiCompat` + env empty → 抛 `.missingAPIKey`,NO fallback 到 Ollama 或 Keychain
- **PR 32 真实 E2E** (ship gate): SiliconFlow + DeepSeek-V4-Flash 跑通,budget 1 call(s) 真到 provider,gate script 通过。用户 key 是 SiliconFlow 的不是 OpenRouter,这是为什么 OpenRouter 返回 "Missing Authentication header" (key 形状 `sk-` 不被 OpenRouter 认)
- **PR 31 gate regex bug 现场发现 + 现场修**: pattern 0 太严,`\bbudget\s+(\d+)\s+call\(s\)` 拒绝 "budget: today 1 call(s)"; 修成 `\bbudget\b[^]*?(\d+)\s+call\(s\)` + 加 bare `N call(s)` pattern; 5/5 test pass
- **v0.5.0 tag 锁定**: DreamX v0.5.0 = Settings → Keychain → Rust inject → dream CLI → Swift OpenAICompatibleProvider → cloud API 完整闭环
- **v0.6 backlog**: Provider Error UX (PR 34) / Settings AI 简化 (PR 35) / Anthropic + Gemini adapter (PR 36)

### §41 v0.6.0 — Anthropic + Gemini adapters (API-complete and test-verified) (2026-06-21)

- **ship strategy = Option A** (user 拍板 2026-06-21): "v0.6 的核心是 Anthropic + Gemini adapter 能力上线, 不是'你已经把两个真实账号都跑通'". v0.6.0 ships with **API-complete + unit-test-verified** wiring, NOT with real Anthropic/Gemini E2E. Real E2E is deferred to v0.6.x pending user-provided keys (PR 37 Anthropic / PR 38 Gemini). "Don't conflate test verification with real provider call" 是 v0.6.0 区别于 v0.5.0 的关键判断。
- **scope discipline 持续守住** (per user 2026-06-19 拍板 + §40): provider 切分按协议相似度, OpenAI-compat (PR 28) / Anthropic (PR 36) / Gemini (PR 36) 3 个独立 type 3 个独立 file, NO `[LLM_*]` 通用 supertype; per-provider tag prefix (`[OPENAI_*]` / `[ANTHROPIC_*]` / `[GEMINI_*]`) 让 error attribution 在 log 清晰; Anthropic 跟 Gemini 是不同 protocol + 不同 response format, 不能塞进同一 PR adapter (回归成本太高)
- **6-category error contract reuse** (PR 34 + PR 36 跨 3 provider 一致): `missing-key` / `auth-failed` / `model-not-found` / `timeout` / `malformed-response` / `network-failed`. PR 36 给 Anthropic + Gemini 各加一份 enum, `category` property 值 provider-agnostic (不带 "anthropic" / "gemini" 名字), DreamX UI 跨 3 provider 同一份 actionable copy (因为 fix 一样: re-check API key in Settings → AI, 或 retry)
- **dreamforge parser 跨 18 tag 扩展** (PR 36 Phase B): `TAG_TO_CATEGORY` 数组 6 → 18 (6 categories × 3 providers); `PROVIDER_ERROR_MAP` 不变 (provider-neutral); 跨 provider invariant test 锁 "same category → same shortMessage / fixActionLabel" 防止未来 provider 加进来时 UI copy 漂移
- **cloud-consent gate 统一 helper** (PR 36 Phase A): 新 private `requiresCloudConsent(_:)` 把 cloud provider 集合放在一个 switch, 加第 4 个 cloud provider 未来是一行 change; `providerName(_:)` 同理; 这俩 helper 是 §40 提到的 "scope discipline: 1 helper = 1 surface" 的延续
- **Anthropic / Gemini URL 协议细节踩坑** (现场写, locked in code comment):
  - Anthropic: `system` 是顶层 string, NOT `messages[0]` entry; `max_tokens` 必填 (Anthropic 强制, default 1024); `x-api-key` header, NOT `Authorization: Bearer`
  - Gemini: `:generateContent` 是 path suffix literal colon, NOT directory; URLComponents 会 percent-encode 到 `%3A` 被 API 拒绝, 改用 manual string concat 保留 colon; `x-goog-api-key` header (query param `?key=` 被 Google deprecate)
- **PR 35 Settings 简化 design choice** (user 拍板): 4 main fields 永远可见 (Provider / Base URL / Model / API key), Advanced `<details>` 折叠 (Name + storage mode + env var); `canSave` 放松 (name + baseUrl 改 optional, 走 catalog default); 用户进 Settings 第一眼就看到 4 步主流程, 不再被 5-field grid 吓到
- **PR 34 error UI 关键 invariant**: shortMessage + fixActionLabel 是 `PROVIDER_ERROR_MAP` 里的固定 string 常量, NEVER 从 stderr 派生。 Test "shortMessage is provider-controlled constant, not body-derived" 锁这个 invariant — body content 怎么变 shortMessage 都不变, 这样如果 body 真的含 API key value (server echo), 也不会泄漏到 UI
- **PR 34 i18n scope decision** (user 拍板): error UX copy English-only v0.6, 跟现有 DreamPanel 行为一致 (原代码也是 `err.message` 英文显示); i18n parity for error strings deferred。 Locked 在 constant-not-derived test 里 (因为不是从 i18n catalog 读, 跨 locale 行为稳定)。 未来如果要 i18n, 把 6 个 shortMessage 移到 en.json + 19 locales, UI 用 `t('dream.errors.missingKey')` 即可
- **v0.6.0 ship gate = "API-complete, NOT E2E verified"** (Option A): 4612 tests pass, strict-concurrency clean, tauri build 18M, dream CLI `--llm anthropic` / `--llm gemini` smoke 不 crash。 Honest ship doc (docs/reports/v0.6.0-ship-2026-06-21.md) explicit 写 "Real Anthropic / Gemini end-to-end with user-provided keys is NOT verified for v0.6.0 ship" 而不是模糊 "E2E verified"
- **v0.6.0 tag 锁定**: DreamX v0.6.0 = 3 cloud LLM provider API complete (OpenAI-compat / Anthropic / Gemini), 6-category error contract 跨 3 provider 一致, dreamforge error UI 跨 3 provider 同一份 actionable copy, Settings AI 4 步主流程简化。 Real provider E2E pending user keys (v0.6.x PR 37/38)
- **v0.6.x backlog per user 拍板**:
  - **PR 37**: Anthropic real E2E gate (user 提供 Anthropic key, run `dream run --llm anthropic` + 真实 raw note, 跑通 `pnpm verify:dream-e2e-output`, ship v0.6.1)
  - **PR 38**: Gemini real E2E gate (user 提供 Gemini key, ship v0.6.2)
  - **PR 39**: provider setup UX polish (only if E2E from PR 37/38 exposes confusing copy, e.g. "What URL do I use for Anthropic?" — locked as maybe, don't pre-emptively polish)
  - 跨 PR 跨 3 cloud provider 的 E2E 验证 pattern: 跟 v0.5.0 PR 32 (SiliconFlow) 一样, 跑通 + gate script pass + budget 真实 call count > 0 + dream-report 写出来, 锁 "real call happened" invariant

### §42 v0.6.0 post-ship addendum (2026-06-22) — wiring fix + Cloud re-verify + doc polish

v0.6.0 tag 之后, 没新 tag, 但有 4 件 post-ship 修复 + 1 件真实 E2E 验证 evidence。这些是 v0.6 → v0.6.x 的 bridge, 不重写 v0.6.0 结论 (API-complete and test-verified), 但对未来判断很关键。

- **PR 37a (8158d0a) AI Settings copy polish** (用户拍板方向): "Custom provider" 中文化 (catalog name + i18n dropdown label 都改 "Custom" / "自定义"); "本地密钥" / "Save locally in DreamX" → "macOS Keychain" / "macOS 钥匙串" 跨 20 locales; zh-CN "Advanced" → "高级设置" 修 English residue. 加 6 个 regression guard test (i18n + aiTargets) 锁未来不会再有英文残留. lesson: i18n test 关键不在测值, 在测 "不是 X" — `expect(...).not.toContain('local key')` 比 `expect(...).toContain('macOS Keychain')` 更能防 regression, 因为后者即使值变了也能 pass.

- **PR 37b (f7e1722) wire `--llm` flag by provider kind** (这是关键 bridge evidence): v0.6.0 ship 时漏的 wiring gap — dreamforge Rust `--llm` flag injection 只 hard-code `kind: "open_ai_compatible"` → `--llm openai`, `kind: "anthropic"` / `kind: "gemini"` 根本没 inject, 所以 dream CLI 走 default mock, PR 36 的 AnthropicProvider / GeminiProvider 永远不会被调到. fix: `dream_llm_flag_for_provider_kind(kind)` helper + 新 arg `llmProviderKind` 流 Settings → localStorage (`dreamforge.llmProviderKind`) → dreamvault_run → dream CLI flag. 8 文件改动, Rust 758 (+2), TS 3880+ (+5+). lesson: **scope discipline 跨 PR 验证** — PR 36 ship 时只看 Swift 自己 wire 通 (provider compile + test pass), 没 trace 到 Rust side 的 flag injection 是不是真的把 `--llm gemini` 传过去. "test passes" ≠ "data flow contract held" (§40 closed-loop lesson 同样 pattern: PR 24/25/26 各自 pass 但组合不跑通).

- **SettingsPanel auto-save (6752c3a) Custom provider 关闭后丢失 fix**: 用户报 symptom, 我没看出来, 用户自己 fix. root cause: `AiProviderSettings.onChange` 只更新 React draft state, 没调 `onSave`. 新 provider 只有 user 主动点 Settings 底部 "Save" 才落地, 否则关 Settings 就丢. lesson: **hidden coupling in opt-in flow** — "Add" button 的语义跟 "Save settings" 按钮的语义混在一起, user 没明确分清. fix 用 `draftRef` + 立即 `onSave(buildSettingsFromDraft(...))`. test "auto-saves added API model providers so closing settings does not lose them" 锁 regression. lesson for me: **不只听 code-level grep / build verify, GUI verify by user 抓 user-flow bug** (跟 §38 PR 20 漏 4 处一样 pattern).

- **Dream CLI `--base-url` URL gotcha doc (606df99)**: PR 37b re-verify 时直接跑 dream CLI 撞 `/v1/v1/chat/completions` → 404 坑. root cause: dream CLI 的 Swift OpenAICompatibleProvider 不 strip `/v1`, 直接 append `v1/chat/completions`. dreamforge Rust (PR 10) strip `/v1` 给 GUI 用户, 所以 GUI 永远不踩, 只手动 E2E 才踩. fix: docstring-only, `dream help` 现在写清 ✓ / ✗ 对比 + GUI vs direct CLI 差异. lesson: **同一份逻辑的 "doc-as-code" 价值** — 把这种 URL 约定固化进 `--help`, 未来 me / user / 其他 agent 跑手动 E2E 不会再撞. 也可以考虑在 Swift provider 加 warning 或自动 strip, 但那是 code change 跨 3 provider, scope 太大, doc 是最小代价的 fix.

- **SiliconFlow + Qwen2.5-7B-Instruct re-verify (test vault 942d50c)**: 真实 5 call LLM, $0.0000, gate script PASS. 这就是 PR 37b wiring fix 的 bridge evidence — v0.5 PR 32 ship 时同样的 OpenAI-compat 路径跑通过, v0.6 PR 37b 改 wiring 后再跑一次证明仍然跑通, 排除 "PR 37b 把开环路改坏" 的可能. note: 一开始用 `deepseek-ai/DeepSeek-V4-Flash` 撞了 /v1/v1/chat/completions 坑, 切 `Qwen/Qwen2.5-7B-Instruct` (默认 catalog 里的标准 model) 跑通. lesson: **re-verify 用 catalog 默认 model 比用特定 model 更稳** — 特定 model (DeepSeek V4 Flash) 可能在 SiliconFlow 端 shape 跟 v0.5 PR 32 时不一样了 (server side 改过), catalog 默认 model (Qwen2.5) 更可能稳定.

- **PR 37 / PR 38 真实 Anthropic / Gemini E2E defer 到 v0.6.x 决定** (user 拍板): 现在没有 Anthropic / Gemini key, 强行跑只会撞 "missing key" 或 "auth failed" 之类的已知 6 类错误, 不算 true E2E. SiliconFlow re-verify 已经足够作为 current bridge evidence. v0.6.1 tag 等 PR 37 / PR 38 真过了一个再 cut. ship doc post-ship addendum 写清楚, decision log 这一节也是. lesson: **"真实 E2E" 必须用真实 provider key, 没 key 就 defer** — v0.5 PR 32 有 SiliconFlow key 所以能跑, v0.6 没 Anthropic / Gemini key 所以不能跑. 不要因为 wire 通就觉得 E2E verified, key 是 E2E 的前置条件.

- **ship doc 模式**: v0.6.0 原结论 (API-complete and test-verified) 不重写, 加 post-ship addendum 标日期 + 列 commit hash + 解释每个 fix 的 root cause. 这样 future archeology 看 git log 跟 ship doc 能对上, "为什么 v0.6.0 ship doc 写 E2E deferred 但 bridge evidence 又有了" 一目了然.
