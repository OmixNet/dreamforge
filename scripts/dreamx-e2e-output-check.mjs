#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const inputPath = process.argv[2]

function fail(message) {
  console.error(`DreamX E2E output check failed: ${message}`)
  process.exit(1)
}

if (!inputPath) {
  fail('usage: node scripts/dreamx-e2e-output-check.mjs <dream-output-file>')
}

let output
try {
  output = readFileSync(inputPath, 'utf8')
} catch (error) {
  fail(`could not read output file: ${error instanceof Error ? error.message : String(error)}`)
}

const idleNoOpPattern = /一无事事|budget\s+0\s+call\(s\)|\b0\s+call\(s\)\b|idle\s+no-?op/i
if (idleNoOpPattern.test(output)) {
  fail('idle no-op detected; add a fresh raw fixture and rerun Dream')
}

const callCountPatterns = [
  // v0.5 P2c-3: actual dream CLI output shape is `budget: today N call(s)`
  // (BudgetManager prefix + a date label + the count + cost). The first
  // pattern accepts any whitespace OR `:` + free-form "today/yesterday" label
  // between "budget" and the digit. We previously required direct whitespace
  // which falsely rejected valid outputs that did report a real call.
  /\bbudget\b[^]*?(\d+)\s+call\(s\)/i,
  /\bprovider\s+call\s+count\s*[:=]\s*(\d+)\b/i,
  /\bcall\s+count\s*[:=]\s*(\d+)\b/i,
  // Catch any bare `N call(s)` phrase too, in case the label changes again.
  // Anchored with at least one non-digit boundary so we don't match
  // unrelated numbers like "v0.5" or "1.4s" (the leading (?:^|\s) handles
  // the start-of-string or whitespace boundary before the digit).
  /(?:^|\s)(\d+)\s+call\(s\)/i,
  /\b(\d+)\s+provider\s+call(?:s)?\b/i,
]

const callCount = callCountPatterns
  .map((pattern) => output.match(pattern))
  .filter(Boolean)
  .map((match) => Number(match?.[1] ?? 0))
  .find((count) => Number.isFinite(count) && count > 0)

if (!callCount) {
  fail('missing provider call evidence; expected budget N call(s) or provider call count > 0')
}

console.log(`DreamX E2E output check passed: provider call count > 0 (${callCount})`)
