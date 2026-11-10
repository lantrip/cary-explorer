#!/usr/bin/env node
// Prints each source's age and freshness from the published manifest; exits 1 when any source is stale.
// Usage: node pipeline/scripts/check-freshness.mjs [--manifest file] [--now ISO-date]
// `now` is injectable (flag or the `now` argument) so tests and reruns are deterministic.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceHealth } from '../lib/health.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Pure: rows and exit code for a parsed manifest at `now`. */
export function checkFreshness(manifest, now) {
  const rows = (manifest?.sources ?? []).map((s) => ({ id: s.id, cadence: s.cadence ?? null, lastSuccess: s.lastSuccess ?? null, ok: s.ok !== false, ...sourceHealth(s, now) }))
  const stale = rows.filter((r) => r.stale)
  return { rows, stale, exitCode: stale.length ? 1 : 0 }
}

export function formatReport({ rows, stale }) {
  const lines = rows.map((r) => {
    const age = r.ageDays === null ? 'age unknown' : `${r.ageDays}d old`
    const by = r.expectedBy ? `expected by ${r.expectedBy.slice(0, 10)}` : 'no cadence recorded'
    return `${r.status.toUpperCase().padEnd(7)} ${r.id.padEnd(26)} ${age.padEnd(12)} ${(r.cadence ?? '-').padEnd(8)} ${by}${r.ok ? '' : ' (last refresh failed)'}`
  })
  lines.push(stale.length ? `\n${stale.length} stale source(s): ${stale.map((r) => r.id).join(', ')}` : '\nAll sources within their expected window.')
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
  const manifestPath = resolve(opt('--manifest') ?? join(ROOT, 'public', 'data', 'manifest.json'))
  const now = opt('--now') ? new Date(opt('--now')) : new Date()
  if (Number.isNaN(now.getTime())) {
    console.error('error: --now is not a valid date')
    process.exit(2)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    console.error(`error: could not read manifest ${manifestPath}: ${e.message}`)
    process.exit(2)
  }
  const result = checkFreshness(manifest, now)
  console.log(`Source freshness at ${now.toISOString()}\n`)
  console.log(formatReport(result))
  process.exit(result.exitCode)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
