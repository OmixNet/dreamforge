# THIRD_PARTY_NOTICES — DreamForge

DreamForge (梦铸) 是一个本地优先的个人知识 App，由 Tolaria 桌面壳 fork + DreamVault 引擎 sidecar 整合而来。本文件记录第三方来源及其协议。

---

## 1. Tolaria

**项目**: [Tolaria](https://github.com/refactoringhq/tolaria) by Luca Rossi
**协议**: AGPL-3.0-or-later
**Copyright**: © Luca Rossi

**DreamForge 用了什么**：
- 完整的 Tauri 2 + React + TypeScript + Rust 桌面壳
- Markdown 编辑器（基于 CodeMirror 6 / BlockNote）
- 文件树 / 文件浏览 / 全文搜索
- wikilink / backlinks
- 本地 Git commit 流程
- Tauri command 层（command registration, plugin integration）
- 项目配置文件（package.json, tauri.conf.json, Cargo.toml, biome/eslint/lint 等）

**DreamForge 修改了什么**（2026-06 Slim 化）：
- 包名 / 产品名 / bundle identifier：tolaria → dreamforge
- 配置文件目录：com.tolaria.app → com.biomatrix.dreamforge
- 移除 updater plugin（AGPL 无需发布源，v0.1 不发布）
- 移除 deep link plugin
- 移除 mcp-server 模块的 runtime 调用（`spawn_ws_bridge_with_paths` / `extract_mcp_server_to_stable_dir`）
- 移除 invoke handler 命令：`download_and_install_app_update` / `check_for_app_update` / `clone_git_repo` / `create_getting_started_vault` / `register_mcp_tools` / `remove_mcp_tools` / `check_mcp_status` / `get_mcp_config_snippet` / `sync_mcp_bridge_vault` / `reinit_telemetry` / `export_current_webview_pdf` / `can_export_current_webview_pdf`
- 移除 6 类 UI 入口（via `DREAMFORGE_SLIM_MODE` feature flag）：
  - AI Chat / Claude / Codex / Gemini / OpenCode / Pi / Kiro floating button + workspace surface
  - MCP setup dialog
  - Update banner
  - Feedback / Docs / Release channel
  - Clone getting-started vault
  - 多 workspace 切换
- 替换应用图标（参见 [LICENSE](LICENSE) 下原始水珠图标 by Luca Rossi；v0.1 图标由 DreamForge 项目设计）
- 修改产品描述：Personal knowledge and life management app → Local-first knowledge app that forges raw material and markdown notes into long-term personal memory

**合规路径**：
- DreamForge 仓库根 [LICENSE](LICENSE) 是 AGPL-3.0-or-later
- 所有衍生代码 / 资源 / UI / 文本 / 图标继承 AGPL-3.0-or-later
- 如果将来去 AGPL 化（重新协议），必须**重写所有 Tolaria 衍生代码**（编辑器 / 文件树 / Git 流程 / Tauri command / 等）

---

## 2. DreamVault

**项目**: [DreamVault](https://github.com/biomatrix/DreamVault) by biomatrix
**协议**: MIT
**Copyright**: © biomatrix

**DreamForge 用了什么**：
- 通过 `dream` CLI subprocess 调用（不在本仓库）
- CLI 子命令：`status` / `run` / `report`（含 `--vault <path>` 全局选项）
- Dream 面板触发 3 个 Tauri command：`dreamvault_status` / `dreamvault_run` / `dreamvault_report`
- 路径优先级：Settings `dream_cli_path` → `DREAMFORGE_DREAM_CLI` 环境变量 → `PATH` 兜底

**为什么 sidecar 而非源码依赖**：
- DreamVault 是 Swift 项目（macOS 专属），与 DreamForge 的 Tauri/Rust 桌面壳不在同一 toolchain
- CLI 形态让两个项目解耦：DreamVault 可以独立发布，DreamForge 不会卡其 release 节奏
- 阶段 1 接入：Tauri 启动后用 `Command::new("dream")` 调 CLI 子进程
- 阶段 4 评估：是否把 DreamVault 引擎重写为 Rust 内嵌（消除 IPC 开销）

---

## 3. agentmemory

**项目**: [agentmemory](https://github.com/iii-hq/agentmemory) by iii-hq
**协议**: Apache-2.0
**Copyright**: © iii-hq

**DreamForge 用了什么**：
- 记忆评分思想：importance / recency / frequency / reinforcement / conflictPenalty
- 强化（reinforcement）规则：同一主题多次出现 → reinforcement 分数上升
- 衰减（decay）规则：长期未触达且低分 → decayed / archived
- 冲突检测：Consolidator 内部对矛盾记忆做标记

**DreamForge 怎么用**：
- **不是** runtime 依赖（不 npm/cargo install agentmemory）
- 只取算法思想，DreamForge 在 DreamVault 引擎内自行实现
- 评分公式（v0.1）：
  ```
  score = importance * 0.40
        + recency * 0.20
        + frequency * 0.20
        + reinforcement * 0.20
        - conflictPenalty * 0.30
  ```
- 阶段 1 / v0.1 不接前端 UI，评分是 DreamVault 后台跑

**合规路径**：
- 算法思想（公式、规则）不受 copyright 保护
- 不复制 agentmemory 源码到本仓库
- NOTICE 文件（如果有）随 DreamVault 引擎一并继承

---

## 4. 第三方 npm / cargo 依赖

DreamForge 通过 Tauri 2 + React + TypeScript + Rust 生态间接使用大量第三方包。这些包各自的 license 在各自仓库维护。本文件不逐一列出。

**主要依赖**（不完整）：
- Tauri 2 (MIT/Apache-2.0)
- React 19 (MIT)
- CodeMirror 6 / BlockNote (MIT)
- Rust 生态 crates（各包 license 见 crates.io）

---

## 5. 图标 / 品牌资产

- **v0.1 应用图标**（银色月牙 + 知识图谱 + 橙色记忆核心）：由 DreamForge 项目设计
- **v0.1 之前的 Tolaria 水珠图标**（已在 icons-tolaria-backup/ 备份）：© Luca Rossi
- **应用名 "DreamForge"**（中文：梦铸）：由 DreamForge 项目命名
- **应用名 "Tolaria"**：© Luca Rossi，AGPL-3.0-or-later 继承使用

---

## 6. 修改 / 更新本文件

- 添加新第三方来源时：填到对应章节
- 修改 AGPL 衍生代码时：在第 1 节 "DreamForge 修改了什么" 加一行
- 阶段 4 物理删除代码时：标记"已物理删除，代码已 git history 保留"
