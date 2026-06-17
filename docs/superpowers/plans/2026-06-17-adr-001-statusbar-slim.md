# ADR-001: StatusBar slim 4-essential

- Status: Accepted (v0.1.3, 2026-06-17)
- Deciders: dreamforge core
- Source: PR 6 (StatusBar cleanup), PR 9 (VaultMenu 删 + super-slim); decision log §14-§16, §20

## Context

Tolaria StatusBar was ~2700 lines (StatusBar.tsx 275 + StatusBarSections.tsx 569 + StatusBarBadges.tsx 862 + 5 helper files) with 30+ status indicators:

- Vault switching (`VaultMenu` — 6 vault list, 6 action callbacks)
- Remote / sync / history indicators
- Update available (Tauri updater)
- AI / Chat / Onboarding
- Feedback (PostHog)
- Docs / Zoom / Search
- Multi-vault selector
- Offline / VaultReloading

In v0.1 slim shell, the design principle is: **only ship what the user actively needs in the current view**. Status indicators are mostly noise; the user can check vault path / changes / commit state via other means (vault list, terminal, git log).

## Decision

Slim StatusBar to **4 essential items**:

1. **Vault path badge** (read-only — no switcher in v0.1, see ADR-003 Vault model)
2. **Changes indicator** (uncommitted change count from `git status --porcelain`)
3. **Commit button** (one-click local commit, no remote push)
4. **Theme toggle + Settings gear** (theme + settings entry)

Removed 26 indicators: offline / vault-reloading / remote / sync / history / update / ai / chat / onboarding / feedback / docs / zoom / search / multi-vault / VaultMenu switcher / etc.

Code: 2700 → 510 lines (-81%). 10 dead files trashed.

## Consequences

### Positive

- 81% code reduction: StatusBar.tsx 275→130, StatusBarSections.tsx 569→130, StatusBarBadges.tsx 862→250
- 10 dead files trashed (PR 6 + PR 9)
- StatusBar mount time halved (less React reconciliation)
- Less visual noise; user can read commit count without scanning 12 indicators

### Negative / Lost capabilities

- User must open Settings (4th essential) for vault switching, theme picker, remote/sync — still in Settings, just not in StatusBar
- No "at a glance" offline/vault-reloading status — user gets surprised if vault path is wrong
- v0.2 may add back 2-3 indicators (offline, vault-reloading) if user feedback shows need

### Forward compatibility

- `StatusBarSections.tsx` and `StatusBarBadges.tsx` keep `_vaults` / `_onSwitchVault` / `_isOffline` / `_isVaultReloading` props as underscore-prefixed no-ops (eslint `argsIgnorePattern: '^_'`) so v0.2 can wire them without changing props shape
- ESLint config has `argsIgnorePattern: '^_'` (PR 8 stub-化 no-op 函数 `_` 前缀)

## Alternatives Considered

- **Medium slim (8 indicators)**: keep vault switcher + offline + vault-reloading + remote status + changes + commit + theme + settings. Rejected: not much simpler than original, no clear win for v0.1.
- **Config-driven indicators** (opt-in via settings): settings-as-config adds Settings UI complexity, user wants a fixed layout. Rejected.
- **No StatusBar** (replace with menu bar items): macOS menu bar = less discoverable for changes/commit state, status bar is the right surface for git state. Rejected.

## Implementation pointer

- `src/components/StatusBar.tsx` 130 lines
- `src/components/status-bar/StatusBarSections.tsx` 130 lines
- `src/components/status-bar/StatusBarBadges.tsx` 250 lines
- `src/components/status-bar/VaultPathBadge.tsx` (read-only)
- Decision log §14-§16 (PR 6 cleanup), §20 (PR 9 super-slim)
