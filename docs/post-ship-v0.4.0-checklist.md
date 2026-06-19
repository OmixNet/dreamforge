# v0.4.0 post-ship checklist

**Tag:** `v0.4.0` (deref `674969e`)
**Shipped:** 2026-06-19
**Strategy:** Observe, don't ship. Keep `dreamforge` compatibility layer for
one more version cycle.

---

## Day-1 user soak (target: ≥ 1 day real use)

Install: `open src-tauri/target/release/bundle/macos/DreamX.app`

### 1. Real-use observation
- [ ] Open existing vault (no new data, see if everything loads)
- [ ] Write / edit / save a note in `notes/`
- [ ] Open `wiki/` + `raw/` + `MEMORY.md` (raw should be read-only)
- [ ] Run dream (`Run Dream` button in DreamPanel) — does it
      consolidate / persist / generate `MEMORY.md` updates?
- [ ] Open Settings — check all 9 sections render and save
- [ ] Change theme + language — do they persist across restart?
- [ ] Quit + relaunch — does state (vault, theme, lang, etc.) restore?

### 2. DreamForge / Tolaria residue sweep
While using, watch for visible references to the old brand. Likely places:
- [ ] App menu (macOS menu bar) — `DreamX` only?
- [ ] About panel (DreamX > About DreamX)
- [ ] First-run / permission dialogs (NSLocalNetworkUsageDescription)
- [ ] Crash reports / log files (check `~/Library/Logs/DreamForge/...`
      vs `~/Library/Logs/DreamX/...`)
- [ ] Activity Monitor / Dock tooltip
- [ ] `pgrep` / `ps` shows process name
- [ ] Console.app — search for "DreamForge" in last 1h
- [ ] Any system notification from the app
- [ ] File > Open Recent menu (recent vault paths)
- [ ] Help > Documentation (if present, where does it point?)

**Where to look for the process / config dir** (compat layer, expect this to be `dreamforge`):
```bash
# Process
pgrep -lf dreamforge      # should match the binary
pgrep -lf DreamX          # should match (window title)

# Config dir
ls -la ~/Library/Application\ Support/com.biomatrix.dreamforge/
ls -la ~/Library/Logs/com.biomatrix.dreamforge/

# Settings file content (must be valid JSON)
cat ~/Library/Application\ Support/com.biomatrix.dreamforge/settings.json | python3 -m json.tool
```

**Acceptable** (compat layer, should stay `dreamforge`):
- bundle id, config dir, env var names, localStorage keys, file token

**NOT acceptable** (rebrand miss):
- window title, menu items, dialog text, About panel, notification text,
  error message that mentions "DreamForge" or "Tolaria"

### 3. Settings export / import round-trip
- [ ] Open Settings → Data
- [ ] Click "Export settings…" — save dialog opens
      with default filename `dreamforge-settings-{YYYY-MM-DD}.json`
- [ ] Open the file — verify envelope shape:
      ```json
      {
        "version": 1,
        "kind": "dreamforge-settings",
        "exported_at": "2026-06-19T...",
        "app_version": "0.4.0",
        "settings": { ...17 fields... }
      }
      ```
- [ ] Change 1-2 settings (e.g. theme) and save
- [ ] Click "Import settings…" — pick the exported file
- [ ] Verify: app reloads, settings restored to **exported** state (not current)
- [ ] Verify: import shows success message with path
- [ ] Negative test: import a non-JSON file → should show error
      "Invalid settings file: ..."
- [ ] Negative test: import a JSON file with wrong `kind` → error
- [ ] Negative test: import a JSON file with future `version: 99` → error

---

## Decision matrix (after Day-1)

| If you observe... | Then ship... |
| --- | --- |
| ≥ 1 visible `DreamForge` / `Tolaria` residue in UI / dialogs / notifications | **v0.4.1** — small rebrand cleanup PR (likely 1-2 files, similar shape to PR 21) |
| Settings export/import round-trip fails or produces wrong state | **v0.4.1** — fix export/import regression |
| Settings export/import works, no visible residue, but you want a few small polish items | **v0.4.1** — accumulate small fixes |
| All clean, no regressions, ready for next milestone | **v0.5.0** — multi-provider LLM (Anthropic + Gemini + OpenRouter) |
| You want to live with v0.4.0 for a week first | Wait — re-check at +7 days |

## Things to NOT do in v0.4.x

- Do NOT touch the `dreamforge` compatibility layer yet (bundle id,
  config dir, env vars, localStorage, file token, URL param). One more
  version cycle.
- Do NOT bump dependencies for "while we're here" reasons.
- Do NOT auto-merge any of the above PRs.

## Record findings

When you finish, append a one-paragraph summary at the bottom of this
file with what you observed (or `nothing to report` if clean), and link
any follow-up issue / PR.

```
<!-- 2026-06-XX observation summary -->
```
