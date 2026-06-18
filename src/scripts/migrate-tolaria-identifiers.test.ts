import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'migrate-tolaria-identifiers.mjs')
// Vitest is configured to only pick up `src/**` for tests, so the test
// itself lives in `src/scripts/` while the actual migration script
// (which it spawns via `node`) lives in `scripts/` alongside
// `dream-cli-verify.sh`.

function runScript(vaultPath, extraArgs = []) {
  return spawnSync('node', [SCRIPT_PATH, vaultPath, ...extraArgs], {
    encoding: 'utf8',
  })
}

describe('migrate-tolaria-identifiers.mjs', () => {
  let vaultDir: string

  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), 'dreamforge-migrate-'))
  })

  afterEach(() => {
    rmSync(vaultDir, { recursive: true, force: true })
  })

  it('reports no changes when the vault has no legacy identifiers', () => {
    writeFileSync(join(vaultDir, 'note.md'), '# Hello\n\nSome text with no attachment tokens.\n')

    const result = runScript(vaultDir)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No legacy identifiers found')
    expect(readFileSync(join(vaultDir, 'note.md'), 'utf8')).toContain('# Hello')
  })

  it('dry run reports but does not write the migration', () => {
    const path = join(vaultDir, 'with-token.md')
    writeFileSync(
      path,
      '# Note\n\n@@TOLARIA_FILE_ATTACHMENT:%7B%22url%22%3A%22x%22%7D@@\n',
    )

    const result = runScript(vaultDir)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('1 replacement(s)')
    expect(result.stdout).toContain('Dry run')
    // File unchanged because --apply was not passed.
    expect(readFileSync(path, 'utf8')).toContain('@@TOLARIA_FILE_ATTACHMENT:')
  })

  it('rewrites the legacy prefix to the new one in --apply mode', () => {
    const path = join(vaultDir, 'rewritten.md')
    writeFileSync(
      path,
      'line 1\n@@TOLARIA_FILE_ATTACHMENT:%7B%22url%22%3A%22a%22%7D@@\nline 2\n',
    )

    const result = runScript(vaultDir, ['--apply'])

    expect(result.status).toBe(0)
    const after = readFileSync(path, 'utf8')
    expect(after).toContain('@@DREAMFORGE_FILE_ATTACHMENT:')
    expect(after).not.toContain('@@TOLARIA_FILE_ATTACHMENT:')
    expect(result.stdout).toContain('Wrote 1 file(s)')
  })

  it('handles multiple tokens in a single file and skips binary-adjacent metadata', () => {
    const path = join(vaultDir, 'multi.md')
    writeFileSync(
      path,
      [
        'token 1: @@TOLARIA_FILE_ATTACHMENT:%7B%22url%22%3A%22a%22%7D@@',
        'token 2: @@TOLARIA_FILE_ATTACHMENT:%7B%22url%22%3A%22b%22%7D@@',
        'no token here',
      ].join('\n'),
    )
    mkdirSync(join(vaultDir, '.git'))
    writeFileSync(join(vaultDir, '.git', 'HEAD'), '@@TOLARIA_FILE_ATTACHMENT:should-not-touch@@')

    const result = runScript(vaultDir, ['--apply'])

    expect(result.status).toBe(0)
    const after = readFileSync(path, 'utf8')
    expect(after.match(/@@DREAMFORGE_FILE_ATTACHMENT:/g)?.length).toBe(2)
    expect(after).not.toContain('@@TOLARIA_FILE_ATTACHMENT:')
    // .git contents must remain untouched.
    expect(readFileSync(join(vaultDir, '.git', 'HEAD'), 'utf8')).toContain('@@TOLARIA_FILE_ATTACHMENT:')
  })

  it('exits non-zero when the path argument is missing', () => {
    const result = spawnSync('node', [SCRIPT_PATH], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Usage:')
  })

  it('exits non-zero on an unreadable directory', () => {
    const result = runScript('/this/path/does/not/exist/anywhere')
    expect(result.status).not.toBe(0)
  })
})
