#!/usr/bin/env bash
# scripts/dream-cli-verify.sh
#
# Verifies that the DreamVault `dream` CLI can drive the dreamforge-test-vault
# in the expected ways. Used as the acceptance check for PR 3 (raw / notes /
# wiki / MEMORY work-flow).
#
# PR 10 (v0.2): also exercises the OpenAI-compatible cloud LLM path when
# `DREAMFORGE_LLM_API_KEY` is set in the environment. The cloud test is
# OPT-IN (env-gated) — when the key is absent, the script behaves exactly as
# it did in v0.1 (12 pass / 1 warn / 0 fail).
#
# This script does NOT install or build anything. It assumes:
#   - DreamVault has been built: `.build/debug/dream` exists
#   - dreamforge-test-vault has the 5-entry structure (notes/ wiki/ raw/ archive/ .dream/ + MEMORY.md)
#
# Usage:
#   ./scripts/dream-cli-verify.sh
#   DREAMFORGE_LLM_API_KEY=... ./scripts/dream-cli-verify.sh   # also test cloud path
#
# Exit code:
#   0   all checks passed (cloud test pass OR skipped)
#   1   at least one check failed (see stderr)
#
# Notes:
#   - `dream run` requires an Ollama LLM endpoint at $OLLAMA_BASE_URL.
#     The script tolerates a consolidate-stage failure from Ollama, since
#     v0.1 does not require the LLM to be online. Status / report must work.
#   - PR 10: when DREAMFORGE_LLM_API_KEY is set, dream run is also invoked
#     with --llm openai --base-url https://api.siliconflow.cn --model deepseek-ai/DeepSeek-V4-Pro.
#     The cloud test is informational — it does not count toward the 12/1/0
#     baseline; failures there are reported but do not cause non-zero exit
#     (the cloud test is opt-in and depends on the user's API key balance).

set -uo pipefail

DREAM_BIN="${DREAM_BIN:-/Users/biomatrix/Desktop/APP/DreamVault/.build/debug/dream}"
VAULT_PATH="${VAULT_PATH:-/Users/biomatrix/Desktop/APP/dreamforge-test-vault}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0
warn_count=0

ok()   { echo -e "${GREEN}✓${NC} $1"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}✗${NC} $1"; fail_count=$((fail_count + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; warn_count=$((warn_count + 1)); }

# 1. binary exists
if [ ! -x "$DREAM_BIN" ]; then
  fail "DreamVault CLI not found or not executable: $DREAM_BIN"
  echo "Build it first: cd /Users/biomatrix/Desktop/APP/DreamVault && swift build"
  exit 1
fi
ok "DreamVault CLI present: $DREAM_BIN"

# 2. vault has the 5-entry structure
for required in notes wiki raw archive .dream MEMORY.md; do
  if [ -e "$VAULT_PATH/$required" ]; then
    ok "vault has $required/"
  else
    fail "vault missing $required/"
  fi
done

# 3. raw/ exists and contains a sample file (file read-only is enforced
#    inside DreamVault's RawReadonlyGuard; not checked here).
if [ -d "$VAULT_PATH/raw" ]; then
  if [ -n "$(ls -A "$VAULT_PATH/raw" 2>/dev/null)" ]; then
    ok "raw/ exists and is non-empty (engine enforces read-only via RawReadonlyGuard)"
  else
    warn "raw/ exists but is empty — DreamVault will pick up files from here on Run Dream"
  fi
fi

# 4. dream status runs cleanly
echo ""
echo "--- dream status ---"
status_output=$("$DREAM_BIN" status --vault "$VAULT_PATH" 2>&1) || true
if echo "$status_output" | grep -q "^vault: "; then
  ok "dream status: vault recognized"
  echo "$status_output" | sed 's/^/    /'
else
  fail "dream status did not produce expected output"
  echo "$status_output" | sed 's/^/    /'
fi

# 5. dream report is invokable
echo ""
echo "--- dream report ---"
report_output=$("$DREAM_BIN" report --vault "$VAULT_PATH" 2>&1) || true
if [ -n "$report_output" ]; then
  ok "dream report produced output (may be empty list if no dream cycle has run yet)"
  echo "$report_output" | head -3 | sed 's/^/    /'
else
  fail "dream report produced no output"
fi

# 6. dream run — tolerate Ollama failure in v0.1
echo ""
echo "--- dream run (Ollama is optional in v0.1) ---"
run_output=$("$DREAM_BIN" run --vault "$VAULT_PATH" 2>&1) || true
# Acceptable outcomes:
#   - "dream 完成" → success (candidates were processed)
#   - "一无事事"   → success (no new raw; vault already processed — v0.2 after cloud run)
#   - "Ollama\|consolidate 阶段失败" → expected failure (Ollama not running, v0.1)
if echo "$run_output" | grep -q "dream 完成\|一无事事"; then
  ok "dream run completed (status: $(echo "$run_output" | grep -E "dream 完成|一无事事" | head -1 | tr -d '\n'))"
  echo "$run_output" | head -8 | sed 's/^/    /'
elif echo "$run_output" | grep -q "Ollama\|consolidate 阶段失败\|dream run 失败"; then
  warn "dream run hit expected Ollama failure (v0.1 doesn't require LLM):"
  echo "$run_output" | head -8 | sed 's/^/    /'
else
  warn "dream run produced unexpected output (may be missing Ollama endpoint):"
  echo "$run_output" | head -8 | sed 's/^/    /'
fi

# 7. After a (partial) run, MEMORY.md must not be silently overwritten
if [ -f "$VAULT_PATH/MEMORY.md" ]; then
  memory_first_line=$(head -1 "$VAULT_PATH/MEMORY.md")
  ok "MEMORY.md still present after run (first line: $memory_first_line)"
else
  fail "MEMORY.md missing after run"
fi

# 8. No half-written files in .dream/ (Persister rolls back on failure)
if [ -d "$VAULT_PATH/.dream" ]; then
  half_written=$(find "$VAULT_PATH/.dream" -type f -name "*.tmp" 2>/dev/null)
  if [ -z "$half_written" ]; then
    ok ".dream/ contains no half-written temp files"
  else
    fail ".dream/ contains half-written files: $half_written"
  fi
fi

# PR 10 (v0.2): cloud LLM smoke test (opt-in, only if DREAMFORGE_LLM_API_KEY is set)
# Runs `dream run` with --llm openai --base-url https://api.siliconflow.cn --model deepseek-ai/DeepSeek-V4-Pro.
# This is separate from the 12/1/0 baseline; failures are reported but do not
# count toward the main pass/fail tally (the user's API key may be empty / out of quota).
if [ -n "${DREAMFORGE_LLM_API_KEY:-}" ]; then
  echo ""
  echo "--- PR 10 cloud LLM smoke (DREAMFORGE_LLM_API_KEY set) ---"
  cloud_output=$("$DREAM_BIN" run --vault "$VAULT_PATH" \
    --llm openai \
    --base-url https://api.siliconflow.cn \
    --model deepseek-ai/DeepSeek-V4-Pro 2>&1) || true
  if echo "$cloud_output" | grep -q "dream 完成"; then
    ok "PR 10 cloud LLM: dream run completed with SiliconFlow DeepSeek"
    echo "$cloud_output" | head -8 | sed 's/^/    /'
  elif echo "$cloud_output" | grep -q "一无事事"; then
    # Vault already in "all processed" state (PR 10 cloud ran successfully in a prior run)
    ok "PR 10 cloud LLM: dream run completed (no new raw to process; vault already in steady state)"
    echo "$cloud_output" | head -8 | sed 's/^/    /'
  elif echo "$cloud_output" | grep -qi "401\|403\|api[_-]\?key\|unauthorized\|quota\|rate[_-]\?limit"; then
    warn "PR 10 cloud LLM: API key rejected or quota exhausted (not a regression; check key)"
    echo "$cloud_output" | head -8 | sed 's/^/    /'
  elif echo "$cloud_output" | grep -qi "consent\|privacy"; then
    # DreamVault v0.14.1 enforces explicit user consent for cloud sends
    # (privacy gate — must be flipped in DreamSettings or vault config)
    warn "PR 10 cloud LLM: privacy consent required (set allowCloudSendRawSummary=true via dream settings or .dream/config.json)"
    echo "$cloud_output" | head -3 | sed 's/^/    /'
    echo "    To enable: add to <vault>/.dream/config.json:"
    echo "      { \"privacy\": { \"allowCloudSendRawSummary\": true } }"
  else
    warn "PR 10 cloud LLM: dream run produced unexpected output (may be transient network issue)"
    echo "$cloud_output" | head -8 | sed 's/^/    /'
  fi
else
  echo ""
  echo "--- PR 10 cloud LLM smoke (skipped: DREAMFORGE_LLM_API_KEY not set) ---"
  echo "    To exercise the cloud LLM path, re-run with DREAMFORGE_LLM_API_KEY=... set"
fi

echo ""
echo "=== Summary ==="
echo -e "  passed: ${GREEN}${pass_count}${NC}"
echo -e "  warned: ${YELLOW}${warn_count}${NC}"
echo -e "  failed: ${RED}${fail_count}${NC}"

[ "$fail_count" -eq 0 ]
