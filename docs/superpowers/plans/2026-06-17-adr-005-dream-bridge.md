# ADR-005: DreamBridge — 4-tier path resolution + Ollama/OpenAI-compat flags

- Status: Accepted (v0.1.3 base, v0.2 PR 10 adds OpenAI-compat flags)
- Deciders: dreamforge core
- Source: PR 2 (DreamVault bridge), PR 10 (planned)

## Context

DreamForge is a slim Tauri shell — it does **not** ship its own memory consolidation engine. The Consolidator lives in the **DreamVault Swift CLI** (`dream` binary, DreamVault v0.14.1) and is invoked by dreamforge's "Run Dream" button.

The dream CLI:

- Default: talks to **Ollama** (`http://127.0.0.1:11434`) for LLM
- Uses 3-step CoT (analyze / generate / verify) by default
- 4 LLM call phases: verify / conflicts / analyze / generate
- Output: `MEMORY.md` updated, wiki pages created, archive snapshots

In v0.1, dreamforge ships with dream binary pre-built and **Ollama-tolerant** (fail if Ollama not running, log warn, don't crash). v0.1 design: **shell, not engine**.

In v0.2 PR 10, the user wants to call **cloud LLMs** (Anthropic / OpenAI / OpenAI-compatible proxies) instead of Ollama. The dream CLI binary's `LLMProvider.swift` is **already OpenAI-compatible** by design (L74 comment: "不读环境变量，方便测试和上层注入"), but the binary itself is hardcoded to `localhost:11434` default.

## Decision

### Path resolution (v0.1, unchanged)

`dream` binary resolution — 4-tier fallback, mirrored in TS `src/lib/dreamCliPath.ts` and Rust `src-tauri/src/commands/dreamvault.rs`:

1. **Settings arg** — Settings → Dream → CLI path, persists in localStorage
2. **Env var** — `DREAMFORGE_DREAM_CLI` env var (for CI / scripted use)
3. **Co-located build** — `/Users/biomatrix/Desktop/APP/DreamVault/.build/{debug,release}/dream` (development)
4. **PATH** — `which dream` (installed)

### LLM provider (v0.1 = Ollama, v0.2 = Ollama + OpenAI-compat)

- **v0.1 default**: `--base-url` defaults to `http://127.0.0.1:11434` (Ollama, current behavior)
- **v0.2 PR 10 adds**:
  - `--base-url <URL>` flag on `dream` CLI (default `localhost:11434`)
  - `--model <name>` flag (default reads from existing Ollama config)
  - API key from env var ONLY, **never** CLI arg:
    - `ANTHROPIC_API_KEY` if base URL is Anthropic
    - `OPENAI_API_KEY` if base URL is OpenAI or OpenAI-compatible
    - `DREAMFORGE_LLM_API_KEY` as generic override (manual config)

### dreamforge Rust → dream subprocess (PR 10)

```rust
Command::new(dream_path)
    .arg("--base-url").arg(base_url)
    .arg("--model").arg(model)
    .arg("consolidate")
    .env_clear()                                      // optional — strip inherited env
    .env("ANTHROPIC_API_KEY", api_key)                // only the API key, nothing else
    .spawn()?
```

### Key safety (PR 10 critical)

- **NEVER** write API key to:
  - any file in `dreamforge/`
  - any file in `/tmp/` (per Xfocus precedent — `mavis-trash` after use)
  - memory (this file, MEMORY.md, scratchpad, agent memory)
  - git (no env files, no test fixtures)
  - dream CLI args (visible in `ps aux`)
  - dreamforge settings.json (localStorage)
- **ONLY**:
  - Rust process memory (injected via `Command::env()` once)
  - dream subprocess env (inherited from Rust parent)

### dreamforge settings UI (PR 10)

Settings → Dream → LLM section:

- **Base URL field** (text input, default `http://127.0.0.1:11434`)
- **Model field** (text input, default `qwen2.5:0.5b` for Ollama / `claude-3-5-sonnet-20241022` for Anthropic)
- **API key field**: **NOT in UI** (read from env at runtime; settings UI shows "Set ANTHROPIC_API_KEY env var" hint if missing)
- **Status indicator**: "Provider: Ollama" / "Provider: Anthropic" / "Provider: OpenAI"

## Consequences

### Positive

- dreamforge remains a slim shell — no LLM code in dreamforge itself
- 4-tier path resolution: works in dev, CI, production
- OpenAI-compat support unblocks Anthropic / OpenAI / proxies without forking dream CLI
- Key never leaves process memory (no disk, no log, no UI)
- v0.1 default unchanged — existing Ollama users see no difference

### Negative

- dream CLI must be **rebuilt** to add `--base-url` / `--model` flags (DreamVault Swift code change, cross-project)
- Key not in dreamforge settings means user must `export ANTHROPIC_API_KEY=...` in their shell (one-time setup in `~/.zshrc`)
- dreamforge DreamPanel invoke: `Command::env_clear()` strips env, then `Command::env(key, value)` re-adds only the key — extra care needed not to break other env vars the dream CLI might need

### Forward compatibility

- v0.1 settings.json schema: `{ "dreamCliPath": "..." }`
- v0.2 settings.json schema: `{ "dreamCliPath": "...", "llmBaseUrl": "...", "llmModel": "..." }` — **additive**, no migration
- DreamVault `LLMProvider.swift` already supports arbitrary baseURL (L74 — no Swift change needed for baseURL, only main.swift flag wiring)

## Alternatives Considered

- **dreamforge bypasses dream CLI** (Rust reqwest directly to LLM): dreamforge becomes a Consolidator itself, 4-tier path resolution + dream CLI concept deleted. Rejected: dream CLI is the actual Consolidator (3-step CoT, contradiction detection, durable merge), rebuilding it in Rust is 2-3 weeks.
- **API key in dream CLI args (`--api-key`)**: visible in `ps aux` / shell history. **Rejected: security risk, user vetoed**.
- **API key in dreamforge localStorage**: dreamforge settings.json is readable by app, harder to audit. Rejected: key in env is one-time setup, env-var pattern works in CI / scripted.
- **macOS Keychain for key** (`security add-generic-password`): most secure, but adds `security` CLI dependency + Tauri keychain plugin. Deferred to v0.2+ if user wants.

## Implementation pointer

- `src-tauri/src/commands/dreamvault.rs` (path resolution + spawn) — PR 10 adds base-url/model arg pass + env injection
- `src/lib/dreamCliPath.ts` (TS mirror of path resolution) — PR 10 adds base-url/model localStorage
- `src/components/DreamPanel.tsx` — PR 10 adds base-url/model settings fields, NOT key
- `src/components/DreamCliPathField.tsx` — PR 10 extends to base-url + model
- `DreamVault/Sources/dream/main.swift` — PR 10 adds 2 flags (`--base-url`, `--model`) + env var read for key
- `DreamVault/Sources/DreamEngine/LLMProvider.swift` L74 — already supports arbitrary baseURL (no change needed)
- `scripts/dream-cli-verify.sh` — PR 10 adds `--cloud <provider>` variant for testing
- Decision log §7-§9 (PR 2 4-tier resolution), PR 10 §25+
