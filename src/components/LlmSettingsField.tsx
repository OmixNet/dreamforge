import { useCallback, useState } from 'react'
import { readLlmBaseUrl, writeLlmBaseUrl, readLlmModel, writeLlmModel } from '../lib/dreamCliPath'

interface LlmSettingsFieldProps {
  testId?: string
}

/**
 * PR 10 (v0.2): Settings fields for the LLM provider (OpenAI-compatible / Ollama).
 *
 * - Base URL: e.g. `https://api.siliconflow.cn/v1` (user may include `/v1`; dreamforge Rust strips it
 *   before passing to dream CLI, since OllamaProvider auto-appends `/v1/chat/completions`)
 * - Model: e.g. `deepseek-ai/DeepSeek-V4-Pro` (SiliconFlow) / `qwen2.5:0.5b` (Ollama) / `llama3.1` (Ollama default)
 *
 * **API key is NOT in this UI** — set `DREAMFORGE_LLM_API_KEY` in your shell env.
 * The key is injected into the dream subprocess via `Command::env()` and never appears in
 * `ps aux` or in dream CLI args. The dream CLI prefers the env var over the macOS Keychain.
 */
export function LlmSettingsField({ testId = 'settings-llm' }: LlmSettingsFieldProps) {
  // PR 10 defaults: pre-fill with SiliconFlow DeepSeek V4-Pro (user's chosen provider).
  // User can change to any OpenAI-compatible provider (Anthropic / OpenAI / Ollama / etc.)
  // by editing the fields. Click "Clear" to reset to empty (then dream CLI uses its own default).
  const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1'
  const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4-Pro'

  // Lazy init: read localStorage once at mount, fall back to PR 10 defaults (fix eslint react-hooks/set-state-in-effect)
  const [baseUrl, setBaseUrl] = useState(() => readLlmBaseUrl() || DEFAULT_BASE_URL)
  const [model, setModel] = useState(() => readLlmModel() || DEFAULT_MODEL)

  const onChangeBaseUrl = useCallback((next: string) => {
    setBaseUrl(next)
    writeLlmBaseUrl(next)
  }, [])

  const onChangeModel = useCallback((next: string) => {
    setModel(next)
    writeLlmModel(next)
  }, [])

  const onClear = useCallback(() => {
    setBaseUrl('')
    setModel('')
    writeLlmBaseUrl('')
    writeLlmModel('')
  }, [])

  return (
    <div className="space-y-2" data-testid={testId}>
      <label
        htmlFor={`${testId}-base-url`}
        className="text-sm font-medium text-foreground"
      >
        LLM Base URL
      </label>
      <p className="text-xs text-muted-foreground">
        OpenAI-compatible endpoint. Leave empty to use dream CLI default
        (<code>http://127.0.0.1:11434</code> for local Ollama). The <code>/v1</code> suffix is
        optional — dreamforge will strip it before passing to the dream CLI.
      </p>
      <input
        id={`${testId}-base-url`}
        data-testid={`${testId}-base-url`}
        type="text"
        value={baseUrl}
        onChange={(e) => onChangeBaseUrl(e.target.value)}
        placeholder="https://api.siliconflow.cn/v1"
        className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <label
        htmlFor={`${testId}-model`}
        className="text-sm font-medium text-foreground"
      >
        LLM Model
      </label>
      <p className="text-xs text-muted-foreground">
        Model name. Examples: <code>deepseek-ai/DeepSeek-V4-Pro</code> (SiliconFlow),
        <code>qwen2.5:0.5b</code> (Ollama), <code>llama3.1</code> (Ollama default).
      </p>
      <input
        id={`${testId}-model`}
        data-testid={`${testId}-model`}
        type="text"
        value={model}
        onChange={(e) => onChangeModel(e.target.value)}
        placeholder="deepseek-ai/DeepSeek-V4-Pro"
        className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Clear
        </button>
        <span className="text-xs text-muted-foreground">
          API key: set <code>DREAMFORGE_LLM_API_KEY</code> in your shell env (never stored in dreamforge).
        </span>
      </div>
    </div>
  )
}
