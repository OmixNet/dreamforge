# PR 54.6 — LaunchServices stale-registration cleanup (rebrand leftover)

> Date: 2026-06-26
> Status: **Shipped & applied locally** (one-time cleanup), no code changes
> Symptom: `open DreamX.app` fails with `kLSNoExecutableErr: The executable is missing`
> Root cause: stale LaunchServices registrations for trashed `.app` bundles

## TL;DR

The .app bundle is fine. `Contents/MacOS/dreamforge` is present and
executable (16M, rwxr-xr-x). `codesign -dvvv` reports adhoc-signed,
correct bundle ID. **But** LaunchServices retained a stale
registration for an old `.app` bundle at
`/Users/biomatrix/.Trash/DreamForge.app` (from the v0.1 → v0.6
rebrand, PR 17-19 era, when `DreamForge.app` was renamed to
`DreamX.app`). When `open` resolves `com.biomatrix.dreamforge`, it
encounters the stale registration first, can't find the executable
at the trashed path, and reports `kLSNoExecutableErr`.

The same issue affected 4 stale entries on this machine:
- `/Users/biomatrix/.Trash/DreamForge.app` (rebrand leftover, v0.1)
- `/Users/biomatrix/.Trash/DreamX.app` (v0.6.0 release build)
- `/Users/biomatrix/.Trash/DreamX 06.53.02.app` (timestamped build)
- `/Users/biomatrix/.Trash/DreamX 07.04.25.app` (timestamped build)
- `/private/tmp/DreamX.app` (build copied to /tmp for some test)

After cleanup, only one registration remains:
`/Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app`.

## Why it happened (lesson)

macOS LaunchServices keeps registrations for every .app bundle that
has ever been opened or scanned. When the .app is moved to Trash or
deleted, the registration stays (with a `trash` flag) until explicitly
removed via `lsregister -u`. The bundle ID is the lookup key, not the
file path — so changing the .app name doesn't invalidate the old
registration.

Every `pnpm tauri build` produces a new .app, and if a previous .app
was moved to Trash without `lsregister -u`, the stale registration
survives and can cause `kLSNoExecutableErr` on subsequent `open` calls.

## How to diagnose

```bash
# 1. Try open the .app — note the error
open /path/to/DreamX.app
# kLSNoExecutableErr: The executable is missing

# 2. Verify the executable IS there
ls -la /path/to/DreamX.app/Contents/MacOS/dreamforge
# -rwxr-xr-x  1 user  staff  16M  /path/to/DreamX.app/Contents/MacOS/dreamforge

# 3. Dump all registrations for the bundle ID
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump 2>&1 \
  | grep -B 30 'identifier:.*com\.biomatrix\.dreamforge' \
  | grep -E 'name:|path:'
```

If multiple `path:` lines show up, you have stale registrations.
The currently-correct one is the one matching the build you want
to run.

## How to fix

One-time cleanup. For each stale path:

```bash
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister

"$LSREGISTER" -u /Users/biomatrix/.Trash/DreamForge.app
"$LSREGISTER" -u /Users/biomatrix/.Trash/DreamX.app
"$LSREGISTER" -u /private/tmp/DreamX.app
# etc.

# Then physically move the file to Trash (recoverable):
mavis-trash /Users/biomatrix/.Trash/DreamForge.app  # already in Trash, just empty
mavis-trash /tmp/DreamX.app
```

After cleanup, `open` should succeed:

```bash
open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
# exit=0, process starts
ps -ef | grep DreamX | grep -v grep
# .../DreamX.app/Contents/MacOS/dreamforge
```

## Nuclear option (last resort)

If multiple stale entries persist or `lsregister -u` doesn't work:

```bash
# Wipe ALL user-domain LaunchServices registrations and rebuild
"$LSREGISTER" -kill -r -domain user -domain local
# Then re-scan known app locations
"$LSREGISTER" -f /Applications
"$LSREGISTER" -f /Users/biomatrix/Applications
```

This is heavy — every app registration in your user domain gets
rebuilt from scratch. macOS will spend a few seconds re-scanning.
Avoid unless `-u` per path doesn't resolve the issue.

## Prevention (next time)

When trashing an old `.app`, ALWAYS run `lsregister -u` first:

```bash
"$LSREGISTER" -u /path/to/old/OldName.app
mavis-trash /path/to/old/OldName.app
```

This is the same pattern as `git rm` before deleting a file — leave
the registry clean. For dreamforge specifically: the rebrand
(DreamForge → DreamX) is the only major one so far; subsequent
version-bump rebuilds shouldn't add new bundle IDs.

## Verification (applied 2026-06-26 07:31 local)

```
$ open src-tauri/target/release/bundle/macos/DreamX.app
exit=0

$ ps -ef | grep dreamforge | grep -v grep
501 40572  1  0  7:31AM  ??  0:00.43  .../DreamX.app/Contents/MacOS/dreamforge

$ "$LSREGISTER" -dump | grep -B 30 'identifier:.*com\.biomatrix\.dreamforge' | grep path:
path: /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
# (only one entry now — no stale)
```

## What this PR does NOT change

- No source code changes. PR 54 series (4 tasks + 1 plan doc) is
  unchanged.
- No Rust / TS / config changes.
- No new dependencies.
- The .app build itself is correct.

This is purely an environment-state cleanup + future-prevention
documentation. Future engineers hitting the same `kLSNoExecutableErr`
should consult this doc before assuming the .app is broken.

## Files

- `docs/superpowers/plans/2026-06-26-pr54-launchservices-cleanup.md` (this file)

No code touched. Pre-push to origin will be folded into the same
push as PR 54.1-54.5.

## See also

- macos-toolchain-gotchas.md (general macOS toolchain trivia)
- v0.6.0-ship-2026-06-22.md (rebrand history, PR 17-19)
- 2026-06-26-pr54-settings-ai-closure.md (PR 54 main plan)