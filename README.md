# 🌙 DreamX

DreamX 是一个本地优先的知识 App，把原始资料和 Markdown 笔记自动锻造成长期个人记忆库。

> "**raw/ → notes/ → wiki/ → MEMORY.md → Dream report**" —— 在夜里，把零散记忆锻造成知识图谱。

## 这是什么

DreamX 由两部分组成：

- **Tauri 桌面壳**（本仓库）：原生 macOS 桌面应用，本地 Markdown vault、文件树、编辑器、搜索、wikilink / backlinks、本地 Git 快照、Dream 面板
- **DreamVault 引擎**（[DreamVault 仓库](https://github.com/biomatrix/DreamVault) 单独存放）：Swift/CLI 引擎，跑 `gather → consolidate → decay → persist → commit` 记忆整理流程

第一版（DreamX Slim v0.1）只支持 **macOS 本地使用**，不连任何外部服务（无 AI 云、无 PostHog / Sentry、无 updater、无远程 Git push UI、无 deep link、无多 vault mounted、无跨平台发布）。

## 核心规则

```
raw/      不可变原始资料
notes/    用户可编辑笔记
wiki/     长期知识（合成）
.dream/   Dream 引擎状态（引擎独占）
MEMORY.md 长期入口索引（用户可改，引擎 section-based diff 不覆盖）
```

Dream 引擎按 H1/H2 section 做轻量 diff，**不会**全量覆盖用户文件。详见 [docs/dreamforge/decisions.md](docs/superpowers/plans/2026-06-16-dreamforge-decisions.md)。

## UI 形态（v0.1）

```
┌─────────────────────────────────────────────────────┐
│ 顶部：打开 vault │ 新建 note │ 搜索 │ 设置          │
├──────────┬──────────────────────────┬───────────────┤
│          │                          │               │
│  Vault   │   Markdown 编辑器         │   Dream       │
│  文件树  │                          │   面板        │
│          │                          │               │
│          │                          │  Status       │
│          │                          │  Run Dream    │
│          │                          │  Report       │
│          │                          │  Conflicts    │
│          │                          │               │
└──────────┴──────────────────────────┴───────────────┘
```

3 区，4 个顶部入口，4 个 Dream 按钮。**没有任何"产品化"功能**（AI Chat / 多 workspace / clone getting-started / 远程 Git push / 反馈 / 升级 / 文档链接 / 多语言 / Tldraw 画板 / PDF 导出）。

## 开发

### 前置

- Node 24+, pnpm 10+
- Rust stable (1.96+), Tauri 2 CLI
- macOS 14+
- DreamVault CLI binary（可选，第一版不接引擎也能跑壳）

### 启动开发版

```bash
pnpm install
pnpm tauri dev
```

### 验证编译 + 测试

```bash
pnpm build                              # tsc + vite
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

### 在 dreamforge-test-vault 上跑 Dream CLI

`scripts/dream-cli-verify.sh` 是一键验收脚本，跑过 `dream status` / `dream report` /
`dream run` 并检查 vault 结构、raw/ 只读规则、Persist 阶段失败回滚。

```bash
# 默认指向 /Users/biomatrix/Desktop/APP/dreamforge-test-vault
./scripts/dream-cli-verify.sh

# 自定义 vault 路径
VAULT_PATH=/path/to/your/vault ./scripts/dream-cli-verify.sh
```

预期（v0.1 不会真的成功 consolidate，因为本机没跑 Ollama）：

```text
=== Summary ===
  passed: 12
  warned: 1   (Ollama 不可用，v0.1 不强求)
  failed: 0
```

如果想跑 **真** dream 整理（需要本地 Ollama 在 `http://127.0.0.1:11434`）：

```bash
# 1. 启动 ollama serve
ollama serve &
# 2. 确认 dream CLI 路径
Settings → Dream → Dream CLI path = /Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream
# 3. 在 DreamX App 里打开 dreamforge-test-vault
# 4. 点 Run Dream
```

## 协议

DreamX 是 [Tolaria](https://github.com/refactoringhq/tolaria) 的衍生作品，继承 **AGPL-3.0-or-later** 协议。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 路线图

- **v0.1**（本版本）— Slim shell + DreamVault CLI 接入
- **v0.2** — 完整 markdown AST diff / 引擎重写 Rust 评估 / 打包签名公证
- **v0.3+** — 图谱视图 / 多设备同步（暂未排期）

## 致谢

- 启动梦铸的种子来自 [Tolaria](https://github.com/refactoringhq/tolaria) by Luca Rossi（AGPL-3.0-or-later）
- Dream 引擎来自 [DreamVault](https://github.com/biomatrix/DreamVault)
- 记忆评分/强化/衰减思想来自 [agentmemory](https://github.com/iii-hq/agentmemory)
