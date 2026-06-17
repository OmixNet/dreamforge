import { useCallback, useState } from 'react'
import { readDreamCliPath, writeDreamCliPath } from '../lib/dreamCliPath'

interface DreamCliPathFieldProps {
  testId?: string
}

/**
 * Settings field for the user-configured path to the DreamVault `dream` CLI.
 * Persists to `localStorage` (the Rust side reads the value from the function
 * argument at invoke time, not from a store, so this is intentionally a
 * one-way localStorage write — no Settings draft plumbing required).
 */
export function DreamCliPathField({ testId = 'settings-dream-cli-path' }: DreamCliPathFieldProps) {
  // Lazy init: read localStorage once at mount (fix eslint react-hooks/set-state-in-effect)
  const [value, setValue] = useState(() => readDreamCliPath())

  const onChange = useCallback((next: string) => {
    setValue(next)
    writeDreamCliPath(next)
  }, [])

  const onClear = useCallback(() => {
    setValue('')
    writeDreamCliPath('')
  }, [])

  return (
    <div className="space-y-2">
      <label htmlFor={`${testId}-input`} className="text-sm font-medium text-foreground">
        Dream CLI path
      </label>
      <p className="text-xs text-muted-foreground">
        Absolute path to the DreamVault <code>dream</code> binary. Leave empty to use
        the <code>DREAMFORGE_DREAM_CLI</code> env var, local DreamVault build fallback,
        or <code>dream</code> on <code>PATH</code>.
      </p>
      <div className="flex items-center gap-2">
        <input
          id={`${testId}-input`}
          data-testid={testId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/path/to/dream"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
