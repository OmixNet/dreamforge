# PR 50 — Vault stats JSON contract (Swift CLI / Rust / Frontend)

> Design note (no code change yet) — locks the cross-language contract
> before the 3 code PRs that implement it. Status: **DRAFT, awaiting
> user sign-off before any implementation**.

## 0. Why this PR exists

PR 47 / 48 / 49 polished the empty editor (recent quick-picks, "Last
dream: X ago", color-coded health badge). The next natural product
polish is **"raw candidate / processed / archived" counts displayed in
the empty state** so the user can see at a glance how much work has
been done, how much is queued, and how much was archived.

The current frontend parses the text output of `dream status` (PR 48
`parseDreamStatus`) and reads the `Last dream: <ISO>` line. That works
for a single timestamp. But for **three integer counts** (raw
candidates / processed / archived), text parsing is fragile — the
text format is a debug aid, not a stable contract, and a future Swift
change like reordering lines or localizing the field name would
silently break the UI (PR 34 closed-loop data flow lesson).

Per user direction (2026-06-23), we will **not** bind the frontend to
the `.dream/ledger.json` file format. That couples the UI to
DreamVault's internal file layout and would break the moment the
ledger schema evolves. Instead we add a stable JSON contract:

- Swift dream CLI gains `--json` flag on `dream status`
- Rust Tauri command invokes the JSON path, parses, returns typed struct
- Frontend consumes the typed struct only, never reads `.dream/*` files

This document locks the contract before the 3 implementation PRs so
all sides can be implemented against the same source of truth.

## 1. Cross-language contract (LOCKED)

### 1.1 Command

```
dream status --json --vault <vault_path>
```

The `--json` flag is a **new subcommand flag** on the existing `status`
command. The text output path stays as the default (backwards compat —
debug tools, `dream status` in a terminal) and `--json` switches to
structured output. No new top-level subcommand — the existing `status`
is the right place (it's the "give me the snapshot of vault state"
entry point that already runs without LLM).

### 1.2 JSON shape (v0.6.x schemaVersion: 1)

```json
{
  "schemaVersion": 1,
  "vaultPath": "/Users/biomatrix/Desktop/APP/dreamforge-test-vault",
  "rawCandidatesCount": 5,
  "processedCount": 23,
  "archivedCount": 2,
  "lastReportPath": ".dream/reports/dream-report-2026-06-22-182157.md"
}
```

### 1.3 Field reference

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `schemaVersion` | u32 | yes | Bump on **breaking** changes to this shape. Non-breaking additions (new fields) are allowed without bump. |
| `vaultPath` | string | yes | Absolute path the command ran against. Echoed so the frontend can disambiguate when multiple vaults are open. |
| `rawCandidatesCount` | u32 | yes | Number of unprocessed `raw/*.md` files (frontmatter `processed: false` AND not in `processed.json`). 0 = "nothing to do". |
| `processedCount` | u32 | yes | Number of `ledger.memories` with `status == .durable`. Same as the existing text "durable:" line in §2 below. |
| `archivedCount` | u32 | yes | Number of `ledger.memories` with `status == .archived`. |
| `lastReportPath` | string \| null | yes | Relative path from vault root to the most recent `.dream/reports/dream-report-*.md`, or null if no reports exist. |

### 1.4 Stability rules (locked)

1. **schemaVersion: 1 is locked.** New fields can be added (non-breaking).
   Removing a field, renaming, or changing a field's type is breaking
   and requires schemaVersion bump.

   **Strict acceptance rule (locked, added 2026-06-23 per user
   sign-off)**: The Rust `dreamvault_status_json` command accepts
   **schemaVersion === 1 ONLY**. Any other version (0, 2, "1.0",
   missing, or null) MUST return a typed error (`Err("...")`) — the
   Rust side does NOT guess, default, or fall back. The frontend
   catches that typed error and falls back to the existing text parse
   (PR 48 `parseDreamStatus`). This is the inverse of "tolerant
   reader" — we want loud failure on contract drift so the consumer
   knows the Swift CLI is from a different version family, not
   silently parse the wrong shape. Tests pin this behavior.

2. **All counts are non-negative u32** (Rust `u32`, Swift `UInt32`,
   TS `number`). Negative is not a valid signal — corrupt ledger
   surfaces as an error from Swift CLI (non-zero exit), not as -1.
3. **Paths are always relative to vault root** (leading `./` or no
   prefix; not absolute). Forward-slash separators on all platforms.
4. **Missing fields = null** (Swift `nil` → JSON `null` → Rust
   `Option<T>` → TS `T | null`). Frontend checks each field before
   display, never assumes presence. **Exception**: `schemaVersion`,
   `vaultPath`, `rawCandidatesCount`, `processedCount`, `archivedCount`
   are REQUIRED and must be present (per §1.2). `lastReportPath`
   is the only optional field (null when no reports exist).
5. **Errors surface as Swift CLI non-zero exit + stderr text.** Rust
   surfaces stderr to the frontend via the existing error channel.
   We do NOT use JSON error envelopes — the existing text-error path
   is fine and adding a parallel channel doubles the surface area.

### 1.5 Field derivation (Swift side reference)

Each field maps to existing Swift CLI logic in `cmdStatus` (Sources/dream/CLI.swift:161):

| JSON field | Swift source |
|------------|--------------|
| `rawCandidatesCount` | `raw/*.md` count - `processed.json` set intersection (existing "raw/ 候选（未处理）" line, L166-181) |
| `processedCount` | `ledger.memories.filter { $0.status == .durable }.count` (existing "durable:" line, L186-190) |
| `archivedCount` | `ledger.memories.filter { $0.status == .archived }.count` (existing "archived:" line, L188-192) |
| `lastReportPath` | Most recent `.dream/reports/dream-report-*.md` by `creationDateKey` (existing "最近 dream-report:" line, L195-203) |

No new Swift code is needed to compute the values — we just emit them
in a different format. The text path stays as the default for
backwards compat.

## 2. Swift dream CLI change

**File**: `/Users/biomatrix/Desktop/APP/DreamVault/Sources/dream/CLI.swift`

**Diff scope** (estimated ~40 lines + 4 tests):

1. Add `parseArgs(args:)` to detect `--json` flag (returns `(jsonMode: Bool, vault: URL?)`)
2. In `cmdStatus`, branch on `jsonMode`:
   - `true`: build a `StatusReport` struct, serialize to JSON, print to stdout
   - `false`: existing text output (unchanged)
3. JSON serialization uses `JSONEncoder` with sorted keys (deterministic output for snapshot tests)
4. Exit code 0 on success, 1 on any error (existing behavior)

**Tests** (Swift):
- `StatusJSONTests.testEmitsValidJSONForFreshVault` — empty vault → all zeros, null lastReportPath
- `StatusJSONTests.testEmitsValidJSONAfterDreamRun` — vault with 1 dream run → processedCount 1, lastReportPath set
- `StatusJSONTests.testTextOutputUnchanged` — without `--json` flag, output matches the existing format byte-for-byte (backwards compat regression)
- `StatusJSONTests.testJSONSchemaVersionIsOne` — locks schemaVersion: 1 (bumped on breaking changes)

## 3. Rust Tauri command change

**File**: `/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/src/commands/dreamvault.rs`

**Diff scope** (estimated ~50 lines + 3 tests):

1. New typed struct:
   ```rust
   #[derive(Debug, Serialize, Deserialize)]
   #[serde(rename_all = "camelCase")]
   pub struct DreamVaultStatusReport {
       pub schema_version: u32,
       pub vault_path: String,
       pub raw_candidates_count: u32,
       pub processed_count: u32,
       pub archived_count: u32,
       pub last_report_path: Option<String>,
   }
   ```
2. New Tauri command `dreamvault_status_json` (parallel to existing `dreamvault_status`):
   - Calls `dream status --json` via existing 4-tier CLI path resolution
   - Parses stdout as JSON
   - Returns `Result<DreamVaultStatusReport, String>`
3. New helper `run_dreamvault_status_json(...)` — separate from `run_dreamvault_action` because the action type changes from `DreamVaultAction::Status` (text) to a new `DreamVaultAction::StatusJson`
4. Wire into `commands/mod.rs` invoke handler (1 line addition)
5. **Strict schemaVersion gate** (locked §1.4 rule 1): after parsing
   JSON, check `schema_version == 1`. If not, return
   `Err(format!("DreamVault stats report has schemaVersion={parsed.schema_version}, expected 1. Update both repos to compatible versions."))`. **Do NOT parse, default, or fall back** — the frontend will catch the typed error and switch to the existing text parse (PR 48). This makes contract drift loud instead of silent.

**Backwards compat in Rust**: if the dream binary doesn't support
`--json` yet (older build), `dream status --json` exits non-zero with
"unknown option" stderr. Rust surfaces the error to the frontend. The
existing `dreamvault_status` text command stays as the fallback for
users with older dream binaries — frontend can call EITHER depending
on schemaVersion support detection. The schemaVersion mismatch
error is structurally identical to the "no --json flag" error from
the frontend's perspective: both surface as Rust `Err`, both trigger
the same fallback to text parsing.

**Tests** (Rust):
- `dreamvault_status_json::tests::parses_valid_json_into_typed_struct` — round-trip test
- `dreamvault_status_json::tests::errors_on_missing_json_flag` — non-JSON binary returns clean error
- `dreamvault_status_json::tests::path_resolution_uses_existing_4_tier_fallback` — Settings arg → env → hard-coded path → PATH
- `dreamvault_status_json::tests::errors_on_schema_version_mismatch` — schemaVersion=0 / 2 / missing / null → typed `Err` with diagnostic message; **no fall-through to default values** (locked §1.4 rule 1)

## 4. Frontend change

**Files**:
- `src/lib/dreamCliStatus.ts` — new typed interface + replace text parser for the new fields
- `src/components/Editor.tsx` — new prop, counts line shows "5 candidates · 23 processed · 2 archived"
- `src/App.tsx` — new `useEffect` polls `dreamvault_status_json`, typed state
- `src/lib/locales/*.json` × 20 — 1 new i18n key `editor.workspace.countsWithProcessed` with 3 placeholders

**Diff scope** (estimated ~60 lines + 4 tests):

1. `parseDreamStatus` (PR 48) **stays** for the `lastDreamAt` field — text parsing is fine for that single timestamp
2. **New** `parseDreamStatusJson(stdout: string): DreamVaultStatusReport` — JSON parse, validated
3. New TS interface:
   ```ts
   export interface DreamVaultStatusReport {
     schemaVersion: number
     vaultPath: string
     rawCandidatesCount: number
     processedCount: number
     archivedCount: number
     lastReportPath: string | null
   }
   ```
4. `App.tsx` — new `useEffect` invokes `dreamvault_status_json` and stores the typed result. On error (old binary), falls back to the existing text parse + sets `vaultStatsJsonAvailable = false` for downstream UI
5. `Editor.tsx` — workspace counts line shows the new format: `{raw} candidates · {processed} processed · {archived} archived` (only when JSON is available, otherwise shows the existing format)
6. `computeVaultHealth` (PR 49) — unchanged for now; the new counts unlock future tuning (e.g., "stale = high candidates AND low processed") but the PR 49 thresholds are reasonable. Future PR can adjust.

**Tests** (TS):
- `dreamCliStatus.test.ts::parseDreamStatusJson:parsesValidJSONIntoTypedReport`
- `dreamCliStatus.test.ts::parseDreamStatusJson:throwsOnInvalidJSON` (frontend defensive)
- `Editor.test.tsx::PR 50: shows processed count next to candidates when stats are available`
- `Editor.test.tsx::PR 50: hides processed count when stats are not available (fallback to text-only counts)`

## 5. Backwards compat

| dream binary | Frontend path | Counts line |
|--------------|---------------|-------------|
| dream CLI ≥ v0.6.1 (supports `--json`) | `dreamvault_status_json` succeeds | `5 candidates · 23 processed · 2 archived` |
| dream CLI < v0.6.1 (no `--json`) | `dreamvault_status_json` errors → fall back to `dreamvault_status` text | `5 candidates` (existing format) |
| dream CLI not installed | Both commands error → empty state line hides | nothing (no-landing-page invariant) |

The fallback is automatic and silent — no error UI. Existing PR 48
text parsing handles the legacy path. Users with old dream binaries
see the same UI they see today.

## 6. Sequence of PRs (scope discipline)

Per user's "push before stacking" rule + closed-loop data flow
discipline, PR 50 is split into 3 separate PRs with separate verifies:

1. **PR 50a: Swift CLI `--json` flag** — DreamVault repo (separate)
   - Implementation in `Sources/dream/CLI.swift` + tests in `Tests/`
   - Verify: `swift test` in DreamVault + manual `dream status --json` smoke
   - Push to DreamVault main, then build dream CLI release binary

2. **PR 50b: Rust Tauri command + typed struct** — dreamforge
   - Implementation in `src-tauri/src/commands/dreamvault.rs` + tests
   - Verify: `cargo test --lib` + manual `dream status --json | dreamvault_status_json` smoke
   - Push to dreamforge main (independent of UI; UI is unchanged)

3. **PR 50c: Frontend typed consumption + UI display** — dreamforge
   - Implementation in `src/lib/dreamCliStatus.ts` + `Editor.tsx` + `App.tsx`
   - Verify: `pnpm vitest run` + GUI verify the new counts line
   - Push to dreamforge main

This sequence keeps each PR's "data flow contract" self-contained —
PR 50b can be verified end-to-end with a real dream binary + Rust
unit tests; PR 50c only needs the JSON shape to match (locked in
this design note, unchanged from 50b).

## 7. Out of scope (deferred to future PRs)

- **Last dream success/failure signal** — not in this JSON shape. The
  frontend currently reads the dream CLI status's `success` field via
  the existing text command. PR 46 already renders structured error
  UI when the last run failed. Adding `lastRunSucceeded: bool` is a
  future field (non-breaking addition; no schemaVersion bump needed).
- **Per-memory status breakdown** (durable / candidate / conflict
  counts) — not in this JSON shape. The frontend doesn't currently
  surface those numbers; the empty-state counts are enough for "at a
  glance" UX. Future field.
- **Contradict / pending-resolve count** — same as above, future field.
- **Vault health threshold tuning using `processedCount`** — future
  PR. PR 49 thresholds (5/15 candidates, 24h/7d dream age) are
  reasonable defaults. Once we have processedCount, the "is the
  pipeline actually moving?" signal can be added (e.g., processed
  rate < 1/week = stale). Out of scope for PR 50.

## 8. Decision log entry (will be added in PR 50c commit)

`docs/superpowers/plans/2026-06-16-dreamforge-decisions.md` will get
a new `### §45 PR 50: vault stats JSON contract` section summarizing
this design note + the 3 PRs + the fallback path.

## 9. Open questions (for user sign-off)

1. **Field naming**: `rawCandidatesCount` vs `unprocessedRawCount` vs
   `pendingRawCount`? Current proposal = `rawCandidatesCount` (matches
   the §42 606df99 doc-as-code "raw candidates" term). User preference?
2. **`lastReportPath` field**: relative to vault root? Yes (per
   §1.4 rule 3). But the existing text output prints the absolute path
   (e.g., `/Users/.../dream-report-...md`). User preference on
   relative vs absolute?
3. **PR 50a first**: should I start with the Swift CLI change
   (DreamVault repo) since the user mentioned it's a separate repo?
   Or do all 3 PRs in dreamforge and reference the dream CLI change
   in a doc-only PR? Cleanest is PR 50a in DreamVault, then 50b+50c
   in dreamforge. But the design note should land first (this doc).
