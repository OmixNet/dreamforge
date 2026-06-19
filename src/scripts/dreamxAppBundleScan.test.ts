import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// PR 22: macOS app bundle hygiene guard.
// Asserts the built DreamX.app:
//   1. Passes `codesign --verify --deep --strict` (ad-hoc signed, no
//      resource/Info.plist mismatches that block Gatekeeper / distribution).
//   2. CFBundleDisplayName = DreamX (visible in Dock, About panel,
//      system notifications).
//   3. CFBundleIdentifier = com.biomatrix.dreamforge (compat layer kept).
//   4. Info.plist has no "DreamForge" or "Tolaria" in user-visible strings.
//   5. JS bundle (the actual i18n surface) has many more "DreamX" than
//      "DreamForge" mentions. The Rust binary intentionally contains
//      "Tolaria" in symbol paths, the git author identity, and the
//      AGENTS.md template — all compat-layer / non-user-visible. We
//      therefore skip the Rust binary string scan.
//
// The test scans the freshly built bundle under
// src-tauri/target/release/bundle/macos/DreamX.app. If the bundle
// doesn't exist (e.g. test runs before `pnpm tauri build`), every
// check is skipped so the test doesn't break the regular vitest cycle.

const BUILT_APP =
  'src-tauri/target/release/bundle/macos/DreamX.app'
const DIST_DIR = 'dist'

function codesignVerify(appPath: string): { ok: boolean; stderr: string } {
  const result = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    encoding: 'utf8',
  })
  return { ok: result.status === 0, stderr: result.stderr }
}

function codesignInfo(appPath: string): string {
  // `codesign -dv` writes to stderr, not stdout. We need to capture
  // both. execSync throws on non-zero exit; codesign exits 0 here but
  // Tauri may have signed with future options that change behavior.
  try {
    const result = spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' })
    return (result.stdout + result.stderr).trim()
  } catch {
    return ''
  }
}

function infoPlistGet(appPath: string, key: string): string | null {
  const result = spawnSync('/usr/libexec/PlistBuddy', [
    '-c', `Print :${key}`, `${appPath}/Contents/Info.plist`,
  ], { encoding: 'utf8' })
  if (result.status !== 0) return null
  return result.stdout.trim()
}

function findMainJsBundle(distDir: string): string | null {
  if (!existsSync(distDir)) return null
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) return null
  const files = readdirSync(assetsDir)
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => join(assetsDir, f))
  if (files.length === 0) return null
  // Pick the largest (main app bundle, not a lazy chunk)
  return files.sort((a, b) => readFileSyncSync(a).length - readFileSyncSync(b).length).at(-1) ?? null
}

function readFileSyncSync(path: string): Buffer {
  return readFileSync(path)
}

function countInFile(path: string, needle: string): number {
  if (!existsSync(path)) return 0
  const buf = readFileSync(path, 'utf8')
  return buf.split(needle).length - 1
}

describe('DreamX.app bundle hygiene (codesign + rebrand guard)', () => {
  describe('when DreamX.app is built', () => {
    beforeAll(() => {
      if (!existsSync(BUILT_APP)) {
        // Skip rather than fail. The .app is produced by
        // `pnpm tauri build` (~27s) and is too heavy to build on every
        // vitest cycle. Run this test in CI after a release build.
      }
    })

    afterAll(() => {
      // codesign is read-only; nothing to clean up.
    })

    it('passes codesign --verify --deep --strict', () => {
      if (!existsSync(BUILT_APP)) return
      const { ok, stderr } = codesignVerify(BUILT_APP)
      expect(ok, `codesign --verify failed:\n${stderr}`).toBe(true)
    })

    it('signs with adhoc identity and binds Info.plist', () => {
      if (!existsSync(BUILT_APP)) return
      const info = codesignInfo(BUILT_APP)
      // Personal-build signature: no Developer ID. When the user joins
      // the Apple Developer Program, this assertion will need updating.
      expect(info).toContain('Signature=adhoc')
      // PR 22 requirement: Info.plist must be bound to the signature.
      // The previous `Info.plist=not bound` state (PR 20 and earlier)
      // caused Gatekeeper / `spctl --assess` to fail.
      expect(info).not.toContain('Info.plist=not bound')
      // The PR 22 fix uses `signingIdentity: "-"` in tauri.conf.json
      // which makes Tauri ad-hoc sign the bundle with sealed resources.
      expect(info).toMatch(/Sealed Resources version=/u)
    })

    it('CFBundleDisplayName is DreamX (Dock + About panel + notifications)', () => {
      if (!existsSync(BUILT_APP)) return
      expect(infoPlistGet(BUILT_APP, 'CFBundleDisplayName')).toBe('DreamX')
      expect(infoPlistGet(BUILT_APP, 'CFBundleName')).toBe('DreamX')
    })

    it('CFBundleIdentifier stays com.biomatrix.dreamforge (compat layer)', () => {
      if (!existsSync(BUILT_APP)) return
      expect(infoPlistGet(BUILT_APP, 'CFBundleIdentifier')).toBe('com.biomatrix.dreamforge')
    })

    it('Info.plist has no DreamForge or Tolaria in user-visible strings', () => {
      if (!existsSync(BUILT_APP)) return
      const plistPath = `${BUILT_APP}/Contents/Info.plist`
      const plist = readFileSync(plistPath, 'utf8')
      expect(plist).not.toMatch(/\bDreamForge\b/u)
      expect(plist).not.toMatch(/\bTolaria\b/u)
    })

    it('JS bundle has more DreamX than DreamForge mentions (rebrand surface)', () => {
      // The actual user-visible i18n strings live in the JS bundle, not
      // the Rust binary. The Rust binary intentionally retains
      // "tolaria_lib" symbol paths, the "Tolaria <vault@tolaria.default>"
      // git author identity, and the "Tolaria Vault" AGENTS.md template
      // — all compat-layer / non-user-visible. We do NOT scan the Rust
      // binary here; it would always fail due to the compat layer.
      if (!existsSync(BUILT_APP) || !existsSync(DIST_DIR)) return
      const mainBundle = findMainJsBundle(DIST_DIR)
      if (!mainBundle) return
      const dreamXCount = countInFile(mainBundle, 'DreamX')
      const dreamForgeCount = countInFile(mainBundle, 'DreamForge')
      // i18n strings are duplicated in the bundle (per-locale). Expect
      // a strong majority for the new brand.
      expect(
        dreamXCount,
        `DreamX count (${dreamXCount}) should be much greater than DreamForge count (${dreamForgeCount}) in ${mainBundle}`,
      ).toBeGreaterThan(dreamForgeCount * 5)
    })

    it('JS bundle has no user-visible Tolaria references', () => {
      if (!existsSync(BUILT_APP) || !existsSync(DIST_DIR)) return
      const mainBundle = findMainJsBundle(DIST_DIR)
      if (!mainBundle) return
      // The JS bundle should have no "Tolaria" — the legacy brand
      // was fully removed in PR 16 + PR 20 + PR 21. The only acceptable
      // "Tolaria" references in the source are now in
      //   - src-tauri/src/vault/getting_started.rs (AGENTS.md template)
      //   - src-tauri/src/git/connect.rs (error message "Tolaria could
      //     not determine the current branch")
      //   - src-tauri/src/git/commit.rs (git author identity)
      // None of these strings end up in the JS bundle.
      const tolariaCount = countInFile(mainBundle, 'Tolaria')
      expect(
        tolariaCount,
        `Found ${tolariaCount} "Tolaria" reference(s) in ${mainBundle} — should be 0`,
      ).toBe(0)
    })
  })
})
