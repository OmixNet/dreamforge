# DreamForge v0.2 Roadmap (2026-06-17)

v0.1 内部 release 试跑通过 (PR 8 收官 + PR 9.4/9.5 GUI verify fixes + PR 9.5 cleanup)。下面路线按 v0.1.4 起。

## 现状 (v0.1.4)

- 编译: tsc 0 / cargo 0 warning / eslint 0 / cargo test 705 / vitest 3973
- Release: 18M .app (down from 21M PR 5 → 16.6M binary)
- 5 入口 SlimSidebar (Notes / Wiki / Memory / Raw / Archive) 全 GUI verify 闭环
- StatusBar super-slim (4 essential: vault 路径 + Changes + Commit + Theme + Settings)
- dream CLI 4-tier fallback (12/1/0 expected, Ollama warn acceptable)
- 单 vault 默认 `/Users/biomatrix/Desktop/APP/dreamforge-test-vault`

## 候选 ADR (v0.2 路线, 按"小 → 大"排)

### ADR-001: 真 LLM Consolidator (Ollama 跑通) [最大]
- **背景**: dream-cli-verify 现在 1 warn = Ollama 未跑 (Consolidator 阶段 fail). v0.1 fail-tolerance 设计, v0.2 应该真跑通
- **范围**: `dreamforge-test-vault` 加 raw/ entry → `ollama serve` → `dream run` → 写 MEMORY.md
- **验收**: dream-cli-verify 12/0/0
- **风险**: Ollama 模型选择 (qwen2.5:0.5b / llama3.2:1b / 别的), raw/ 触发 LLM 行为
- **估时**: 半天

### ADR-002: 多 vault 切换 UI [中]
- **背景**: PR 9 删 `VaultMenu` (v0.1 单 vault 设计), v0.2 需要
- **范围**: StatusBar 加 vault 路径 dropdown (类似原 VaultMenu 但 slim), App.tsx 加 `vaults` state + 切换 handler
- **验收**: 2+ vault 创建 + 切换 GUI verify
- **估时**: 半天

### ADR-003: Coverage gate ≥ 70%/85% [小]
- **背景**: AGENTS.md §3 写 "Coverage gate (target, 不 enforce for v0.1)", v0.2 enforce
- **范围**: `vitest --coverage` + `cargo llvm-cov` + threshold 70%/85% (frontend/Rust)
- **风险**: 大量 Tolaria 残 test 拉低 (需先 trash 一批 — PR 8 已 trash 11, 还可 trash ~30)
- **估时**: 半天

### ADR-004: Coverage 拉高: trash 30+ Tolaria 残 test [小]
- **背景**: 现有 vitest 3973 tests 中, 实际 v0.1 spec 22 + spec-related 4 (useFilterCounts) = 26. 余下 ~3950 全是 Tolaria 残 (测已删 dep / 测 Tolaria UX)
- **范围**: system review 找 Tolaria 残 test → mavis-trash
- **估时**: 1-2 小时

### ADR-005: dreamforge 自己的 ADRs ✅ (PR 9.6, 2026-06-17)
- **Status**: 5 ADR 已写完, 详见:
  - `2026-06-17-adr-001-statusbar-slim.md` — StatusBar slim 4-essential (2700→510 lines, -81%)
  - `2026-06-17-adr-002-theme.md` — Theme design tokens + 2 themes (light/dark, no system-follow)
  - `2026-06-17-adr-003-vault-model.md` — Vault model single v0.1, multi v0.2 (VaultPathBadge read-only)
  - `2026-06-17-adr-004-editor-blocknote.md` — BlockNote 0.46.2 lock + 11 dep 物理删 (21MB→18MB .app)
  - `2026-06-17-adr-005-dream-bridge.md` — 4-tier path resolution + Ollama/OpenAI-compat flags (PR 10)

### ADR-006: 真 Settings 持久化 (localStorage → tauri-plugin-store) [中]
- **背景**: v0.1 全部 settings 走 localStorage, v0.2 改 Rust tauri-plugin-store (path resolution 由 Rust 端)
- **风险**: 改 settings persistence 必 migrate (老 localStorage → Rust store)
- **估时**: 1 天

### ADR-007: Editor 重构 (BlockNote 升级 / 自定义 block) [大]
- **背景**: v0.1 用 BlockNote 0.46.2, v0.2 可考虑 (1) 升级 (2) 改 Tolaria 自定义 (3) 替换 ProseMirror
- **风险**: 高 scope, 必须先有 v0.2 spec + design
- **估时**: 1 周+

## 建议 PR 节奏 (按 user preference "v0.1 GUI 验收闭环再进 PR10")

1. **PR 9.6 (本)**: dreamforge 自己的 ADRs (ADR-005, 1-2 天)
2. **PR 10**: ADR-001 (Ollama Consolidator, 半天)
3. **PR 11**: ADR-004 (trash Tolaria 残 test, 1-2 小时) + ADR-003 (coverage gate, 半天)
4. **PR 12**: ADR-002 (多 vault UI, 半天)
5. **PR 13+**: ADR-006 / ADR-007 (大 scope, 等 v0.2 spec)

## v0.2 关键决策待定 (等 user 决定)

- **Ollama 模型**: qwen2.5:0.5b (轻) vs llama3.2:1b (快) vs 别的
- **Settings 持久化**: 留 localStorage (简单) vs 换 tauri-plugin-store (跨平台一致)
- **Editor 升级**: 升 BlockNote (小风险) vs 改 Tolaria 自定义 (大风险 vs 大收益)
- **Vault 数据格式**: 沿用 raw/ + MEMORY.md (现状) vs 换 SQLite 索引 (大改)

## 参考

- v0.1 decision log: `docs/superpowers/plans/2026-06-16-dreamforge-decisions.md` §1-§22
- DreamForge AGENTS.md: `AGENTS.md` (280+ 行, dreamforge 自家版本)
- memory: `~/.mavis/agents/main/memory/dreamforge-architecture.md`
