# DreamForge 开发手册

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Tolaria 作为完整桌面 App 主体，把 DreamVault 作为记忆整理引擎接入，并逐步吸收 agentmemory 的记忆评分、强化、衰减和冲突思想，开发成本尽量低。

**Architecture:** DreamForge 采用 “Tolaria shell + DreamVault engine sidecar” 架构。Tolaria 负责 Tauri/React/Rust 桌面外壳、Markdown 编辑器、文件浏览、Git 和设置页；DreamVault 保留为 Swift/CLI 引擎，负责 `gather -> consolidate -> decay -> persist -> commit` 记忆流程。agentmemory 不直接整包搬入第一版，只把核心算法思想拆成可测试的小模块逐步接入 DreamVault。

**Tech Stack:** Tauri 2, React, TypeScript, Rust, SwiftPM, Markdown vault, optional Git, Vitest, Cargo test, Swift test.

---

## 0. 最终命名

**软件名：** DreamForge

**中文名：** 梦铸

**一句话定位：**

DreamForge 是一个把原始资料和 Markdown 笔记自动锻造成长期个人记忆库的本地知识 App。

**命名体系：**

```text
App 名称：DreamForge
项目目录：/Users/biomatrix/Desktop/APP/dreamforge
核心引擎：Dream
自动整理按钮：Run Dream
原始资料区：raw/
可编辑笔记区：notes/
长期知识区：wiki/
归档区：archive/
内部状态区：.dream/
长期入口文件：MEMORY.md
```

## 1. 总体开发策略

不要把三个项目一开始揉成一个大工程。第一版只做最低成本闭环：

```text
Tolaria 打开 vault
  -> 用户编辑 notes/wiki Markdown
  -> 点击 Run Dream
  -> Tolaria 调用 DreamVault CLI
  -> DreamVault 整理 raw/notes/wiki
  -> 生成 MEMORY.md 和报告
  -> Tolaria 刷新文件列表
```

这样做的好处：

- 不重写 Tolaria 已经完成的桌面 App、Markdown 编辑器、文件列表、Git UI。
- 不推倒 DreamVault 已经存在的 DreamEngine。
- agentmemory 先做算法参考，不让第一版被大迁移拖死。
- 每个阶段都有可运行结果，坏了也容易定位。

## 2. 当前三个项目的职责

### 2.1 Tolaria

路径：

```bash
/Users/biomatrix/Desktop/APP/tolaria-main
```

职责：

- Tauri 桌面壳
- React 前端
- Markdown 编辑器
- 文件浏览
- Git 操作
- 设置、状态栏、窗口管理
- 后端 Rust command 层

在 DreamForge 里，Tolaria 是主体。

### 2.2 DreamVault

路径：

```bash
/Users/biomatrix/Desktop/APP/DreamVault
```

职责：

- DreamEngine
- 原始文件导入
- `raw/` 不可变策略
- `notes/` 可编辑副本
- 记忆巩固、衰减、持久化
- `MEMORY.md` / report 生成
- `dream` CLI

在 DreamForge 里，DreamVault 是引擎。

### 2.3 agentmemory

路径：

```bash
/Users/biomatrix/Desktop/APP/agentmemory-main
```

职责：

- 记忆管理思想参考
- importance / recency / reinforcement 等评分思想
- 冲突和长期记忆维护思想

在 DreamForge 第一版里，不直接把 agentmemory 作为运行时依赖。

## 3. 最终项目结构

目标目录：

```bash
/Users/biomatrix/Desktop/APP/dreamforge
```

建议结构：

```text
dreamforge/
  package.json
  src/
    App.tsx
    components/
      DreamPanel.tsx
      DreamFloatingButton.tsx
    mock-tauri/
      mock-handlers.ts
  src-tauri/
    Cargo.toml
    src/
      commands/
        dreamvault.rs
        mod.rs
      lib.rs
  docs/
    dreamforge/
      architecture.md
      vault-layout.md
      dev-runbook.md
```

DreamVault 保留在旁边：

```text
/Users/biomatrix/Desktop/APP/DreamVault
```

第一版不把 DreamVault 源码复制进 `dreamforge/`。DreamForge 通过 CLI 调用它。

## 4. 第一阶段：建立 DreamForge 工作副本

### Task 1: 复制 Tolaria 成为 DreamForge 主工程

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge`
- Source: `/Users/biomatrix/Desktop/APP/tolaria-main`

- [ ] **Step 1: 进入 APP 工作目录**

```bash
cd /Users/biomatrix/Desktop/APP
```

- [ ] **Step 2: 复制 Tolaria**

```bash
cp -R tolaria-main dreamforge
```

- [ ] **Step 3: 进入 DreamForge**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
```

- [ ] **Step 4: 确认复制成功**

```bash
ls
```

Expected: 能看到 `package.json`、`src`、`src-tauri`。

### Task 2: 修改基础项目名

**Files:**

- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/package.json`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/tauri.conf.json`
- Search: `/Users/biomatrix/Desktop/APP/dreamforge/src`

- [ ] **Step 1: 修改 `package.json`**

把：

```json
"name": "tolaria"
```

改成：

```json
"name": "dreamforge"
```

- [ ] **Step 2: 查找 App 显示名**

```bash
rg "Tolaria|tolaria|Laputa|laputa" /Users/biomatrix/Desktop/APP/dreamforge
```

- [ ] **Step 3: 只改用户可见名称**

第一轮只改窗口标题、菜单名称、about 名称、文档标题。不要改内部变量名，避免大面积破坏。

推荐规则：

```text
用户可见 Tolaria -> DreamForge
代码内部 tolaria -> 暂时不动
旧测试里的 Tolaria -> 暂时不动
```

- [ ] **Step 4: 运行前端类型检查**

```bash
pnpm build
```

Expected: 如果依赖已安装，应通过；如果没有安装依赖，先执行 `pnpm install`。

## 5. 第二阶段：跑通原版 Tolaria

### Task 3: 安装依赖

**Files:**

- Read: `/Users/biomatrix/Desktop/APP/dreamforge/package.json`
- Generated: `/Users/biomatrix/Desktop/APP/dreamforge/node_modules`

- [ ] **Step 1: 安装前端依赖**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm install
```

Expected: 生成 `node_modules/`。

- [ ] **Step 2: 安装 Rust/Tauri 依赖**

```bash
pnpm tauri info
```

Expected: 输出 Tauri 环境信息。

### Task 4: 跑起 DreamForge 壳

**Files:**

- Read: `/Users/biomatrix/Desktop/APP/dreamforge/src/App.tsx`
- Read: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/src/lib.rs`

- [ ] **Step 1: 启动开发版桌面 App**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm tauri dev
```

Expected: 桌面 App 能打开。

- [ ] **Step 2: 打开一个 Markdown vault**

先用任意测试目录：

```bash
mkdir -p /Users/biomatrix/Desktop/APP/dreamforge-test-vault/notes
printf "# Hello DreamForge\n" > /Users/biomatrix/Desktop/APP/dreamforge-test-vault/notes/hello.md
```

在 App 里打开：

```text
/Users/biomatrix/Desktop/APP/dreamforge-test-vault
```

Expected: 文件列表能看到 `hello.md`，编辑器能打开。

## 6. 第三阶段：跑通 DreamVault CLI

### Task 5: 构建 DreamVault CLI

**Files:**

- Read: `/Users/biomatrix/Desktop/APP/DreamVault/Package.swift`
- Read: `/Users/biomatrix/Desktop/APP/DreamVault/Sources`

- [ ] **Step 1: 进入 DreamVault**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
```

- [ ] **Step 2: 构建 CLI**

```bash
swift build
```

Expected: 构建成功。

- [ ] **Step 3: 运行帮助命令**

```bash
swift run dream --help
```

Expected: 输出 `dream` CLI 可用命令。

### Task 6: 统一 CLI 参数

**Files:**

- Modify: `/Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamCLI/CLI.swift`
- Test: `/Users/biomatrix/Desktop/APP/DreamVault/Tests`

目标 CLI 形式：

```bash
dream status --vault /path/to/vault
dream run --vault /path/to/vault
dream report --vault /path/to/vault
```

- [ ] **Step 1: 检查当前 CLI 是否已有 `--vault`**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift run dream status --vault /Users/biomatrix/Desktop/APP/dreamforge-test-vault
```

Expected: 如果能输出 vault 状态，说明已有；如果报未知参数，则需要补。

- [ ] **Step 2: 为 `status` 添加 vault 参数**

要求：

```text
status --vault <path>
```

输出至少包含：

```text
Vault: /path/to/vault
Raw files: <number>
Notes: <number>
Memory: present/missing
```

- [ ] **Step 3: 为 `run` 添加 vault 参数**

要求：

```text
run --vault <path>
```

行为：

```text
读取 raw/ 和 notes/
运行 DreamEngine
更新 wiki/、archive/、MEMORY.md、.dream/
输出本次处理摘要
```

- [ ] **Step 4: 为 `report` 添加 vault 参数**

要求：

```text
report --vault <path>
```

输出至少包含：

```text
最新运行时间
新增候选记忆数
强化记忆数
衰减记忆数
冲突数
报告文件路径
```

- [ ] **Step 5: 运行 DreamVault 测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test
```

Expected: PASS。

## 7. 第四阶段：统一 vault 目录结构

### Task 7: 创建 DreamForge vault 规范

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge/docs/dreamforge/vault-layout.md`

- [ ] **Step 1: 创建文档目录**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
mkdir -p docs/dreamforge
```

- [ ] **Step 2: 写入 vault 规范**

文件内容：

```markdown
# DreamForge Vault Layout

DreamForge vault is a local Markdown-first knowledge base.

## Directories

- `raw/`: immutable source material.
- `notes/`: editable Markdown working notes.
- `wiki/`: durable synthesized knowledge.
- `archive/`: decayed or retired knowledge.
- `.dream/`: Dream engine state, logs, reports, indexes.

## Root Files

- `MEMORY.md`: human-readable long-term memory index.

## Rules

1. User edits `notes/` and `wiki/`.
2. Dream engine writes `wiki/`, `archive/`, `.dream/`, and `MEMORY.md`.
3. Imported source files are preserved under `raw/`.
4. Markdown imports create both a raw copy and an editable note copy.
5. Non-Markdown imports start as raw records and may produce notes later.
```

- [ ] **Step 3: 创建测试 vault**

```bash
mkdir -p /Users/biomatrix/Desktop/APP/dreamforge-test-vault/{raw,notes,wiki,archive,.dream}
printf "# DreamForge Memory\n" > /Users/biomatrix/Desktop/APP/dreamforge-test-vault/MEMORY.md
```

Expected: 目录完整。

## 8. 第五阶段：给 Tolaria 增加 DreamVault Tauri 命令

### Task 8: 添加 Rust command 模块

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/src/commands/dreamvault.rs`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/src/commands/mod.rs`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/src/lib.rs`

目标新增命令：

```text
dreamvault_status
dreamvault_run
dreamvault_report
```

每个命令接收：

```text
vaultPath: string
dreamCliPath?: string
```

每个命令返回：

```json
{
  "stdout": "...",
  "stderr": "...",
  "success": true
}
```

- [ ] **Step 1: 创建失败测试**

在 `dreamvault.rs` 里先写纯函数测试，测试命令参数构建：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Status,
            "/tmp/vault",
            Some("/tmp/dream".to_string()),
        );

        assert_eq!(spec.program, "/tmp/dream");
        assert_eq!(spec.args, vec!["status", "--vault", "/tmp/vault"]);
    }

    #[test]
    fn run_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Run,
            "/tmp/vault",
            Some("/tmp/dream".to_string()),
        );

        assert_eq!(spec.args, vec!["run", "--vault", "/tmp/vault"]);
    }

    #[test]
    fn report_command_uses_vault_path() {
        let spec = build_dreamvault_command(
            DreamVaultAction::Report,
            "/tmp/vault",
            Some("/tmp/dream".to_string()),
        );

        assert_eq!(spec.args, vec!["report", "--vault", "/tmp/vault"]);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge/src-tauri
cargo test dreamvault
```

Expected: FAIL，因为模块和函数还没实现。

- [ ] **Step 3: 实现最小命令模块**

核心逻辑：

```rust
use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DreamVaultAction {
    Status,
    Run,
    Report,
}

#[derive(Debug, Eq, PartialEq)]
struct DreamVaultCommandSpec {
    program: String,
    args: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamVaultCommandOutput {
    stdout: String,
    stderr: String,
    success: bool,
}

fn action_name(action: DreamVaultAction) -> &'static str {
    match action {
        DreamVaultAction::Status => "status",
        DreamVaultAction::Run => "run",
        DreamVaultAction::Report => "report",
    }
}

fn resolve_dream_cli_path(explicit: Option<String>) -> String {
    if let Some(path) = explicit.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        return path;
    }

    std::env::var("DREAMFORGE_DREAM_CLI")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "dream".to_string())
}

fn build_dreamvault_command(
    action: DreamVaultAction,
    vault_path: &str,
    dream_cli_path: Option<String>,
) -> DreamVaultCommandSpec {
    DreamVaultCommandSpec {
        program: resolve_dream_cli_path(dream_cli_path),
        args: vec![
            action_name(action).to_string(),
            "--vault".to_string(),
            vault_path.to_string(),
        ],
    }
}
```

- [ ] **Step 4: 添加 Tauri command**

实现：

```rust
#[cfg(desktop)]
fn run_dreamvault_action(
    action: DreamVaultAction,
    vault_path: String,
    dream_cli_path: Option<String>,
) -> Result<DreamVaultCommandOutput, String> {
    let spec = build_dreamvault_command(action, &vault_path, dream_cli_path);
    let output = crate::hidden_command(&spec.program)
        .args(&spec.args)
        .output()
        .map_err(|error| format!("Failed to launch DreamVault CLI '{}': {error}", spec.program))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        Ok(DreamVaultCommandOutput { stdout, stderr, success: true })
    } else {
        let detail = if stderr.is_empty() { stdout.clone() } else { stderr.clone() };
        Err(format!("DreamVault CLI failed: {detail}"))
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dreamvault_status(
    vault_path: String,
    dream_cli_path: Option<String>,
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(DreamVaultAction::Status, vault_path, dream_cli_path)
    })
    .await
    .map_err(|error| format!("DreamVault status task failed: {error}"))?
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dreamvault_run(
    vault_path: String,
    dream_cli_path: Option<String>,
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(DreamVaultAction::Run, vault_path, dream_cli_path)
    })
    .await
    .map_err(|error| format!("DreamVault run task failed: {error}"))?
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dreamvault_report(
    vault_path: String,
    dream_cli_path: Option<String>,
) -> Result<DreamVaultCommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_dreamvault_action(DreamVaultAction::Report, vault_path, dream_cli_path)
    })
    .await
    .map_err(|error| format!("DreamVault report task failed: {error}"))?
}
```

- [ ] **Step 5: 注册模块**

在 `src-tauri/src/commands/mod.rs` 加：

```rust
mod dreamvault;
pub use dreamvault::*;
```

- [ ] **Step 6: 注册 invoke handler**

在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!` 列表里加：

```rust
commands::dreamvault_status,
commands::dreamvault_run,
commands::dreamvault_report,
```

- [ ] **Step 7: 运行 Rust 测试**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge/src-tauri
cargo test dreamvault
```

Expected: PASS。

## 9. 第六阶段：添加前端 Dream 面板

### Task 9: 添加 DreamPanel 组件

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge/src/components/DreamPanel.tsx`
- Create: `/Users/biomatrix/Desktop/APP/dreamforge/src/components/DreamPanel.test.tsx`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src/mock-tauri/mock-handlers.ts`

目标 UI：

```text
Dream
[Status] [Run Dream] [Report]

Output area
```

- [ ] **Step 1: 写前端失败测试**

测试行为：

```text
点击 Status -> 调用 dreamvault_status
点击 Run Dream -> 调用 dreamvault_run
点击 Report -> 调用 dreamvault_report
命令输出显示在面板里
run 成功后触发 onVaultChanged
```

测试文件核心内容：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DreamPanel } from './DreamPanel'
import { mockInvoke } from '../mock-tauri'

vi.mock('../mock-tauri', () => ({
  isTauri: () => false,
  mockInvoke: vi.fn(),
}))

describe('DreamPanel', () => {
  beforeEach(() => {
    vi.mocked(mockInvoke).mockReset()
  })

  it('runs DreamVault status for the active vault', async () => {
    vi.mocked(mockInvoke).mockResolvedValueOnce({
      stdout: 'Vault: /tmp/vault',
      stderr: '',
      success: true,
    })

    render(<DreamPanel vaultPath="/tmp/vault" />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))

    expect(await screen.findByText(/Vault: \/tmp\/vault/)).toBeInTheDocument()
    expect(mockInvoke).toHaveBeenCalledWith('dreamvault_status', { vaultPath: '/tmp/vault' })
  })

  it('refreshes the vault after Run Dream succeeds', async () => {
    const onVaultChanged = vi.fn()
    vi.mocked(mockInvoke).mockResolvedValueOnce({
      stdout: 'Dream cycle complete',
      stderr: '',
      success: true,
    })

    render(<DreamPanel vaultPath="/tmp/vault" onVaultChanged={onVaultChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Dream' }))

    expect(await screen.findByText(/Dream cycle complete/)).toBeInTheDocument()
    expect(onVaultChanged).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm test -- src/components/DreamPanel.test.tsx
```

Expected: FAIL，因为组件还不存在。

- [ ] **Step 3: 实现 DreamPanel**

组件要求：

```tsx
import { invoke } from '@tauri-apps/api/core'
import { FileText, ListChecks, Play } from '@phosphor-icons/react'
import { useState } from 'react'
import { isTauri, mockInvoke } from '../mock-tauri'
import { Button } from './ui/button'

interface DreamVaultCommandOutput {
  stdout: string
  stderr: string
  success: boolean
}

interface DreamPanelProps {
  vaultPath: string
  onVaultChanged?: () => void
}

type DreamCommand = 'dreamvault_status' | 'dreamvault_run' | 'dreamvault_report'

async function runDreamCommand(command: DreamCommand, vaultPath: string): Promise<DreamVaultCommandOutput> {
  const args = { vaultPath }
  return isTauri()
    ? invoke<DreamVaultCommandOutput>(command, args)
    : mockInvoke<DreamVaultCommandOutput>(command, args)
}

export function DreamPanel({ vaultPath, onVaultChanged }: DreamPanelProps) {
  const [output, setOutput] = useState('No Dream run yet.')
  const [loadingCommand, setLoadingCommand] = useState<DreamCommand | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCommand(command: DreamCommand) {
    setLoadingCommand(command)
    setError(null)
    try {
      const result = await runDreamCommand(command, vaultPath)
      setOutput([result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'Command completed.')
      if (command === 'dreamvault_run') onVaultChanged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setOutput(message)
    } finally {
      setLoadingCommand(null)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Dream</h2>
      </header>
      <div className="flex gap-2 border-b border-border px-4 py-3">
        <Button type="button" size="sm" variant="outline" onClick={() => handleCommand('dreamvault_status')} disabled={loadingCommand !== null}>
          <ListChecks size={16} />
          Status
        </Button>
        <Button type="button" size="sm" onClick={() => handleCommand('dreamvault_run')} disabled={loadingCommand !== null}>
          <Play size={16} />
          Run Dream
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => handleCommand('dreamvault_report')} disabled={loadingCommand !== null}>
          <FileText size={16} />
          Report
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-5 text-muted-foreground">
        {error ? `Error: ${error}` : output}
      </pre>
    </section>
  )
}
```

- [ ] **Step 4: 添加 mock handlers**

在 `src/mock-tauri/mock-handlers.ts` 的 `mockHandlers` 里加：

```ts
dreamvault_status: (args?: { vaultPath?: string }) => ({
  stdout: `Vault: ${args?.vaultPath ?? '/mock/vault'}\nRaw files: 1\nNotes: 3\nMemory: present`,
  stderr: '',
  success: true,
}),
dreamvault_run: () => ({
  stdout: 'Dream cycle complete\nCandidates: 2\nReinforced: 1\nDecayed: 0\nConflicts: 0',
  stderr: '',
  success: true,
}),
dreamvault_report: () => ({
  stdout: 'Latest Dream report\nCandidates: 2\nReinforced: 1\nDecayed: 0\nConflicts: 0',
  stderr: '',
  success: true,
}),
```

- [ ] **Step 5: 运行前端测试**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm test -- src/components/DreamPanel.test.tsx
```

Expected: PASS。

### Task 10: 添加悬浮按钮和主界面挂载

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge/src/components/DreamFloatingButton.tsx`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src/App.tsx`
- Modify: `/Users/biomatrix/Desktop/APP/dreamforge/src/App.css`

- [ ] **Step 1: 创建 DreamFloatingButton**

```tsx
import { MoonStars } from '@phosphor-icons/react'
import { ActionTooltip } from '@/components/ui/action-tooltip'
import { Button } from '@/components/ui/button'

interface DreamFloatingButtonProps {
  onOpen: () => void
}

export function DreamFloatingButton({ onOpen }: DreamFloatingButtonProps) {
  return (
    <ActionTooltip copy={{ label: 'Open Dream panel' }} side="top" align="end" sideOffset={10}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="fixed bottom-11 right-[84px] z-30 size-12 rounded-full border border-border bg-background text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.18),0_2px_8px_rgba(15,23,42,0.12)] hover:bg-background hover:text-foreground"
        aria-label="Open Dream panel"
        onClick={onOpen}
      >
        <MoonStars size={22} />
      </Button>
    </ActionTooltip>
  )
}
```

- [ ] **Step 2: 在 App.tsx 引入组件**

```tsx
import { DreamPanel } from './components/DreamPanel'
import { DreamFloatingButton } from './components/DreamFloatingButton'
```

- [ ] **Step 3: 添加状态**

在 `App` 内部已有 `useState` 附近加：

```tsx
const [showDreamPanel, setShowDreamPanel] = useState(false)
```

- [ ] **Step 4: 在 editor 右侧挂载面板**

在 editor div 后面加：

```tsx
{showDreamPanel && (
  <div className="app__dream-panel">
    <DreamPanel
      vaultPath={resolvedPath}
      onVaultChanged={() => {
        void vault.reloadVault()
      }}
    />
  </div>
)}
```

- [ ] **Step 5: 添加悬浮按钮**

在 AI floating button 附近加：

```tsx
{!showDreamPanel ? (
  <DreamFloatingButton onOpen={() => setShowDreamPanel(true)} />
) : null}
```

- [ ] **Step 6: 添加 CSS**

在 `src/App.css` 加：

```css
.app__dream-panel {
  flex: 0 0 360px;
  min-width: 320px;
  max-width: 420px;
  min-height: 0;
  display: flex;
  background: var(--background);
}

.app__dream-panel > * {
  flex: 1;
}
```

- [ ] **Step 7: 运行 build**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm build
```

Expected: PASS。

## 10. 第七阶段：导入流程

### Task 11: 保持 raw 不可变，生成 notes 可编辑副本

**Files:**

- Modify: `/Users/biomatrix/Desktop/APP/DreamVault/Sources`
- Test: `/Users/biomatrix/Desktop/APP/DreamVault/Tests`

规则：

```text
导入 .md:
  raw/<timestamp>-filename.md
  notes/filename.md

导入 .txt:
  raw/<timestamp>-filename.txt

导入 .pdf/.docx:
  raw/<timestamp>-filename.<ext>
```

- [ ] **Step 1: 写测试**

测试名称：

```text
testMarkdownImportCreatesRawCopyAndEditableNote
testTextImportCreatesRawOnly
testRawFilesAreNotOverwritten
```

- [ ] **Step 2: 跑失败测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test --filter RawImporterTests
```

- [ ] **Step 3: 实现导入规则**

要求：

```text
raw 文件一旦写入，不被编辑器保存覆盖
notes 文件可被 Tolaria 正常编辑
同名文件使用时间戳或安全后缀避免覆盖
```

- [ ] **Step 4: 跑测试**

```bash
swift test --filter RawImporterTests
```

Expected: PASS。

## 11. 第八阶段：Dream 报告

### Task 12: 生成面向用户的报告

**Files:**

- Modify: `/Users/biomatrix/Desktop/APP/DreamVault/Sources`
- Output: `/Users/biomatrix/Desktop/APP/dreamforge-test-vault/.dream/reports/latest.md`
- Output: `/Users/biomatrix/Desktop/APP/dreamforge-test-vault/MEMORY.md`

报告格式：

```markdown
# Dream Report

## Summary

- Raw files scanned: 0
- Notes scanned: 0
- Candidate memories: 0
- Reinforced memories: 0
- Decayed memories: 0
- Conflicts: 0

## Candidate Memories

## Reinforced Memories

## Decayed Memories

## Conflicts
```

- [ ] **Step 1: 写报告生成测试**

测试行为：

```text
运行 dream run 后生成 .dream/reports/latest.md
运行 dream report 输出 latest.md 内容摘要
MEMORY.md 存在且包含长期记忆入口
```

- [ ] **Step 2: 运行失败测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test --filter DreamReportTests
```

- [ ] **Step 3: 实现报告生成**

要求：

```text
每次 run 生成时间戳报告
latest.md 指向或复制最新报告
report 命令输出 latest.md 的核心摘要
```

- [ ] **Step 4: 跑测试**

```bash
swift test --filter DreamReportTests
```

Expected: PASS。

## 12. 第九阶段：agentmemory 思想接入

### Task 13: 增加记忆评分模型

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamEngine/MemoryScorer.swift`
- Create: `/Users/biomatrix/Desktop/APP/DreamVault/Tests/DreamEngineTests/MemoryScorerTests.swift`

第一版评分字段：

```text
importance: 0.0...1.0
recency: 0.0...1.0
frequency: 0.0...1.0
reinforcement: 0.0...1.0
conflictPenalty: 0.0...1.0
```

总分：

```text
score = importance * 0.40
      + recency * 0.20
      + frequency * 0.20
      + reinforcement * 0.20
      - conflictPenalty * 0.30
```

- [ ] **Step 1: 写测试**

测试：

```text
重要内容分数高
近期内容分数高
重复出现内容分数高
有冲突惩罚会降分
分数限制在 0...1
```

- [ ] **Step 2: 跑失败测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test --filter MemoryScorerTests
```

- [ ] **Step 3: 实现 MemoryScorer**

要求：

```text
输入 MemorySignal
输出 Double score
不依赖 UI
不读写文件
纯函数可测试
```

- [ ] **Step 4: 跑测试**

```bash
swift test --filter MemoryScorerTests
```

Expected: PASS。

### Task 14: 增加强化和衰减

**Files:**

- Modify: `/Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamEngine/Reinforcer.swift`
- Modify: `/Users/biomatrix/Desktop/APP/DreamVault/Sources/DreamEngine/DecayEngine.swift`
- Test: `/Users/biomatrix/Desktop/APP/DreamVault/Tests/DreamEngineTests`

规则：

```text
重复出现 >= 2 次：reinforced
长期未触达且低分：decayed
低分且长期无引用：archived
```

- [ ] **Step 1: 写强化测试**

```text
同一主题多次出现会增加 reinforcement
reinforcement 会进入报告 Reinforced Memories
```

- [ ] **Step 2: 写衰减测试**

```text
低分旧记忆进入 Decayed Memories
持续低分旧记忆进入 archive
```

- [ ] **Step 3: 运行失败测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test --filter ReinforcerTests
swift test --filter DecayEngineTests
```

- [ ] **Step 4: 实现强化和衰减**

要求：

```text
规则明确
报告可解释
不删除 raw
归档只移动长期知识，不破坏原始资料
```

- [ ] **Step 5: 运行测试**

```bash
swift test --filter ReinforcerTests
swift test --filter DecayEngineTests
```

Expected: PASS。

## 13. 第十阶段：端到端验收

### Task 15: 从零创建一个测试 vault

**Files:**

- Create: `/Users/biomatrix/Desktop/APP/dreamforge-e2e-vault`

- [ ] **Step 1: 创建 vault**

```bash
mkdir -p /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault/{raw,notes,wiki,archive,.dream}
cat > /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault/notes/test-memory.md <<'EOF'
# Research Direction

I want a local Markdown knowledge app that preserves raw material and turns notes into long-term memory.
EOF
cat > /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault/MEMORY.md <<'EOF'
# DreamForge Memory
EOF
```

- [ ] **Step 2: 用 DreamVault CLI 跑一次**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift run dream run --vault /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault
```

Expected: 输出 Dream cycle summary。

- [ ] **Step 3: 查看报告**

```bash
swift run dream report --vault /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault
```

Expected: 输出 latest report summary。

- [ ] **Step 4: 用 DreamForge 打开 vault**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
DREAMFORGE_DREAM_CLI=/Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream pnpm tauri dev
```

Expected:

```text
App 打开
能看到 notes/test-memory.md
能打开 Dream 面板
点击 Status 有输出
点击 Run Dream 成功
点击 Report 有输出
```

## 14. 第十一阶段：打包前检查

### Task 16: 全量检查

**Files:**

- Project: `/Users/biomatrix/Desktop/APP/dreamforge`
- Project: `/Users/biomatrix/Desktop/APP/DreamVault`

- [ ] **Step 1: DreamVault 测试**

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift test
```

Expected: PASS。

- [ ] **Step 2: DreamForge 前端测试**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm test
```

Expected: PASS。

- [ ] **Step 3: DreamForge Rust 测试**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge/src-tauri
cargo test
```

Expected: PASS。

- [ ] **Step 4: DreamForge build**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm build
```

Expected: PASS。

- [ ] **Step 5: Tauri dev run**

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
DREAMFORGE_DREAM_CLI=/Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream pnpm tauri dev
```

Expected: App 可以打开并完成 Dream 面板操作。

## 15. 常见问题处理

### 15.1 `pnpm install` 失败

先确认 pnpm 是否存在：

```bash
pnpm --version
```

如果不存在：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

再执行：

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
pnpm install
```

### 15.2 `dream` command not found

使用绝对路径：

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift build
```

然后启动 DreamForge：

```bash
cd /Users/biomatrix/Desktop/APP/dreamforge
DREAMFORGE_DREAM_CLI=/Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream pnpm tauri dev
```

### 15.3 Tauri 找不到 DreamVault CLI

检查路径：

```bash
ls /Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream
```

如果文件不存在，重新构建：

```bash
cd /Users/biomatrix/Desktop/APP/DreamVault
swift build
```

### 15.4 打开 vault 后没有文件

检查目录：

```bash
find /Users/biomatrix/Desktop/APP/dreamforge-e2e-vault -maxdepth 2 -type f
```

至少应该有：

```text
notes/test-memory.md
MEMORY.md
```

### 15.5 Run Dream 成功但 Tolaria 不刷新

检查 `DreamPanel` 的 `onVaultChanged` 是否调用：

```tsx
onVaultChanged={() => {
  void vault.reloadVault()
}}
```

如果没有刷新，先手动切换文件夹或重新打开 vault，再排查 `reloadVault` 返回值。

## 16. 第一版完成标准

DreamForge 第一版只要满足下面 8 条，就算完成：

- [ ] App 显示名是 DreamForge。
- [ ] 可以打开本地 Markdown vault。
- [ ] 可以编辑 `notes/` 和 `wiki/`。
- [ ] `raw/` 原始资料不会被编辑器覆盖。
- [ ] 有 Dream 悬浮按钮或右侧 Dream 面板。
- [ ] 点击 Status 可以看到 vault 状态。
- [ ] 点击 Run Dream 可以运行 DreamVault 引擎。
- [ ] 点击 Report 可以看到最新记忆整理报告。

## 17. 第二版再做的事

第二版才处理：

- 深度重构 UI。
- 把 DreamVault Swift 引擎改写成 Rust。
- 把 agentmemory 整体变成运行时依赖。
- 做复杂图谱视图。
- 做多设备同步。
- 做发布安装包、签名、公证。

这些都不要放进第一版。

## 18. 推荐执行顺序

严格按这个顺序做：

```text
1. 复制 tolaria-main -> dreamforge
2. 跑通原版 DreamForge 壳
3. 跑通 DreamVault CLI
4. 统一 vault 目录
5. 加 Tauri dreamvault_* 命令
6. 加 DreamPanel
7. 加 DreamFloatingButton
8. 点击 Run Dream 后刷新 vault
9. 补 raw/notes 导入规则
10. 补报告和 MEMORY.md
11. 接入评分、强化、衰减
12. 端到端验收
```

## 19. 当前最佳下一步

下一步不是直接重写引擎，而是先做最小闭环：

```bash
cd /Users/biomatrix/Desktop/APP
cp -R tolaria-main dreamforge
cd dreamforge
pnpm install
pnpm tauri dev
```

当 DreamForge 壳能打开后，再接 DreamVault CLI。
