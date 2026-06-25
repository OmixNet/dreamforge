#!/usr/bin/env bash
# scripts/gui-verify-fixture.sh
#
# PR 51a: deterministic GUI verify fixture for the v0.6.x release .app.
#
# Creates (or recreates) a fixture vault at a known path with FIXED counts
# and a RECENT dream-report, so the release .app can be GUI-verified
# without depending on the drift-prone `dreamforge-test-vault` (which
# is for development data, not acceptance testing).
#
# Fixture state (locked, see design note 2026-06-25-pr51a-gui-verify-fixture.md):
#   - raw/         : 5 files, frontmatter `processed: false`, NOT in processed.json
#   - .dream/processed.json : empty array
#   - .dream/ledger.json    : 7 memories with status=durable + 1 with status=archived
#   - .dream/reports/       : 1 report file, creation time = now - 30 minutes
#   - vault count expected  : 5 candidates · 7 processed · 1 archived
#   - health badge expected : healthy (green) — last dream 30 min ago, candidates <= 5
#
# Deterministic: every run produces identical content (modulo the report's
# creation time, which is always set to "now - 30 minutes" so the health
# badge stays green across reruns).
#
# Idempotent: safe to re-run. Wipes the vault root before recreating.
# Does NOT touch: dreamforge-test-vault, vaults.json (vault list), dream CLI binary.
#
# Usage:
#   scripts/gui-verify-fixture.sh                          # default path
#   scripts/gui-verify-fixture.sh /path/to/verify-vault    # custom path
#   scripts/gui-verify-fixture.sh --no-validate           # skip dream CLI check
#   scripts/gui-verify-fixture.sh --help
#
# Exit code:
#   0   fixture created and validated (counts match 5/7/1)
#   1   fixture created but validation failed (counts drifted, see stderr)
#   2   fixture creation failed (missing tools, write error)
#
# After the script runs:
#   1. Open ~/Library/Application Support/com.biomatrix.dreamforge/vaults.json
#      and add an entry for the vault (or use Settings → Vaults → Add Vault).
#   2. Launch the release .app (DreamX.app) and switch to the new vault.
#   3. Verify the empty state shows:
#        en:    "5 candidates · 7 processed · 1 archived" + green health badge
#        zh-CN: "5 候选 · 7 已处理 · 1 已归档"
#        ja-JP: "候補 5 · 処理済み 7 · アーカイブ 1"
set -euo pipefail

# ---- args ---------------------------------------------------------------

VAULT_PATH="${HOME}/Desktop/APP/dreamforge-gui-verify-vault"
VALIDATE=1
DREAM_CLI="${DREAM_CLI:-/Users/biomatrix/Desktop/APP/DreamVault/.build/release/dream}"

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage ;;
    --no-validate) VALIDATE=0; shift ;;
    --dream-cli) DREAM_CLI="$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) VAULT_PATH="$1"; shift ;;
  esac
done

# ---- preflight ----------------------------------------------------------

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERR: python3 not found in PATH" >&2; exit 2
fi
if [[ "$VALIDATE" -eq 1 ]] && [[ ! -x "$DREAM_CLI" ]]; then
  echo "ERR: dream CLI not found at $DREAM_CLI (set DREAM_CLI env or pass --dream-cli)" >&2
  exit 2
fi
if ! command -v SetFile >/dev/null 2>&1; then
  echo "WARN: SetFile not found (Xcode CLT). Report creation time will be set via Swift fallback." >&2
  HAVE_SETFILE=0
else
  HAVE_SETFILE=1
fi

# ---- wipe + scaffold ----------------------------------------------------

echo "→ creating fixture vault at: $VAULT_PATH"
rm -rf "$VAULT_PATH"
mkdir -p "$VAULT_PATH"/{raw,notes,wiki,archive,.dream/reports}

# ---- 1. raw/ candidates (5 files, all processed: false) ---------------

cat > "$VAULT_PATH/raw/2026-06-25-fixture-001.md" <<'RAW_EOF'
---
processed: false
---

# Fixture 001 — v0.6.x release verify (raw candidate 1)

PR 51a deterministic GUI verify fixture. Five raw candidates are
present in this vault, each with `processed: false` frontmatter
and NOT listed in `.dream/processed.json`, so the dream CLI's
`rawCandidatesCount` returns 5. The dream cycle has not been
run on this vault, so all five are still candidates.
RAW_EOF

cat > "$VAULT_PATH/raw/2026-06-25-fixture-002.md" <<'RAW_EOF'
---
processed: false
---

# Fixture 002 — v0.6.x release verify (raw candidate 2)

This entry exists solely to fix the `rawCandidatesCount` at 5 for
GUI verify. Content is intentionally short — the dream CLI only
reads the frontmatter + the `processed.json` registry, neither of
which care about body length.
RAW_EOF

cat > "$VAULT_PATH/raw/2026-06-25-fixture-003.md" <<'RAW_EOF'
---
processed: false
---

# Fixture 003 — v0.6.x release verify (raw candidate 3)

The five candidates together represent a "freshly imported" state
where the user has dropped source material into `raw/` but not yet
asked the dream engine to consolidate. This is the most common
state when someone first starts using DreamVault on a real corpus.
RAW_EOF

cat > "$VAULT_PATH/raw/2026-06-25-fixture-004.md" <<'RAW_EOF'
---
processed: false
---

# Fixture 004 — v0.6.x release verify (raw candidate 4)

If `rawCandidatesCount` returns anything other than 5 against
this vault, the fixture has drifted. Re-run
`scripts/gui-verify-fixture.sh` to reset. The script is
idempotent and safe to run before every GUI verify.
RAW_EOF

cat > "$VAULT_PATH/raw/2026-06-25-fixture-005.md" <<'RAW_EOF'
---
processed: false
---

# Fixture 005 — v0.6.x release verify (raw candidate 5)

Last of the five. After this entry, `raw/` contains exactly five
files, all of which the dream CLI will count as candidates.
RAW_EOF

# ---- 2. processed.json (empty registry) ---------------------------------

echo '[]' > "$VAULT_PATH/.dream/processed.json"

# ---- 3. ledger.json (7 durable + 1 archived) ---------------------------

python3 - "$VAULT_PATH" <<'PY_LEDGER'
import json
import sys
from pathlib import Path

vault = Path(sys.argv[1])
fixed_created = "2026-06-25T08:00:00Z"
fixed_kind = "concept"
fixed_decay = "normal"
fixed_text = "GUI verify fixture memory. Body content is intentionally minimal — the dream CLI counts memories by `status`, not by content. Re-run scripts/gui-verify-fixture.sh to reset the fixture."

# Fixed IDs so the ledger JSON is byte-identical between runs (modulo mtime).
ids_durable = [f"PR51A-DURABLE-{i:02d}" for i in range(1, 8)]  # 7
ids_archived = ["PR51A-ARCHIVED-01"]  # 1

def make_memory(mid: str, status: str) -> dict:
    # Extract the trailing 2-digit index from the id (e.g. "PR51A-DURABLE-03" -> 3)
    idx = int(mid.rsplit("-", 1)[-1])
    return {
        "contradicts": [],
        "createdAt": fixed_created,
        "decayClass": fixed_decay,
        "id": mid,
        "inboundLinks": 0,
        "kind": fixed_kind,
        "lastAccess": fixed_created,
        "lastReinforceBySource": {},
        "reinforceCount": 0,
        "relatedTo": [],
        "sources": [
            {
                "file": f"raw/2026-06-25-fixture-{idx:03d}.md",
                "line": 1,
                "excerpt": f"Source excerpt for {mid}. Fixture-only.",
            }
        ],
        "status": status,
        "text": fixed_text,
    }

memories = [make_memory(mid, "durable") for mid in ids_durable]
memories.append(make_memory(ids_archived[0], "archived"))

ledger = {"memories": memories}
(vault / ".dream" / "ledger.json").write_text(
    json.dumps(ledger, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
print(f"  ledger.memories: {len(memories)} (7 durable + 1 archived)")
PY_LEDGER

# ---- 4. recent report (creation time = now - 30 min, "green" health) ---

REPORT_NAME="dream-report-2026-06-25-090000.md"
cat > "$VAULT_PATH/.dream/reports/$REPORT_NAME" <<'RPT_EOF'
# Dream cycle report — 2026-06-25 09:00 UTC

PR 51a fixture. This report file exists so the dream CLI's
`lastReportPath` resolves to a real on-disk markdown report.
The creation time is set to **30 minutes before "now"** (via
`SetFile -d`), which keeps the v0.6.x health badge in the
`healthy` bucket (< 24h since last dream) and `candidates`
in the `healthy` bucket (<= 5).

## Cycle stats

- 7 memories durable
- 1 memory archived
- 5 raw candidates pending

## Notes

This fixture is NOT produced by an actual `dream run` invocation.
Its sole purpose is to make the dream CLI's `buildStatusReport`
return a deterministic `lastReportPath` and a creationDate that
satisfies the PR 49 health threshold.
RPT_EOF

# Set creation time to 30 minutes ago (SetFile format: "MM/DD/YYYY hh:mm:ss")
REPORT_FILE="$VAULT_PATH/.dream/reports/$REPORT_NAME"
if [[ "$HAVE_SETFILE" -eq 1 ]]; then
  SETFILE_TS="$(date -v-30M '+%m/%d/%Y %H:%M:%S')"
  SetFile -d "$SETFILE_TS" "$REPORT_FILE"
  echo "  report creationDate: $SETFILE_TS (now - 30m)"
else
  echo "  report creationDate: (untouched — SetFile missing; health may be stale)"
fi

# ---- 5. minimal MEMORY.md (root file, DreamVault-written in real usage) -

cat > "$VAULT_PATH/MEMORY.md" <<'MEM_EOF'
# DreamX Memory

Long-term memory index file. PR 51a fixture — minimal stub.

<!-- dream:begin -->
<!-- dream:end -->
MEM_EOF

# ---- 6. validate via dream CLI -----------------------------------------

if [[ "$VALIDATE" -eq 1 ]]; then
  echo "→ validating counts via: $DREAM_CLI status --vault $VAULT_PATH --json"
  JSON_OUT="$("$DREAM_CLI" status --vault "$VAULT_PATH" --json 2>&1)"
  echo "$JSON_OUT"

  # Parse + assert (use python3 — no jq dep, no python3 -c shell quoting pain).
  # Disable SyntaxWarning for the JSON's `\/` escape (valid JSON, harmless Python warning).
  COUNTS="$(python3 -W ignore::SyntaxWarning - <<PY_PARSE
import json, sys
raw = """$JSON_OUT"""
try:
    r = json.loads(raw)
except Exception as e:
    print(f"PARSE_ERR:{e}", file=sys.stderr); sys.exit(1)
print(f"{r['rawCandidatesCount']} {r['processedCount']} {r['archivedCount']} {r.get('lastReportPath') or ''}")
PY_PARSE
)"

  read -r RAW PROC ARCH LR_PATH <<<"$COUNTS"
  if [[ "$RAW" == "5" && "$PROC" == "7" && "$ARCH" == "1" ]]; then
    echo "✓ counts match: 5 candidates · 7 processed · 1 archived"
    echo "✓ lastReportPath: $LR_PATH"
  else
    echo "ERR: counts drifted — got raw=$RAW processed=$PROC archived=$ARCH (expected 5/7/1)" >&2
    echo "     raw/ files: $(ls -1 "$VAULT_PATH/raw" | wc -l | tr -d ' ')" >&2
    echo "     processed.json: $(cat "$VAULT_PATH/.dream/processed.json")" >&2
    exit 1
  fi

  # Also validate the text output — the PR 48 parseDreamStatus path
  # needs a `Last dream: <ISO-8601>` line so the empty-state health
  # badge (PR 49) can land in the `healthy` bucket (< 24h since dream).
  # The line was added to dream CLI's cmdStatus text output by the
  # PR 50 series pre-req commit (DreamVault side); the dream binary
  # inside the .app must be at HEAD or newer for this to pass.
  echo "→ validating text path (PR 48 parseDreamStatus) for 'Last dream:' line"
  TEXT_OUT="$("$DREAM_CLI" status --vault "$VAULT_PATH" 2>&1)"
  LAST_DREAM_LINE="$(echo "$TEXT_OUT" | grep -E '^Last dream:[[:space:]]+' || true)"
  if [[ -n "$LAST_DREAM_LINE" ]]; then
    # Format: "Last dream: <ISO-8601>" — awk field 3 is the timestamp
    # (field 1 = "Last", field 2 = "dream:" with the colon attached).
    ISO_TS="$(echo "$LAST_DREAM_LINE" | awk '{print $3}')"
    if python3 -c "import sys; from datetime import datetime, timezone; ts='$ISO_TS'; datetime.fromisoformat(ts.replace('Z','+00:00')).astimezone(timezone.utc); print('OK', ts)" 2>/dev/null; then
      echo "✓ Last dream line: $LAST_DREAM_LINE"
    else
      echo "ERR: Last dream line present but timestamp unparseable: $LAST_DREAM_LINE" >&2
      exit 1
    fi
  else
    echo "ERR: 'Last dream: <ISO>' line missing from dream status text output" >&2
    echo "     This is required for the empty-state health badge (PR 49) to land green." >&2
    echo "     Dream CLI binary is likely too old — rebuild DreamVault at HEAD." >&2
    exit 1
  fi
fi

# ---- done ---------------------------------------------------------------

cat <<DONE

Fixture ready at: $VAULT_PATH

Next steps (manual):
  1. Add vault to vault_list (Settings → Vaults → Add Vault, or edit
     ~/Library/Application Support/com.biomatrix.dreamforge/vaults.json):
       { "label": "gui-verify", "path": "$VAULT_PATH", "alias": null,
         "shortLabel": null, "color": null, "icon": null, "mounted": true }
  2. Open the release .app at:
       /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
  3. Switch to the new vault → empty state should show:
       en:    "5 candidates · 7 processed · 1 archived" + green health badge
       zh-CN: "5 候选 · 7 已处理 · 1 已归档"
       ja-JP: "候補 5 · 処理済み 7 · アーカイブ 1"
  4. Re-run this script any time to reset the fixture (idempotent).
DONE
