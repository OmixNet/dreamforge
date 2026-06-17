# ADR-003: Vault model — single v0.1, multi v0.2

- Status: Accepted (v0.1.3, 2026-06-17)
- Deciders: dreamforge core
- Source: PR 5 user self-fix (vault_list.rs default), PR 9 (VaultMenu 删), §20

## Context

Tolaria supported multi-vault via StatusBar's `VaultMenu` — 6 vault list, 6 action callbacks, persisted to `com.biomatrix.dreamforge` APP_CONFIG_DIR.

v0.1 design: **slim shell** — only ship what the user actively needs. Multi-vault switching is a v0.1 nice-to-have, not a must-have. The v0.1 user is the dreamforge developer (you) testing the slim shell, not a multi-vault power user.

## Decision

- **v0.1 = single vault**, path hardcoded in `vault_list.rs` fallback
  - Default: `/Users/biomatrix/Desktop/APP/dreamforge-test-vault` (user self-fixed in PR 5)
- **Vault path = read-only badge** in StatusBar (no switcher)
- **Settings → Vault** (future) = full vault list + switch + add (deferred to v0.2)
- **v0.1 cannot switch vaults** without restart + `settings.json` edit (acceptable for v0.1)
- **v0.2 = multi-vault UI** — StatusBar vault badge becomes a dropdown, reuses VaultMenu pattern (but slim)

## Consequences

### Simplification

- StatusBar vault badge: read-only path, 0 callbacks (PR 9 cleanup)
- `vault_list.rs`: 1 fallback path, no list of paths
- Settings storage: 1 vault key (`path`) not 6 (`paths[]`)
- 4-tier path resolution (ADR-005) for `dream` binary: 1 vault (current) or N vaults (v0.2 — same resolution per vault)

### Lost capability in v0.1

- Cannot add new vault via UI
- Workaround: copy `dreamforge-test-vault` to new path, edit `settings.json` `vault.path` to point to it, restart

### Forward compatibility

- `vault_list.rs` data model is path-only, so v0.2 multi-vault just expands to `Vec<PathBuf>`, no migration needed
- Settings schema additive: v0.1 `{ "vaultPath": "..." }` → v0.2 `{ "vaults": ["...", "..."] }` (read old, fall back to new)

### Test setup

- `dreamforge-test-vault` is the canonical v0.1 vault, used by all 3973 vitest tests + cargo test 705 + `dream-cli-verify.sh`

## Alternatives Considered

- **Keep multi-vault in v0.1**: ~1 day extra work for `VaultMenu` in StatusBar. Rejected: not in slim scope, v0.2.
- **Settings-only vault selection** (no UI): user edits `settings.json` to switch. Rejected: very poor UX, even for v0.1.
- **No vault selection** (always current dir / `pwd`-based): breaks `dreamforge-test-vault` canonical setup, dream CLI 4-tier path resolution needs explicit vault path. Rejected.

## Implementation pointer

- `src-tauri/src/vault_list.rs` — `fn default_vault_path() -> PathBuf` (PR 5 user self-fix)
- `src/components/status-bar/VaultPathBadge.tsx` — read-only `<Text>` element (post-PR 9)
- `src/utils/slimSelection.ts` — `SlimFolderId` type for the 5 entries (Notes/Wiki/Memory/Raw/Archive)
- Decision log §20 (PR 9 VaultMenu 删)
