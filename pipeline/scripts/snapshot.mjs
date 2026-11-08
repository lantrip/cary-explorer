#!/usr/bin/env node
// Snapshot every enabled source in pipeline/sources.config.json into pipeline/sources/<dir>/.
// Usage: node pipeline/scripts/snapshot.mjs [--only <id>]   (node >= 22, no dependencies)
// Writes pipeline/.last-run.json; exit 0 if all sources ok, 1 if any failed.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry, runSnapshots } from '../lib/snapshot-core.mjs'

const PIPELINE = join(dirname(fileURLToPath(import.meta.url)), '..')

export async function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--only')
  const only = i >= 0 ? argv[i + 1] : undefined
  if (i >= 0 && !only) {
    console.error('--only needs a source id')
    return 1
  }
  try {
    const sources = await loadRegistry(join(PIPELINE, 'sources.config.json'))
    const { ok } = await runSnapshots({
      sources,
      only,
      outRoot: join(PIPELINE, 'sources'),
      lastRunPath: join(PIPELINE, '.last-run.json'),
      log: (m) => console.log(m),
    })
    return ok ? 0 : 1
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main())
}
