# PR 54.6 — LaunchServices / sandbox GUI launch notes

> Date: 2026-06-26
> Status: **Documented**
> Symptom: `open DreamX.app` can fail from Codex sandboxed shell with `kLSNoExecutableErr`
> Current conclusion: sandboxed LaunchServices calls are not reliable evidence that `DreamX.app` is broken

## TL;DR

The `.app` bundle is valid:

- `Contents/MacOS/dreamforge` exists and is executable.
- `codesign --verify --deep --strict` passes.
- `spctl --assess --type execute` accepts the bundle.
- `codesign -dvvv` reports the expected bundle id, executable, and ad-hoc signature.

The confusing part is `open` behavior from Codex shell:

```bash
open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
# sandboxed shell can return:
# kLSNoExecutableErr: The executable is missing

open /System/Applications/TextEdit.app
# same sandboxed shell can return the same kLSNoExecutableErr
```

That means the failing `open` result is not DreamX-specific. In this environment,
native GUI verification must launch the app with an escalated shell command:

```bash
open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
```

When run outside the sandbox, the same command starts DreamX normally.

## What happened during PR 54 verification

The first hypothesis was stale LaunchServices registration from the
legacy app-name -> DreamX rename. That was plausible because this machine had
old trash entries for `com.biomatrix.dreamforge`.

Further evidence disproved it as the primary root cause for this run:

- `open DreamX.app` failed in the sandbox.
- `open /System/Applications/TextEdit.app` failed in the same sandbox with the
  same `kLSNoExecutableErr`.
- `open TextEdit.app` succeeded when rerun with escalated permissions.
- `open DreamX.app` also succeeded when rerun with escalated permissions.

So stale LaunchServices entries may still be worth cleaning if present, but they
were not sufficient to explain this verification failure.

## Correct diagnostic sequence

Use this order before blaming the DreamX bundle:

```bash
# 1. Verify bundle structure.
plutil -p src-tauri/target/release/bundle/macos/DreamX.app/Contents/Info.plist
ls -la src-tauri/target/release/bundle/macos/DreamX.app/Contents/MacOS/dreamforge

# 2. Verify signing / assessment.
codesign --verify --deep --strict --verbose=4 src-tauri/target/release/bundle/macos/DreamX.app
spctl --assess --type execute --verbose=4 src-tauri/target/release/bundle/macos/DreamX.app

# 3. Sanity-check whether sandboxed LaunchServices is broken in general.
open /System/Applications/TextEdit.app

# 4. If TextEdit fails too, rerun app launch outside sandbox / with escalation.
open src-tauri/target/release/bundle/macos/DreamX.app
```

If TextEdit also fails with `kLSNoExecutableErr`, do not treat `open DreamX.app`
as a product failure.

## Optional stale-registration cleanup

If `open -b com.biomatrix.dreamforge` resolves to an old app path, inspect
LaunchServices registrations:

```bash
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister

"$LSREGISTER" -dump 2>&1 \
  | grep -B 30 'identifier:.*com\.biomatrix\.dreamforge' \
  | grep -E 'name:|path:'
```

Unregister stale paths only when the dump proves they exist:

```bash
"$LSREGISTER" -u /Users/biomatrix/.Trash/<legacy-app-name>.app
"$LSREGISTER" -u /Users/biomatrix/.Trash/DreamX.app
"$LSREGISTER" -f /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
```

This cleanup is environment maintenance, not a source-code fix.

## PR 54 native verification note

For PR 54 native GUI verification, use escalated `open` from Codex:

```bash
open /Users/biomatrix/Desktop/APP/dreamforge/src-tauri/target/release/bundle/macos/DreamX.app
```

Then use Computer Use against the running `DreamX` app.

## Files

- `docs/superpowers/plans/2026-06-26-pr54-launchservices-cleanup.md` (this file)
