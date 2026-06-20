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
  /\bbudget\s+(\d+)\s+call\(s\)/i,
  /\bprovider\s+call\s+count\s*[:=]\s*(\d+)\b/i,
  /\bcall\s+count\s*[:=]\s*(\d+)\b/i,
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
