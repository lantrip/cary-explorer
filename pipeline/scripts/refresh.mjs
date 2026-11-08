#!/usr/bin/env node
// Full refresh: snapshot -> build into pipeline/.staging -> publish. Extra args (e.g. --allow-stale) go to publish.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPTS = join(ROOT, 'pipeline', 'scripts')
const STAGING = join(ROOT, 'pipeline', '.staging')
const LAST_RUN = join(ROOT, 'pipeline', '.last-run.json')
const node = (script, args = []) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: ROOT, stdio: 'inherit' })

rmSync(LAST_RUN, { force: true }) // absence after the run means the snapshot step crashed
const snap = node('snapshot.mjs')

let failedSources = []
if (existsSync(LAST_RUN)) {
  failedSources = (JSON.parse(readFileSync(LAST_RUN, 'utf8')).sources ?? []).filter((s) => !s.ok).map((s) => s.id)
} else if (snap.status !== 0) {
  console.error('refresh: snapshot crashed before writing .last-run.json; aborting')
  process.exit(1)
}

rmSync(STAGING, { recursive: true, force: true })
mkdirSync(STAGING, { recursive: true })
const build = node('build-catalog.mjs', ['--out', STAGING])
writeFileSync(join(STAGING, '.gitignore'), '*\n')
if (build.status !== 0) {
  console.error('refresh: build failed; public/data untouched')
  process.exit(1)
}

const pub = node('publish.mjs', [STAGING, ...process.argv.slice(2)])
console.log('\n--- refresh report ---')
console.log(`snapshot: ${snap.status === 0 ? 'ok' : `failed sources: ${failedSources.join(', ') || '(unknown)'}`}`)
console.log(`publish:  ${pub.status === 0 ? 'released' : 'BLOCKED by gates (see errors above); public/data untouched'}`)
process.exit(pub.status === 0 ? 0 : 1)
