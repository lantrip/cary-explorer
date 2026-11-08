#!/usr/bin/env node
// Thin wrapper kept for the old command: snapshots the Cary (opendatasoft) sources via snapshot.mjs.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from '../lib/snapshot-core.mjs'
import { main } from './snapshot.mjs'

const sources = await loadRegistry(join(dirname(fileURLToPath(import.meta.url)), '..', 'sources.config.json'))
const ids = sources.filter((s) => s.enabled && s.dir.startsWith('cary/')).map((s) => s.id)
process.exit(await main(['--only', ids.join(',')]))
