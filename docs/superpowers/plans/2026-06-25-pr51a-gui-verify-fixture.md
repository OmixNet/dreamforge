# PR 51a — Deterministic GUI verify fixture (v0.6.x release)

> Design note for the fixture + the 2 small code changes (1 Swift in
> DreamVault, 1 bash in dreamforge) that make the release `.app` GUI
> verify reproducible end-to-end.

## 0. Why this PR exists

PR 50b / 50c / 50c.1 shipped the typed `dreamvault_status_json` contract
end-to-end. The user GUI-verified the **Chrome dev UI** path (Vite +
mock-tauri) at the d5170a4 commit and confirmed the empty state shows
the PR 47 simple format fallback. The **release `.app`** path was
not verified in the same session because:

1. The Codex dev environment cannot run release `.app` GUI
   (`kLSNoExecutableErr` + AppKit abort on direct launch — env boundary,
   not a code issue).
2. The user's dev vault `dreamforge-test-vault` was drift-prone:
   `rawCandidatesCount` was 0 (all 5 raw files were in `processed.json`),
   the ledger had 9 candidate memories (0 durable, 0 archived), and the
   most recent report was 3 days old (stale health badge).

A real release GUI verify needs:
- A vault with **fixed** state (no drift across re-runs)
- The empty state to land on the expected `5 candidates · 7 processed ·
  1 archived` detailed format
- The health badge to land **green** (recent dream + ≤ 5 candidates)

This PR delivers all three.

## 1. What's in this PR

### 1.1 `scripts/gui-verify-fixture.sh` (dreamforge)

A new bash script at `scripts/gui-verify-fixture.sh` that creates (or
recreates) a dedicated fixture vault at a known path. The script is:

- **Deterministic**: every run produces identical content (modulo the
  report's creation time, which is set to "now - 30 min" so the health
  badge stays green).
- **Idempotent**: safe to re-run; wipes the vault root before recreating.
- **No side effects**: only touches `$VAULT_PATH` (default
  `~/Desktop/APP/dreamforge-gui-verify-vault`). Does NOT modify
  `dreamforge-test-vault`, `vaults.json`, or the dream CLI binary.
- **Self-validating**: after creation, runs `dream status --json` and
  `dream status` (text) and asserts both return the expected state.
  Exits non-zero on any drift.

The fixture state:

| | Value | Why |
|---|---|---|
| `raw/*.md` | 5 files, all `processed: false` | → `rawCandidatesCount = 5` |
| `.dream/processed.json` | `[]` (empty) | none of the 5 files are processed |
| `.dream/ledger.json` | 7 `durable` + 1 `archived` | → `processedCount = 7`, `archivedCount = 1` |
| `.dream/reports/dream-report-2026-06-25-090000.md` | 1 file, creation time = now - 30 min | → `lastReportPath` resolves, `lastDreamAt` < 24h, health = healthy |
| Expected JSON output | `{rawCandidatesCount: 5, processedCount: 7, archivedCount: 1, lastReportPath: ".dream/reports/dream-report-2026-06-25-090000.md", schemaVersion: 1}` | matches PR 50 wire format exactly |
| Expected text output | adds `Last dream: <ISO>` line (after `最近 dream-report: <path>`) | enables PR 48 `parseDreamStatus` → `lastDreamAt` is real |
| Expected health badge | `healthy` (green) | lastDream < 24h, candidates ≤ 5 |

### 1.2 `Last dream: <ISO>` line in dream status text output (DreamVault)

A 5-line Swift change in `Sources/dream/CLI.swift cmdStatus` to emit a
`Last dream: <ISO-8601-UTC>` line right after the existing
`最近 dream-report: <path>` line. This closes the gap that PR 48's
`parseDreamStatus` was supposed to consume (per the PR 48 comment in
`src/lib/dreamCliStatus.ts:14-23`, the dream CLI was "expected to"
print this line — it didn't yet).

The ISO-8601 format uses `ISO8601DateFormatter` with
`[.withInternetDateTime]` options → `2026-06-25T02:32:31Z` style
(matches the frontend regex `/^Last dream:\s*(\S+)\s*$/i` in
`src/lib/dreamCliStatus.ts:84`).

This is a Swift change in the **DreamVault** repo (separate git tree),
not the dreamforge repo. It is the pre-req for the dreamforge fixture
to land a green health badge.

### 1.3 Build artifact timeline

- The dream binary at `/Users/biomatrix/Desktop/APP/DreamVault/.build/release/dream`
  was rebuilt from HEAD to include the new `Last dream:` line. The
  dreamforge .app uses this binary at runtime via the 3rd-tier fallback
  in the dream CLI 4-tier resolution chain (Settings → env → hardcoded
  path → PATH).
- The dreamforge `.app` itself does **NOT** need to be rebuilt for PR 51a:
  the d5170a4 frontend source is already in the bundle from the PR 51
  build (the last `pnpm tauri build` ran against d5170a4). The Swift
  change affects only the dream binary, not the frontend bundle.

## 2. What's NOT in this PR

- **No new tags.** This is a verify-fixture PR, not a release.
- **No §45 decision log yet.** That comes after the user's GUI verify
  of the release `.app` lands green. Putting §45 ahead of verify would
  mix the fixture's mock expectations with the real release behavior,
  which the user explicitly warned against (2026-06-25).
- **No `Last dream:` Swift test.** The existing `StatusReportJSONTests`
  convention is to test the data builder (`buildStatusReport`) but NOT
  the text output format (see comment at line 142: "format is a
  test-time concern (stdout capture is awkward)"). Following convention.
  The fixture script's `dream status` validate step covers the
  end-to-end behavior in the integration tier.
- **No extension to the JSON wire format** (no `lastReportAt` field).
  The locked design note §1.4 rule 1 in PR 50 keeps the wire format
  stable. The `lastDreamAt` data flows through the text path (PR 48
  parse), which is the path the design already documented.
- **No `vaults.json` auto-registration.** The user can add the fixture
  vault to `vaults.json` manually (1 entry) or via the in-app "Add
  Vault" flow. We don't touch `vaults.json` from the script because
  it's user-specific state.

## 3. Usage

```bash
# 1. Create the fixture (idempotent, safe to re-run)
scripts/gui-verify-fixture.sh

# 2. Add to vaults.json (or use Settings → Vaults → Add Vault in the .app)
# Edit ~/Library/Application Support/com.biomatrix.dreamforge/vaults.json
# Add entry: { "label": "gui-verify", "path": "<vault path>", ... }

# 3. Launch the release .app
open src-tauri/target/release/bundle/macos/DreamX.app

# 4. Switch to the new vault → empty state should show:
#    en:    "5 candidates · 7 processed · 1 archived" + green health badge
#    zh-CN: "5 候选 · 7 已处理 · 1 已归档"
#    ja-JP: "候補 5 · 処理済み 7 · アーカイブ 1"
```

If any of these don't match, run the script again — the most common
failure is the report's creation time drifting older than 24h
(makes the badge amber instead of green). Re-running resets it.

## 4. Test counts

| | |
|---|---|
| dreamforge vitest | 3944/3944 (no change — fixture script is bash, no JS) |
| dreamforge cargo | 765/765 (no change — no Rust change) |
| dream CLI Swift tests | 753/753 (no change — no new Swift test, convention) |
| fixture script validate | both JSON + text paths pass on first run |
| idempotency check | re-run produces same state, both validates pass |

## 5. Files

| File | Change | Why |
|---|---|---|
| `scripts/gui-verify-fixture.sh` | new (~140 lines) | the fixture itself + validator |
| `docs/superpowers/plans/2026-06-25-pr51a-gui-verify-fixture.md` | new | this design note |
| `~/Desktop/APP/dreamforge-gui-verify-vault/` | runtime artifact (NOT in git) | the fixture data, recreated by the script |
| `Sources/dream/CLI.swift` (DreamVault repo) | +5 lines (`Last dream: <ISO>`) | closes the PR 48 parse gap |
| `~/Library/.../vaults.json` | +1 entry (user-applied, NOT in git) | registers the fixture in the .app |

## 6. Push order

Per "push before stacking" + the user's explicit guidance (2026-06-25),
this PR's commits are NOT pushed to `origin/main` until the user's
release GUI verify lands the expected format + green badge. The
expected push order is:

1. **DreamVault repo**: commit the `Last dream:` Swift change
   (separate git tree, separate push — not part of the dreamforge
   PR number sequence).
2. **dreamforge repo**: commit `scripts/gui-verify-fixture.sh` + this
   design note as PR 51a (one commit, on top of d5170a4).
3. **Hold** PR 50b / 50c / 50c.1 / 51a push until user confirms:
   - Release `.app` empty state shows `5 candidates · 7 processed · 1 archived`
   - Health badge is green
   - i18n renders correctly (en / zh-CN / ja-JP)
4. **Then** push all 4 dreamforge commits in order (50b → 50c → 50c.1 →
   51a) preserving the PR 50 series boundaries in the commit log.
5. **Then** write §45 decision log + extend the v0.6.0 post-ship
   addendum (the "now we've actually seen it work in release" record).

## 7. Future work (not in this PR)

- **PR 52**: DreamPanel consumes `dreamvault_status_json` so the
  detailed counts are visible without opening the empty editor.
- **PR 53**: Run Dream visualization (Running / Completed / No-op /
  Failed / Open latest report).
- **PR 54**: Settings AI small closure (active provider clarity, base
  URL /v1 rule, Keychain status, provider delete cleanup).
- **PR 37 / PR 38**: Real Anthropic / Gemini E2E (deferred to v0.6.1 /
  6.2 tags, requires user-provided keys).
- **Dream CLI test for the `Last dream:` line**: a `Process()`-based
  integration test in `ConflictResolutionTests` style. Out of scope
  for PR 51a (existing convention skips text-output tests).
