#!/usr/bin/env node
// Size budgets: gzips every published artifact (resolved through manifest.json) and the dist JS, compares with pipeline/budgets.json.
// Usage: node pipeline/scripts/check-budgets.mjs [--data dir] [--dist dir] [--budgets file]. Exits 1 when anything is over.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { artifactPath, readRelease } from '../lib/release.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const gz = (buf) => gzipSync(buf, { level: 9 }).length

/** Pure check. Returns { rows: [{ file, gz, limit, ok }], over: rows over budget }. */
export function checkBudgets({
  dataDir = join(ROOT, 'public', 'data'),
  distDir = join(ROOT, 'dist'),
  budgets = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'budgets.json'), 'utf8')),
} = {}) {
  const release = readRelease(dataDir)
  const a = release.manifest.artifacts
  const rows = []
  const add = (file, buf, limit) => {
    const size = gz(buf)
    rows.push({ file, gz: size, limit, ok: size <= limit })
    return size
  }
  const read = (rel) => readFileSync(artifactPath(dataDir, rel))
  const m = add('manifest.json', readFileSync(join(dataDir, 'manifest.json')), budgets.manifest)
  const c = add(a.catalog, read(a.catalog), budgets.catalog)
  const r = add(a.relationships, read(a.relationships), budgets.relationships)
  if (a.collections && budgets.collections) add(a.collections, read(a.collections), budgets.collections)
  for (const rel of Object.values(a.layers)) add(rel, read(rel), budgets.layer)
  const folder = a.places.replace(/\/$/, '')
  let placeCount = 0
  let worst = null
  for (const f of readdirSync(release.placesDir).sort()) {
    const size = gz(readFileSync(join(release.placesDir, f)))
    placeCount++
    if (!worst || size > worst.gz) worst = { file: `${folder}/${f}`, gz: size }
    if (size > budgets.place) rows.push({ file: `${folder}/${f}`, gz: size, limit: budgets.place, ok: false })
  }
  if (worst && worst.gz <= budgets.place) {
    rows.push({ file: `${worst.file} (largest of ${placeCount})`, gz: worst.gz, limit: budgets.place, ok: true })
  }
  const initial = m + c + r
  rows.push({ file: 'initial data (manifest + catalog + relationships)', gz: initial, limit: budgets.initialData, ok: initial <= budgets.initialData })
  const assets = join(distDir, 'assets')
  if (existsSync(assets)) {
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
    if (js.length) {
      const top = js.map((f) => ({ f, size: gz(readFileSync(join(assets, f))) })).sort((x, y) => y.size - x.size)[0]
      rows.push({ file: `dist/assets/${top.f} (largest JS)`, gz: top.size, limit: budgets.jsBundle, ok: top.size <= budgets.jsBundle })
    }
  }
  return { rows, over: rows.filter((x) => !x.ok) }
}

export function formatTable(rows) {
  const w = Math.max(4, ...rows.map((x) => x.file.length))
  const lines = [`${'file'.padEnd(w)}  ${'gz bytes'.padStart(9)}  ${'limit'.padStart(9)}  status`]
  for (const x of rows) lines.push(`${x.file.padEnd(w)}  ${String(x.gz).padStart(9)}  ${String(x.limit).padStart(9)}  ${x.ok ? 'OK' : 'OVER'}`)
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => (args.includes(n) ? resolve(args[args.indexOf(n) + 1]) : undefined)
  const budgetsPath = opt('--budgets')
  const { rows, over } = checkBudgets({
    ...(opt('--data') && { dataDir: opt('--data') }),
    ...(opt('--dist') && { distDir: opt('--dist') }),
    ...(budgetsPath && { budgets: JSON.parse(readFileSync(budgetsPath, 'utf8')) }),
  })
  console.log(formatTable(rows))
  if (over.length) {
    console.error(`\n${over.length} item(s) over budget`)
    process.exit(1)
  }
  console.log('\nall within budget')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
