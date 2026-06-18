#!/usr/bin/env node
// PR 18 — Tolaria → DreamForge identifier migration script.
//
// Walks a vault directory and rewrites legacy identifiers in markdown files
// in place. By default it runs in dry-run mode and prints what would change;
// pass `--apply` to actually write changes.
//
// Currently handles:
//   @@TOLARIA_FILE_ATTACHMENT:<payload>@@  →  @@DREAMFORGE_FILE_ATTACHMENT:<payload>@@
//
// Future PRs may extend this list (e.g. legacy localStorage keys if they
// ever land inside markdown frontmatter). For now the file-attachment token
// is the only identifier embedded in user-authored content.
//
// Usage:
//   node scripts/migrate-tolaria-identifiers.mjs <vault-path> [--apply]
//
// Exit codes:
//   0 — no changes needed (or all changes applied successfully)
//   1 — invalid arguments
//   2 — runtime error (e.g. unreadable directory)

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const LEGACY_PREFIX = '@@TOLARIA_FILE_ATTACHMENT:'
const NEW_PREFIX = '@@DREAMFORGE_FILE_ATTACHMENT:'
const TOKEN_SUFFIX = '@@'

const args = process.argv.slice(2)
const applyMode = args.includes('--apply')
const positional = args.filter((arg) => !arg.startsWith('--'))

if (positional.length !== 1) {
  console.error('Usage: node scripts/migrate-tolaria-identifiers.mjs <vault-path> [--apply]')
  process.exit(1)
}

const vaultPath = resolve(positional[0])

function walkMarkdown(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (err) {
    console.error(`Cannot read directory: ${dir} (${err.message})`)
    process.exit(2)
  }
  for (const name of entries) {
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch (err) {
      console.warn(`Skip ${full}: ${err.message}`)
      continue
    }
    if (stat.isDirectory()) {
      // Skip the well-known metadata directories that should never be rewritten.
      if (name === '.git' || name === 'node_modules' || name === '.dream') continue
      walkMarkdown(full, files)
    } else if (stat.isFile() && name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

function countOccurrences(text, needle) {
  let count = 0
  let index = text.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = text.indexOf(needle, index + needle.length)
  }
  return count
}

function migrateFile(path) {
  const original = readFileSync(path, 'utf8')
  const matches = original.match(
    new RegExp(`${escapeRegExp(LEGACY_PREFIX)}[^\\n]*?${escapeRegExp(TOKEN_SUFFIX)}`, 'g'),
  )
  if (!matches || matches.length === 0) return null
  const rewritten = original.split(LEGACY_PREFIX).join(NEW_PREFIX)
  return { path, original, rewritten, matchCount: matches.length }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const markdownFiles = walkMarkdown(vaultPath)
const plans = []
for (const file of markdownFiles) {
  const plan = migrateFile(file)
  if (plan !== null) plans.push(plan)
}

if (plans.length === 0) {
  console.log(`Scanned ${markdownFiles.length} markdown file(s) under ${vaultPath}.`)
  console.log('No legacy identifiers found — nothing to migrate.')
  process.exit(0)
}

const totalReplacements = plans.reduce((sum, plan) => sum + plan.matchCount, 0)
console.log(`Found ${totalReplacements} legacy identifier(s) across ${plans.length} file(s):`)
for (const plan of plans) {
  const rel = relative(vaultPath, plan.path)
  console.log(`  ${rel}: ${plan.matchCount} replacement(s)`)
}

if (!applyMode) {
  console.log('')
  console.log('Dry run — pass --apply to write the changes.')
  process.exit(0)
}

for (const plan of plans) {
  writeFileSync(plan.path, plan.rewritten, 'utf8')
}
console.log('')
console.log(`Wrote ${plans.length} file(s) with ${totalReplacements} total replacement(s).`)
console.log('Next steps:')
console.log('  1. Reload DreamForge and verify the migrated notes resolve their')
console.log('     file attachments (the live code dual-recognizes both prefixes,')
console.log("     so it would have kept working — but you no longer need it).")
console.log('  2. Commit the rewritten markdown files alongside the code change.')
