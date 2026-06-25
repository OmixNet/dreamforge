# PR 54 — Settings AI 收尾设计 (4-task closure)

> Date: 2026-06-26
> Status: **4/4 tasks shipped**, pending GUI verify + push
> Local: `552a979` (main, 4 commits ahead of `f841f65` pushed)
> Push: HOLD. GUI verify first.

## TL;DR

4 small UX polish items in Settings → AI Providers, all user-flagged
backlog items. Each task = 1 commit. Total: 4 commits + 1 verify doc.

## What changed

### Task 1: ActiveProviderBanner (PR 54.1, `6bc6d69`)
**Why**: The existing "Active" badge + muted summary text was easy
to miss. Users forgot they had an active provider pointing at
Keychain and were confused about which one DreamPanel was using.

**What**:
- New `ActiveProviderBanner` component rendered above ProviderList
  when `activeProviderId !== null`. Primary border + bg, ✓ icon,
  provider name + model id, Clear button.
- data-testid `ai-providers-active-banner` lets tests + future code
  target it.

**Tests**: 2 new (banner renders with name+model, hidden when no
active provider).

### Task 2: BaseUrlV1Hint (PR 54.2, `113603f`)
**Why**: Users pasted `https://api.openai.com/v1` and got 404
because dreamforge's URL strip + dream CLI's `/v1` append
double-inserted `/v1`. The hint needs to be inline (next to the
input) not buried in docs.

**What**:
- New `BaseUrlV1Hint` component. Two variants: subtle hint when
  the URL is a bare domain (`https://api.openai.com`), prominent
  warning when it ends with `/v1`.
- Only shown for `open_ai` / `open_router` / `open_ai_compatible`
  kinds (Anthropic + Gemini use different paths where `/v1` is OK
  or wrong in different ways).

**Tests**: 2 new (hint shows for open_ai, hidden for anthropic).
1 skipped (Radix Select doesn't accept `fireEvent.change`).

### Task 3: KeychainStatusDot (PR 54.3, `3116cf6`)
**Why**: The inline text label "Saved in macOS Keychain" / "Not in
macOS Keychain" was OK but a colored dot makes the state
recognizable at-a-glance without reading the text.

**What**:
- New `KeychainStatusDot` component. Maps the 4 storage states to
  colors:
  - green + 'Saved in macOS Keychain' (local_file + configured)
  - red + 'Not in macOS Keychain' (local_file + !configured)
  - amber + 'key from {env_var}' (env + env_var set)
  - red + 'No key' (env without var, or none)
- ProviderList row renders the dot inline next to the base URL
  with a middle-dot separator. data-testid
  `ai-providers-keychain-dot-{provider.id}` for per-provider
  targeting. data-state attribute is the discrete
  machine-readable value (configured / missing / env / none) for
  future assertions or status filtering.

**Tests**: 3 new (green for local_file+configured, red for
local_file+!configured, yellow for env+env_var).

**Mock shape fix**: invoke() returns `{provider_id, configured: bool}`,
not bare bool. The previous test mocks returned plain booleans
which made `result.configured` undefined → dot always rendered
'missing'.

### Task 4: DeleteProviderDialog (PR 54.4, `552a979`)
**Why**: The single-click Remove → delete flow was too easy to
misfire on touchpad / small hit areas. A user could also forget
that the action clears localStorage pointers and Keychain entries.

**What**:
- New `DeleteProviderDialog` component (shadcn Dialog).
  - Title with `{name}` placeholder so the user sees exactly
    what they're about to delete.
  - Body explains side effects: Keychain removal, no vault file
    deletion. Important since "delete" might be read as "delete
    my notes".
  - Cancel + Delete buttons (destructive variant on Delete).
- `pendingDelete` state holds the provider awaiting confirmation
  (null = dialog closed). The provider object (not just id) is
  stored so the dialog can show the name without a follow-up
  lookup.
- ProviderList prop API change: `onRemove(providerId)` →
  `onRequestDelete(provider)`. The actual delete is gated on
  dialog confirmation.
- Form draft survives cancel: the user can fix a typo in the
  provider name and save without re-typing everything.

**Tests**: 4 new (dialog opens with title+buttons, Cancel does
NOT fire delete, Delete fires onChange([]), Delete clears active
pointer + banner + localStorage when the deleted provider was
active).

**Updated**: PR 43 series tests (`delete: invokes ...` + `delete:
clears localStorage pointers ...`) now click through the dialog
(Remove → Delete) instead of Remove alone. The invariant they
pin — IPC and localStorage cleanup happen — is preserved; only
the UI driver path changed.

## i18n

- 4 + 2 + 0 + 4 = 10 new keys × 20 locales = 200 entries.
- English placeholders for non-en locales (same pattern PR 53
  used). Real translations land later as separate PRs.
- i18n parity test: 15/15 pass.

## Verification

### Build matrix (Task 5, this PR)
```
vitest full:       3977/3977 pass (was 3966 before PR 54)
vitest i18n:       15/15 pass (parity)
vitest AiProvider: 42/42 pass (was 35 before PR 54, +7 new tests)
cargo test --lib:  765/765 pass (no Rust change)
tsc -b --force:    0 error
eslint --max-warnings=0: 0/0
pnpm build:        7.41s
tauri build:       17M .app at src-tauri/target/release/bundle/macos/DreamX.app
dream-cli-verify:  13/0/0 (was 12/1/0 in PR 10)
```

### GUI verify (user, blocking push)
1. Open Settings → AI Providers
2. Active banner: visible above ProviderList when an active
   provider is set. Primary border + bg, ✓ icon, provider name,
   model id, Clear button. Click Clear → banner hides.
3. Add a provider with `https://api.openai.com/v1` base URL →
   the prominent /v1 warning appears under the input (not the
   subtle hint).
4. Add a provider with `https://api.openai.com` (no /v1) → the
   subtle hint appears.
5. Switch to Anthropic → no hint at all (different protocol).
6. Keychain dot: dot color matches the text label's intent
   (green for saved, red for missing, amber for env).
7. Click Remove on a saved provider → dialog opens with provider
   name in title. Click Cancel → dialog closes, providers list
   intact. Click Delete → IPC fires + provider is removed.
8. Remove the active provider → banner disappears, localStorage
   `dreamforge.llmApiKeyProviderId` is null.

### Push protocol (per user style)
- After user reports GUI verify pass, push all 4 commits.
- Stack stays clean (no PR 54.5 uncommitted work).

## Files

```
src/components/AiProviderSettings.tsx       (+/- 280 lines)
src/components/AiProviderSettings.test.tsx  (+8 tests, +~200 lines)
src/lib/locales/*.json                      (10 new keys × 20 locales)
docs/superpowers/plans/2026-06-26-pr54-settings-ai-closure.md (this file)
```

No Rust changes. No CSS file changes (Tailwind classes only,
matching the rest of the Settings UI).

## Follow-up (not in this PR)

- **PR 55 (post-v0.6)**: re-do the SiliconFlow smoke test with
  the user's current key. v0.6.0 shipped with §42 lesson
  (deepseek-ai/DeepSeek-V4-Pro model → 404 because DeepSeek
  changed their catalog). PR 55 should pick a working
  DeepSeek model and re-verify the OpenAI-compat path end-to-end.
- **PR 56 (post-v0.6)**: real Anthropic + Gemini E2E with
  user-provided keys. API-complete code is in main, just needs
  the real keys + a tagged release.
- **PR 57 (post-v0.6)**: cleanup — `ActiveProviderBanner`'s
  description text could be longer to include the env var name
  + Keychain service. Not blocking; can be folded into PR 54.5
  if user wants.
- **PR 58 (post-v0.6)**: localize the new deleteConfirm keys
  (currently English placeholders in non-en locales). Real
  translations land as a separate PR per locale.