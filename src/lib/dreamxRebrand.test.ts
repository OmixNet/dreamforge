import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

// PR 20: user-visible brand is "DreamX". This test guards against
// regressions by scanning the surfaces a human user actually sees —
// locale strings, the macOS app name, the window title, the browser
// tab title, the README headline — and asserts none of them still say
// "DreamForge".
//
// Allowlist (intentionally NOT scanned):
//   - AGENTS.md: agent-facing project guide, not user-visible
//   - THIRD_PARTY_NOTICES.md: legal / AGPL attribution, frozen history
//   - docs/reports/v0*-ship-*.md: historical ship records
//   - docs/superpowers/plans/*-dreamforge-decisions.md: migration log
//   - src-tauri/src/settings.rs, src-tauri/src/vault_list.rs,
//     src/constants/appStorage.ts, src/utils/fileAttachmentMarkdown.ts,
//     etc.: these hold DREAMFORGE_* env var names, com.biomatrix.dreamforge
//     bundle/config identifiers, dreamforge-* localStorage keys, and
//     DREAMFORGE_FILE_ATTACHMENT token prefixes — all compatibility
//     surface that must keep working across machines (see PR 20 plan:
//     "底层兼容名暂时保留 dreamforge").
//   - Code comments (// and /* */): per cross-project DREAMFORGE_SLIM
//     trace convention, historical project-naming comments stay.
//
// The test is case-sensitive on "DreamForge" (title case) — uppercase
// DREAMFORGE_* env var names and lowercase dreamforge-* identifiers
// never trigger it.

const REPO_ROOT = join(process.cwd())
const ALLOWED_PATH_PATTERNS: RegExp[] = [
  // Historical ship docs
  /^docs\/reports\/v\d.*-ship-.*\.md$/u,
  // Migration / decision log
  /^docs\/superpowers\/plans\/.*-dreamforge-decisions\.md$/u,
  // Historical design ADRs and v0.2 roadmap (frozen at decision time)
  /^docs\/superpowers\/plans\/2026-06-17-adr-.*\.md$/u,
  /^docs\/superpowers\/plans\/2026-06-17-dreamforge-v0\.2-roadmap\.md$/u,
  /^docs\/superpowers\/plans\/2026-06-16-dreamforge-development-manual\.md$/u,
  // AGPL attribution / third-party notices
  /^THIRD_PARTY_NOTICES\.md$/u,
  // Agent-facing guide (not user-visible)
  /^AGENTS\.md$/u,
  // The test file itself intentionally contains "DreamForge" in
  // assertion messages and scenario descriptions.
  /^src\/lib\/dreamxRebrand\.test\.ts$/u,
]

function isAllowedPath(relPath: string): boolean {
  return ALLOWED_PATH_PATTERNS.some((re) => re.test(relPath))
}

function assertNoDreamForgeInScannedSurface(
  relPath: string,
  content: string,
): void {
  if (isAllowedPath(relPath)) return

  // Strip comments before scanning — comments are not user-visible.
  const stripped = content
    // Block comments /* ... */ (non-greedy, multi-line)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Single-line comments: from // to end of line
    .replace(/\/\/[^\n]*/g, '')

  if (/\bDreamForge\b/u.test(stripped)) {
    throw new Error(
      `Found user-visible "DreamForge" in ${relPath} after PR 20 rebrand. `
      + `Either rename it to "DreamX" or add the path to the allowlist in `
      + `src/lib/dreamxRebrand.test.ts with a justification.`,
    )
  }
}

describe('PR 20 — DreamX user-visible brand', () => {
  it('locale files do not contain "DreamForge" in any user-visible string', () => {
    // Read all 20 locales and assert no DreamForge in values (keys stay
    // as-is since they're internal identifiers).
    const localesDir = join(REPO_ROOT, 'src', 'lib', 'locales')
    const files = readdirSync(localesDir).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThanOrEqual(20)
    for (const file of files) {
      const full = join(localesDir, file)
      const raw = readFileSync(full, 'utf8')
      // Strip line comments (locales shouldn't have any, but be safe)
      const stripped = raw.replace(/\/\/[^\n]*/g, '')
      const matches = stripped.match(/\bDreamForge\b/g) ?? []
      expect(matches, `${file} still contains "DreamForge"`).toHaveLength(0)
    }
  })

  it('tauri.conf.json productName + window title are DreamX', () => {
    const configPath = join(REPO_ROOT, 'src-tauri', 'tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.productName).toBe('DreamX')
    expect(config.app?.windows?.[0]?.title).toBe('DreamX')
    // Compatibility layer — these MUST stay dreamforge.
    expect(config.identifier).toBe('com.biomatrix.dreamforge')
  })

  it('src-tauri/Info.plist has no Tolaria or DreamForge in user-facing strings', () => {
    // macOS reads NSLocalNetworkUsageDescription (and other privacy
    // strings) into the system permission dialog. This is real
    // user-visible surface, and PR 20 missed it because the test only
    // scanned tauri.conf.json. PR 21 adds the Info.plist scan.
    const plistPath = join(REPO_ROOT, 'src-tauri', 'Info.plist')
    const plist = readFileSync(plistPath, 'utf8')
    expect(plist).not.toContain('Tolaria')
    expect(plist).not.toContain('DreamForge')
    // Privacy string content sanity: should be about DreamX.
    expect(plist).toContain('DreamX')
  })

  it('index.html title is DreamX', () => {
    const indexPath = join(REPO_ROOT, 'index.html')
    const html = readFileSync(indexPath, 'utf8')
    const titleMatch = html.match(/<title>([^<]+)<\/title>/u)
    expect(titleMatch).not.toBeNull()
    expect(titleMatch?.[1]).toBe('DreamX')
  })

  it('README.md headline is DreamX (no Chinese 梦铸)', () => {
    const readmePath = join(REPO_ROOT, 'README.md')
    const readme = readFileSync(readmePath, 'utf8')
    // The first H1 is the user-facing title.
    const firstHeading = readme.match(/^#\s+(.+)$/mu)
    expect(firstHeading).not.toBeNull()
    expect(firstHeading?.[1]).toContain('DreamX')
    expect(firstHeading?.[1]).not.toContain('DreamForge')
    expect(firstHeading?.[1]).not.toContain('梦铸')
  })

  it('WelcomeScreen hero icon alt text is DreamX', () => {
    const welcomePath = join(REPO_ROOT, 'src', 'components', 'WelcomeScreen.tsx')
    const src = readFileSync(welcomePath, 'utf8')
    // Strip comments to focus on user-facing string literals.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(stripped).toContain('alt="DreamX icon"')
    expect(stripped).toContain("title: 'Welcome to DreamX'")
  })

  it('AI workspace window title is DreamX AI', () => {
    const winPath = join(REPO_ROOT, 'src', 'utils', 'openAiWorkspaceWindow.ts')
    const src = readFileSync(winPath, 'utf8')
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(stripped).toContain("'DreamX AI'")
  })

  it('release history page title is DreamX — Release History', () => {
    const pagePath = join(REPO_ROOT, 'src', 'utils', 'releaseHistoryPage.ts')
    const src = readFileSync(pagePath, 'utf8')
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(stripped).toContain('<title>DreamX — Release History</title>')
    expect(stripped).toContain('<h1>DreamX Release History</h1>')
  })

  it('all user-facing scanned files pass the DreamForge scan', () => {
    // Final guard: re-scan every file we touched in PR 20 (plus a
    // sampling of the wider codebase) and assert no "DreamForge" in
    // any non-allowlisted surface. Catches future regressions where
    // someone adds a new toast/title/window and forgets to use "DreamX".
    const scannedRoots = ['src', 'public', 'docs', 'src-tauri']
    const allowListFiles = new Set<string>([
      // Add any future allowlisted files here.
    ])

    function walk(dir: string, acc: string[] = []): string[] {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'target' || entry.name.startsWith('.')) {
          if (entry.name !== '.cargo') continue
        }
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full, acc)
        else if (/\.(ts|tsx|json|html|md|mjs|css|svg|plist)$/u.test(entry.name)) {
          acc.push(full)
        }
      }
      return acc
    }

    const offenders: string[] = []
    for (const root of scannedRoots) {
      const full = join(REPO_ROOT, root)
      if (!existsSync(full)) continue
      for (const file of walk(full)) {
        const rel = relative(REPO_ROOT, file)
        if (allowListFiles.has(rel)) continue
        if (isAllowedPath(rel)) continue
        const content = readFileSync(file, 'utf8')
        try {
          assertNoDreamForgeInScannedSurface(rel, content)
        } catch (err) {
          offenders.push(`${rel}: ${(err as Error).message}`)
        }
      }
    }
    expect(offenders, `Found "DreamForge" in user-visible surfaces:\n${offenders.join('\n')}`).toHaveLength(0)
  })
})
