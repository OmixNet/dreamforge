# AGENTS.md — DreamForge v0.1

DreamForge = Tauri 2.10 + Rust + React 19 + TS 5.9 + BlockNote 0.46.2. **v0.1 = Slim shell (5-entry sidebar) + DreamVault Swift engine 整合**. Read this **before** any task in `/Users/biomatrix/Desktop/APP/dreamforge`.

> v0.1 ship date: 2026-06-17. v0.1 = 705 Rust + frontend test passed / 0 warning / 21MB macOS .app.

---

## 1. What DreamForge IS (v0.1) and ISN'T

### IS (v0.1 范围)
- **Slim shell**: 5-entry sidebar (Notes / Wiki / Memory / Raw / Archive, **无** Inbox / Search / History / Sync / Updater / AI)
- **DreamPanel**: 右栏 dream CLI 桥 (status on mount + Run/Status/Open MEMORY.md/Open wiki 按钮)
- **dream CLI 4-tier fallback**: Settings arg → `DREAMFORGE_DREAM_CLI` env → `/Users/biomatrix/Desktop/APP/DreamVault/.build/{debug,release}/dream` → `PATH` `dream`
- **Settings**: dream CLI 路径 + 主题切换 + localStorage `dreamforge.dreamCliPath`
- **dreamforge-test-vault** 默认 vault (`/Users/biomatrix/Desktop/APP/dreamforge-test-vault`)
- **AGPL-3.0-or-later** 继承 (Tolaria fork + DreamVault Swift engine)
- **v0.2 PR 10 (Ollama/OpenAI-compat cloud LLM)**:
  - Settings → Dream → LLM Base URL + Model (input fields, localStorage `dreamforge.llmBaseUrl` / `dreamforge.llmModel`)
  - dream CLI `--base-url` / `--model` flags 透传 (PR 10)
  - `DREAMFORGE_LLM_API_KEY` env var 注入 dream subprocess (Rust `Command::env()`, **不**进 CLI args, **不**进 settings.json)
  - `strip_v1_suffix()` Rust 函数: 用户填 `https://api.siliconflow.cn/v1` → dreamforge 剥 `/v1` → dream CLI 加 `/v1/chat/completions` (OpenAI 兼容)
  - 4-tier privacy consent gate (DreamVault v0.14.1 强制 user 显式 `allowCloudSendRawSummary=true`)

### ISN'T (v0.1 不做 — 推 v0.2+)
- AI agents / 13 个 CLI agent 集成 (claude/codex/gemini/kiro/hermes/opencode/pi) — 物理删除 (PR 4)
- MCP server / ws-bridge / AddRemote / McpSetupDialog — 物理删除 (PR 4/6)
- 多 vault 同步 / 远程 / 冲突 / 历史 / AppUpdater / Sentr y / PostHog — 物理删除 (PR 4/6/7)
- Tldraw whiteboard / Mermaid diagram / KaTeX math — 物理删除 (PR 9.5)
- PDF export / clone getting-started vault / 23 statusbar badges — 物理删除 (PR 4/6/7)
- 多 vault 切换 UI (PR 9 StatusBar 删 VaultMenu, 推到 v0.2)

---

## 2. Development Process

### Start working on a task
1. **Read** `docs/ARCHITECTURE.md` + 现有 `docs/adr/` (如有)
2. **Check** `git log --oneline -20` 看最近 PR 节奏 + 命名习惯
3. **For UI 任务**: study `src/components/SlimSidebar.tsx` + `src/components/DreamPanel.tsx` v0.1 实际 UX（**不**参考 luca Tolaria 设计 — 那是 different product）
4. **永远不** `--no-verify` + 永远不 `as any` / `#[allow(...)]` / `eslint-disable`

### Slim mode toggle (重要)
- `src/lib/dreamforgeMode.ts` `DREAMFORGE_SLIM_MODE = true` 是 **compile-time** 开关
- **禁用** 任何 `if (DREAMFORGE_SLIM_MODE) ...` 软删模式（v0.1 物理删完）
- **不要** 在新 code 加 `DREAMFORGE_SLIM_MODE` guard — 直接物理删除 Toleria 原 code

### 物理删除决策
按"先软删 PR 1 → 物理删 PR 4 → 文档化 PR 7+ 这个顺序"：
- **PR 1** 软删 = 删 invoke_handler + 加 `DREAMFORGE_SLIM_MODE` guard
- **PR 4-7** 物理删 = 删 module file + 改 import + 改 lib.rs (4 段) + 改 App.tsx (1 段) + 改 commands/* (6 段)
- **PR 8+** 真删 dep（之前 push back: scope 太大，回滚 dep 软删）

### Commits
- TDD red→green→refactor→commit，1 cycle 1 commit
- Conventional: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Commit 之前 跑 `pnpm exec tsc -b --force` + `cargo build --manifest-path src-tauri/Cargo.toml` + `pnpm exec vitest run src/<touched>` + `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- 永远不 amend pushed commit
- 永远不 push to main 不带 user 确认

---

## 3. Pre-commit / Pre-push 检查

### Pre-commit (本地)
```bash
pnpm exec tsc -b --force         # 0 error
cargo build --manifest-path src-tauri/Cargo.toml  # 0 warning (严格)
pnpm exec eslint . --max-warnings=0  # 如果改了 src/
```

### Pre-push (本地 + 验收)
```bash
pnpm build                        # tsc + vite
cargo test --manifest-path src-tauri/Cargo.toml --lib  # 705+ passed
pnpm tauri build                  # release .app 生成
bash scripts/dream-cli-verify.sh  # 12/1/0 expected
```

### Coverage gate (target, **不** enforce for v0.1)
- Frontend: ≥ 70% (vitest coverage)
- Rust: ≥ 85% (cargo llvm-cov)

v0.1 coverage 还没跑过（v0.1 范围窄，coverage 推到 v0.2）。

---

## 4. UI components — Slim shell 规则

### 5 入口 sidebar (SlimSidebar.tsx) — 锁定
| entry | folder | readOnly | 含义 |
|---|---|---|---|
| Notes | `notes/` | false | 用户编辑的笔记 |
| Wiki | `wiki/` | false | DreamVault 生成的 wiki 页 |
| Memory | `MEMORY.md` | true | root file, DreamVault 写 |
| Raw | `raw/` | true | 引擎 source, **不**可写 (RawReadonlyGuard 守) |
| Archive | `archive/` | false | 归档笔记 |

**永远不** 加 Inbox / Search / History / Sync 入口（v0.1 不做）。

### DreamPanel (DreamPanel.tsx) — 锁定
- 3 按钮: Run Dream (调 `dreamvault_run`) / Open MEMORY.md / Open wiki/
- 启动时自动 `dreamvault_status`
- Ollama optional, fail-tolerance (verify script 12/1/0 = 1 warn)

### StatusBar — Slim 4 必要项 (PR 6)
| 保留 | 删 |
|---|---|
| Vault 路径 (VaultMenu) | 远程 (NoRemoteBadge / AddRemoteModal) |
| 设置 (Settings 按钮) | 同步 (SyncBadge) |
| 主题 (Theme 按钮) | 历史 (PulseBadge / ConflictBadge) |
| 本地 commit (ChangesBadge + CommitButton) | 更新 (BuildNumberButton) |
| | AI (McpBadge / McpSetupDialog) |
| | 反馈 (FeedbackButton) |
| | Docs (DocsButton) |
| | Zoom |
| | 多工作区 (create/clone/remove/reorder) |

### shadcn/ui 强制
- 永远用 shadcn/ui component (Input, Select, Button, Calendar+Popover, Dialog, Switch, ToggleGroup, Tooltip)
- 永远不用 raw HTML `<input>`, `<button>`, native `<input type="date">`
- 现成 wikilink / emoji / color / type picker 复用 `src/components/`

---

## 5. Tauri command 模式 (重要)

### dream CLI 桥 (commands/dreamvault.rs)
- 3 command: `dreamvault_status` / `dreamvault_run` / `dreamvault_report`
- 6 个 unit test (含 path resolution 4-tier fallback test)
- Path resolution 在 `commands/dreamvault.rs` **不**用 env, **用** `tauri::AppHandle` 调 Rust function 调 shell `which` 或 fallback 链

### AppConfig ID 一致性 (PR 1 + 5 教训)
```
tauri.conf.json identifier:   "com.biomatrix.dreamforge"
Cargo.toml [package] name:      "dreamforge"
src-tauri/src/settings.rs:    APP_CONFIG_DIR = "com.biomatrix.dreamforge"
src-tauri/src/vault_list.rs:   read from APP_CONFIG_DIR
```

**改 1 个** 必搜所有 4 处 + capabilities/default.json (post PR 5 C: 删 deep-link/updater)。

### capabilities 3-way 一致性 (PR 5 C 教训)
- `capabilities/default.json` 引用的 `xxx:default` permission 必对应 Cargo.toml dep
- 删 dep 之前 必先删 capabilities 引用的 permission
- capabilities + Cargo.toml + tauri.conf.json 三者一致

### invoke_handler 列表 (lib.rs L484-598)
- 永远不直接加新 command 到 invoke_handler — 必走 `commands/<name>.rs` 模块 + `pub use` in `commands/mod.rs`
- 软删时注释整行 + 物理删时**真**删

---

## 6. 软删 vs 物理删 模式 (PR 4-7 教训)

### 3-layer 模型 (soft-delete-gotchas.md)
任何 disable 必全栈碰 3 层，**只**碰 1-2 层 = 漏 leak：
1. **配置/能力层**: `capabilities/*.json`, `tauri.conf.json`, `*.config.*`
2. **依赖/导入层**: `Cargo.toml`, `package.json`, `lib.rs pub mod`, App.tsx import
3. **调用点层**: `invoke_handler!()`, App.tsx mount/useEffect, hooks, settings field access

**3 层都清**才能真删。**v0.1** = PR 4-7 物理删 100% 完成 (Rust module + Cargo dep + 资源) + 80% 完成 (TS dep 软删, PR 8+ 推)。

### "先隐藏不删" 反模式
- AI onboarding 软删时仍弹 → `useAiAgentsOnboarding` hook + App.tsx 启动层 **都**需 check（**不**仅 1 处）
- vault_list.rs 漏改 APP_CONFIG_ID → 改 settings.rs 不够, **必**搜所有 "com.x.y" 引用
- dream CLI 不在 PATH → Rust 端加 4-tier fallback（**不**靠 frontend localStorage）

### Capabilities/dep/AppConfig 3-way 一致性
- Tauri 项目特有的 3-way 一致性 trap：identifier / Cargo.toml / settings.rs APP_CONFIG_DIR / vault_list.rs
- capabilities permission / Cargo.toml dep / invoke_handler 3-way

---

## 7. Build / Release

### dev 启动
```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm tauri dev                    # 启动 Vite + Tauri (auto-reload)
# GUI verify: user 手动
```

### release build
```bash
pnpm tauri build                  # ~1m 49s, 21MB .app
# output: src-tauri/target/release/bundle/macos/DreamForge.app
open src-tauri/target/release/bundle/macos/DreamForge.app
```

### .gitignore 重要
- `src-tauri/target/` (Rust build artifact)
- `dist/` (Vite build artifact)
- `node_modules/`
- `**/.DS_Store`
- `*.log`
- `patches/` 是 `package.json` 引用的，**不** gitignore

### TipTap dep 锁定 (PR 5 A 教训)
```json
// package.json pnpm.overrides:
"@tiptap/extension-highlight": "3.19.0"
```
必须钉 extension-highlight@3.19.0 跟 @tiptap/core@3.19.0 一致（BlockNote 0.46.2 锁的）。否则 vite build fail "getStyleProperty is not exported by @tiptap/core"。

### rsproxy-sparse crates mirror
- `src-tauri/.cargo/config.toml` 用 `[source.crates-io] replace-with = 'rsproxy-sparse'`
- **必需** — crates.io 198.18.0.x NAT 卡

### Tooling
- Rust 1.96 (rustup default stable)
- Swift 6.3.2 / Xcode 26 (DreamVault 引擎, separate repo)
- Node 22 / pnpm 10.30
- macOS 14+ (Tauri 2.10 min)

---

## 8. DreamVault 整合契约

DreamVault = Swift 引擎 (`/Users/biomatrix/Desktop/APP/DreamVault`), **不**是 dreamforge 子模块。

### 4-tier dream CLI fallback
1. **Settings 参数** (Rust 端调, **不**用 env)
2. `DREAMFORGE_DREAM_CLI` env (Tauri release 用)
3. 硬编码本机路径: `/Users/biomatrix/Desktop/APP/DreamVault/.build/{debug,release}/dream`
4. `PATH` `dream`

### dream CLI commands
- `dream status` — vault 状态 + raw/ 候选 + ledger
- `dream run` — Consolidator (Ollama) + Persister (memory-id-anchor) + Decayer + Reinforcer
- `dream report` — 历史 report

### Persister 行为 (P8)
- 用 **memory id 锚点** (不是 H1/H2 section-based diff)
- 失败时 **回滚** + `.dream/` 无半成品
- raw/ 写后 RawReadonlyGuard 守 (dir 755, files 555)

### Ollama optional
- v0.1 关闭 LLM (Ollama 未跑) — `dream run` Consolidator 失败 fail-tolerance
- 跑通: `ollama serve` + 在 dreamforge-test-vault 加 raw/ entry → `dream run` → 写 MEMORY.md

### v0.2 PR 10: Cloud LLM (OpenAI-compat)
- dream CLI flags: `--base-url <URL>` / `--model <name>` (override env vars + vault config + settings)
- API key: `DREAMFORGE_LLM_API_KEY` env var **优先** > macOS Keychain
- dreamforge Rust 注入: `Command::env("DREAMFORGE_LLM_API_KEY", $KEY)` 一次, **不**进 CLI args
- dreamforge 剥 `/v1` suffix (OllamaProvider L107 自动加 `/v1/chat/completions`)
- 验证: `dream status --vault <v> --llm openai --base-url <url> --model <m>` 跑通 (v0.2)
- 跑通: `DREAMFORGE_LLM_API_KEY=... defaults write com.OmixNet.dreamvault DreamVault.allowCloudSendRawSummary -bool true` + dreamforge-test-vault raw/ entry → Run Dream → MEMORY.md 更新 (user 启用 consent 后)

---

## 9. Reference

### 项目结构
```
dreamforge/
├── src/                    # React 19 + TS 5.9
│   ├── App.tsx             # 1834 lines, 核心
│   ├── components/
│   │   ├── SlimSidebar.tsx           # 5 入口 (v0.1 锁)
│   │   ├── DreamPanel.tsx            # dream CLI 桥
│   │   ├── DreamCliPathField.tsx     # Settings
│   │   ├── StatusBar.tsx             # 130 行 (PR 6 简)
│   │   └── status-bar/               # slim badges (5 保留)
│   └── lib/
│       ├── dreamforgeMode.ts         # DREAMFORGE_SLIM_MODE = true
│       └── dreamCliPath.ts           # localStorage
├── src-tauri/              # Rust
│   ├── Cargo.toml          # 14 dep, lib name=tolaria_lib (内部, 不改)
│   ├── tauri.conf.json     # identifier=com.biomatrix.dreamforge
│   ├── capabilities/
│   │   ├── default.json    # NO deep-link/updater (PR 5 C)
│   │   └── mobile.json
│   ├── icons/              # 9 file (sips-generated)
│   └── src/
│       ├── lib.rs          # 526 lines, 24 module decls 删 (PR 4)
│       ├── settings.rs     # APP_CONFIG_DIR + AI fields 删
│       ├── telemetry.rs    # Sentry no-op stub
│       ├── vault_list.rs   # APP_CONFIG_DIR 改 (PR 5 user 自修)
│       ├── commands/
│       │   ├── dreamvault.rs   # 6 tests
│       │   └── system.rs       # 5 mcp + 2 app_updater 全删
│       └── git/mod.rs      # inline EnvName
├── scripts/
│   ├── dream-cli-verify.sh         # 12/1/0 验收
│   └── run-vitest-coverage*.mjs
├── package.json
├── pnpm-workspace.yaml
└── patches/                # 5 patches (BlockNote + Tiptap + prosemirror-tables)
```

### 重要 file path
- `docs/decision log`: `docs/superpowers/plans/2026-06-16-dreamforge-decisions.md` (之前) + `docs/decision-log/` (PR 7+ 之后)
- Decision log 文件: `docs/superpowers/plans/2026-06-16-dreamforge-decisions.md`
- `THIRD_PARTY_NOTICES.md`: AGPL 继承声明 (Tolaria + DreamVault + agentmemory)
- `dreamforge-test-vault`: `/Users/biomatrix/Desktop/APP/dreamforge-test-vault` (5-entry structure)
- `DreamVault Swift`: `/Users/biomatrix/Desktop/APP/DreamVault` (separate repo)

### macOS / Tauri gotchas
- `Option+N` → special chars (Tauri menu accelerator: `MenuItemBuilder::new(label).accelerator("CmdOrCtrl+1")`)
- `app.set_menu()` replaces ENTIRE menu bar — include all submenus
- `mock-tauri.ts` silently swallows Tauri calls — **不**是 native testing 替身
- macOS TCC: `open DreamForge.app` 启动 OK, **但** Computer Use / osascript 挡 GUI 自动化 → user 手动 verify

### v0.1 PR 累计
- **PR 1**: Slim mode 启用 (DREAMFORGE_SLIM_MODE 软删 24 处)
- **PR 1.1**: Menu bar 3 项删
- **PR 1.2**: SlimSidebar 5 入口
- **PR 2**: dreamvault 桥 (3 command + 6 test) + DreamPanel + DreamCliPathField
- **PR 2.5**: 3 P0 修 (MOCK_ENTRIES + DEFAULT_VAULT_PATH + 启动层)
- **PR 3**: raw/notes/wiki/MEMORY work-flow (handleOpenMemory/handleOpenWiki)
- **PR 4**: 物理删除 (Rust 24 module + 资源 + scripts + Playwright + useDeepLinks)
- **PR 5 A**: TipTap dep pin (extension-highlight@3.19.0)
- **PR 5 C**: capabilities clean (删 deep-link + updater + Cargo dep)
- **PR 5 E**: tauri build verify
- **PR 5 user 自修**: vault_list.rs APP_CONFIG_ID + AI onboarding 启动层 + dream CLI 4-tier + slimSelection folder
- **PR 6**: StatusBar cleanup (从 2700 行 → 510 行, 10 file 删, 4 file 重写)
- **PR 7**: 18 warning → 0 (5 file 改 + 2 整 file 删 + 15 dead test 删)
- **PR 8**: TS dep 物理删 (11 dep + 9 leaf file + 11 dead test + 4 真 bug/lint 修) → tsc 0 / cargo 0 / cargo test 705 / vitest 3974/3974 / eslint 0 / pnpm build 7s / tauri build 27.7s / dream-cli-verify 12/1/0 / .app 18M (down from 21M)
- **PR 9**: GUI residual cleanup (user 跑 🅰️ 报 3 件: StatusBar super-slim 4-essential / NoteList filter pill 计数跟 list 一致 / Slim view heading 用 SLIM_FOLDERS label) → tsc 0 / cargo 0 / vitest 3974/3974 / eslint 0 / pnpm build 7.09s / tauri build 26.7s / dream-cli-verify 12/1/0 / .app 18M
- **PR 9.4**: NoteList count fix (Slim mode 5 entry mapping: notes/wiki/raw/archive → `${id}/`; memory → `MEMORY.md`; selection.path === '' 强制 'Memory' label)
- **PR 9.5**: NoteList count 真修 (`VaultEntry.path` 是 absolute, 用 `pathRelativeToRoot` + `isInFolder` 复用) + Editor.css 2 line / EditorTheme.css 199+199 line mermaid/tldraw/katex 残 rule trash + tauriCsp.test.ts 改名 + 1 dead math.test trash
- **PR 9.5 cleanup** (后续): 残 CSS + 死 test string 重命名 (Editor.css -2, EditorTheme.css -42%, 1 dead test file trash)
- **PR 9.6**: dreamforge 自己的 ADRs (5 个 Nygard ADR: StatusBar / Theme / Vault / Editor / DreamBridge)
- **PR 10** (v0.2 第一个 PR): Ollama/OpenAI-compat cloud LLM (dream CLI `--base-url`/`--model` flag + `DREAMFORGE_LLM_API_KEY` env var; dreamforge Rust URL strip `/v1` + `Command::env()` 注入 key; 5 新 Rust test; LlmSettingsField; dream-cli-verify 加 cloud smoke) → tsc 0 / cargo 0 / cargo test 710 / vitest 3973 / eslint 0 / tauri build 34s / dream-cli-verify 12/2/0 (12 baseline + 1 Ollama warn + 1 cloud consent warn)

### v0.1 / v0.2 Status
- 编译: tsc 0 error / vite 0 error / cargo build **0 warning** / cargo test 710 passed
- Frontend test: 3973 passed (v0.1 spec: SlimSidebar 5 + DreamPanel 7 + slimSelection 2 + useAiAgentsOnboarding 1 + useAiAgentsStatus 7 + aiFeatures 1 = 23 test)
- Rust test (PR 10): 5 新 test (base_url+model 透传, strip_v1, run_strips_v1, omits_empty, model_only)
- Release: 18MB .app + 16.6MB binary, tauri build 26.94s (release) + 7.05s (vite)
- dream CLI: 12/2/0 (baseline 12/1/0 + 1 cloud consent warn when DREAMFORGE_LLM_API_KEY set)
- GUI verify: user 跑通 (macOS TCC 挡 Mavis 自动化, user 手动 .app verify)
- ESLint: 0 error / 0 warning (strict `--max-warnings=0`)

### Known issues (PR 11+ backlog)
- `dreamforge` 自己的 ADRs (PR 9.6 done, 5 ADR 模板立好)
- 真 LLM Consolidator (PR 10 done, Ollama + cloud 双 provider)
- 多 vault 切换 UI (PR 9 StatusBar 删 VaultMenu, 推到 v0.2 PR 11+)
- Coverage gate ≥70%/85% (v0.1 没跑, v0.2 PR 12+)
- Tolaria 残 test (~3950 dead, 推到 v0.2 PR 11 trash 30+)
- 残 mermaid/tldraw/katex CSS rules in Editor.css + EditorTheme.css (PR 9.5 cleanup 已删 90%)
- `tauriCsp.test.ts` 改名去 tldraw 引用 (PR 9.5 done)

---

## 10. Quick reference

```bash
# 全验收 (5 步, ~3 min)
pnpm exec tsc -b --force
cargo build --manifest-path src-tauri/Cargo.toml
pnpm exec vitest run src
cargo test --manifest-path src-tauri/Cargo.toml --lib
bash scripts/dream-cli-verify.sh

# release build (~2 min)
pnpm tauri build
open src-tauri/target/release/bundle/macos/DreamForge.app

# dev mode
pnpm tauri dev
```
