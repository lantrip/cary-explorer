#!/usr/bin/env node
// Publishes a staged build into public/data: apply overrides -> validate -> write hashed artifacts -> manifest.json last -> prune.
// Usage: node pipeline/scripts/publish.mjs [stagingDir] [--out dir] [--last-run file] [--overrides file] [--allow-stale]
// Fails closed: on any error prints it, exits 1 and leaves the output dir untouched (nothing is written).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactPath } from '../lib/release.mjs'
import { applyOverrides, loadOverrides } from '../lib/overrides.mjs'
import { countBySource, validateRelease } from '../lib/validate.mjs'
import { cadenceFields, registryEntry } from '../lib/health.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** Keeps a staged file's own formatting when untouched; otherwise matches the builder's 1-space indent. */
const serialize = (value) => JSON.stringify(value, null, 1) + '\n'

const referenced = (m) => {
  const a = m?.artifacts
  if (!a) return new Set()
  return new Set([a.catalog, a.relationships, a.collections, ...Object.values(a.layers ?? {}), String(a.places ?? '').replace(/\/$/, '')])
}

/** Deletes artifact files and folders that neither the new nor the previous manifest references. */
function prune(outDir, next, previous) {
  const keep = new Set([...referenced(next), ...referenced(previous)])
  const sweep = (dir, relDir, test) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const rel = relDir ? `${relDir}/${name}` : name
      if (test(name) && !keep.has(rel)) rmSync(join(dir, name), { recursive: true, force: true })
    }
  }
  sweep(outDir, '', (n) => /^(catalog|relationships|collections)(\..+)?\.json(\.tmp-.*)?$/.test(n) || /^manifest\.json\.tmp-/.test(n))
  sweep(join(outDir, 'layers'), 'layers', () => true)
  sweep(join(outDir, 'places'), 'places', () => true)
}

export function publish({
  stagingDir = join(ROOT, 'pipeline', '.staging'),
  outDir = join(ROOT, 'public', 'data'),
  lastRunPath = join(ROOT, 'pipeline', '.last-run.json'),
  overridesPath = join(ROOT, 'pipeline', 'overrides.json'),
  allowStale = false,
  registryPath = join(ROOT, 'pipeline', 'sources.config.json'),
  env = process.env,
} = {}) {
  const errors = []
  const warnings = []
  const fail = () => ({ ok: false, errors, warnings })
  if (!existsSync(join(stagingDir, 'catalog.json'))) {
    errors.push(`no catalog.json in staging dir ${stagingDir}`)
    return fail()
  }

  let catalogText, catalog, layers = {}, layerTexts = {}, relText, relationships, collTexts, collections
  const details = {}
  const detailTexts = {}
  try {
    catalogText = readFileSync(join(stagingDir, 'catalog.json'), 'utf8')
    catalog = JSON.parse(catalogText)
    const layerDir = join(stagingDir, 'layers')
    if (existsSync(layerDir)) {
      for (const f of readdirSync(layerDir).filter((n) => n.endsWith('.geojson')).sort()) {
        layerTexts[f] = readFileSync(join(layerDir, f), 'utf8')
        layers[f.replace(/\.geojson$/, '')] = JSON.parse(layerTexts[f])
      }
    }
    const placesDir = join(stagingDir, 'places')
    if (existsSync(placesDir)) {
      for (const f of readdirSync(placesDir).filter((n) => n.endsWith('.json')).sort()) {
        const id = f.replace(/\.json$/, '')
        detailTexts[id] = readFileSync(join(placesDir, f), 'utf8')
        details[id] = JSON.parse(detailTexts[id])
      }
    } else warnings.push('staging has no places/ directory; every place will fail the detail-file gate')
    if (existsSync(join(stagingDir, 'relationships.json'))) {
      relText = readFileSync(join(stagingDir, 'relationships.json'), 'utf8')
      relationships = JSON.parse(relText)
    } else {
      warnings.push('staging has no relationships.json; publishing an empty relationship set')
      relationships = { relationships: [] }
      relText = serialize(relationships)
    }
    // Optional: older stagings have no collections.json, and the release then has no collections artifact.
    if (existsSync(join(stagingDir, 'collections.json'))) {
      collTexts = readFileSync(join(stagingDir, 'collections.json'), 'utf8')
      collections = JSON.parse(collTexts)
    }
  } catch (e) {
    errors.push(`could not read staging: ${e.message}`)
    return fail()
  }

  let overrides = {}
  try {
    overrides = loadOverrides(overridesPath)
  } catch (e) {
    errors.push(e.message)
    return fail()
  }
  const applied = applyOverrides(catalog, overrides)
  warnings.push(...applied.warnings)
  if (applied.applied > 0) {
    catalog = applied.catalog
    catalogText = serialize(catalog)
  }

  let previousManifest = null
  try {
    if (existsSync(join(outDir, 'manifest.json'))) previousManifest = readJson(join(outDir, 'manifest.json'))
  } catch {
    warnings.push('previous manifest unreadable; count-change gate skipped')
  }
  let lastRun = null
  if (existsSync(lastRunPath)) {
    try {
      lastRun = readJson(lastRunPath)
    } catch (e) {
      errors.push(`could not read ${lastRunPath}: ${e.message}`)
      return fail()
    }
  } else warnings.push('no .last-run.json; source failure gate skipped')

  const result = validateRelease({ catalog, layers, relationships, details, collections, previousManifest, lastRun, env, allowStale })
  errors.push(...result.errors)
  warnings.push(...result.warnings)
  if (errors.length) return fail()

  // Manifest: deterministic, no clock reads.
  const hash = createHash('sha256')
  hash.update(catalogText)
  for (const name of Object.keys(layerTexts).sort()) hash.update(`\0${name}\0${layerTexts[name]}`)
  hash.update(`\0relationships\0${relText}`)
  for (const id of Object.keys(detailTexts).sort()) hash.update(`\0place\0${id}\0${detailTexts[id]}`)
  if (collTexts !== undefined) hash.update(`\0collections\0${collTexts}`)
  const failed = new Map((lastRun?.sources ?? []).filter((s) => !s.ok).map((s) => [s.id, s]))
  const prevById = new Map((previousManifest?.sources ?? []).map((s) => [s.id, s]))
  const counts = countBySource(catalog, details)
  let registry = []
  try {
    registry = readJson(registryPath)
  } catch (e) {
    warnings.push(`could not read source registry (${e.message}); manifest has no cadence fields`)
  }
  const manifestSources = [...catalog.sources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      ...(s.title && { title: s.title }),
      ...(s.attribution && { attribution: s.attribution }),
      recordCount: counts[s.id] ?? 0,
      retrievedAt: s.retrievedAt,
      licence: s.license,
      licenceStatus: s.licenceStatus,
      ...(s.sourceModified && { sourceModified: s.sourceModified }),
      ...(s.coverage && { coverage: s.coverage }),
      lastSuccess: failed.has(s.id) ? (prevById.get(s.id)?.lastSuccess ?? s.retrievedAt) : s.retrievedAt,
      ok: !failed.has(s.id),
      ...cadenceFields(registryEntry(registry, s.id)),
    }))
  const manifest = {
    version: hash.digest('hex').slice(0, 16),
    generatedFrom: manifestSources.map((s) => s.retrievedAt).sort().at(-1) ?? null,
    sources: manifestSources,
  }

  // Content-hashed artifacts: write only missing paths, manifest last, then prune.
  const h12 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)
  const placesHash = (() => {
    const h = createHash('sha256')
    for (const id of Object.keys(detailTexts).sort()) h.update(`\0place\0${id}\0${detailTexts[id]}`)
    return h.digest('hex').slice(0, 12)
  })()
  const files = {}
  const artifacts = { catalog: `catalog.${h12(catalogText)}.json`, relationships: `relationships.${h12(relText)}.json`, layers: {}, places: `places/${placesHash}/` }
  files[artifacts.catalog] = catalogText
  files[artifacts.relationships] = relText
  if (collTexts !== undefined) {
    artifacts.collections = `collections.${h12(collTexts)}.json`
    files[artifacts.collections] = collTexts
  }
  for (const name of Object.keys(layerTexts).sort()) {
    const base = name.replace(/\.geojson$/, '')
    artifacts.layers[base] = `layers/${base}.${h12(layerTexts[name])}.geojson`
    files[artifacts.layers[base]] = layerTexts[name]
  }
  // Key order: version, generatedFrom, artifacts, sources.
  const ordered = { version: manifest.version, generatedFrom: manifest.generatedFrom, artifacts, sources: manifest.sources }
  try {
    mkdirSync(outDir, { recursive: true })
    for (const [rel, text] of Object.entries(files)) {
      const dest = artifactPath(outDir, rel)
      if (existsSync(dest)) continue
      mkdirSync(dirname(dest), { recursive: true })
      const tmp = `${dest}.tmp-${process.pid}`
      writeFileSync(tmp, text)
      renameSync(tmp, dest)
    }
    const placesDest = artifactPath(outDir, artifacts.places.replace(/\/$/, ''))
    if (!existsSync(placesDest)) {
      const tmpDir = `${placesDest}.tmp-${process.pid}`
      rmSync(tmpDir, { recursive: true, force: true })
      mkdirSync(tmpDir, { recursive: true })
      for (const [id, text] of Object.entries(detailTexts)) writeFileSync(join(tmpDir, `${id}.json`), text)
      try {
        renameSync(tmpDir, placesDest)
      } catch (e) {
        rmSync(tmpDir, { recursive: true, force: true })
        if (!existsSync(placesDest)) throw e
      }
    }
    // The switch-over.
    const manifestTmp = join(outDir, `manifest.json.tmp-${process.pid}`)
    writeFileSync(manifestTmp, serialize(ordered))
    renameSync(manifestTmp, join(outDir, 'manifest.json'))
  } catch (e) {
    errors.push(`publish failed: ${e.message}`)
    return fail()
  }
  try {
    prune(outDir, ordered, previousManifest)
  } catch (e) {
    warnings.push(`prune failed: ${e.message}`)
  }
  return { ok: true, errors, warnings, manifest: ordered }
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? resolve(args[i + 1]) : undefined
  }
  const flagValues = new Set(['--out', '--last-run', '--overrides'].flatMap((n) => (args.includes(n) ? [args[args.indexOf(n) + 1]] : [])))
  const positional = args.find((a) => !a.startsWith('--') && !flagValues.has(a))
  const res = publish({
    ...(positional && { stagingDir: resolve(positional) }),
    ...(opt('--out') && { outDir: opt('--out') }),
    ...(opt('--last-run') && { lastRunPath: opt('--last-run') }),
    ...(opt('--overrides') && { overridesPath: opt('--overrides') }),
    allowStale: args.includes('--allow-stale'),
  })
  for (const w of res.warnings) console.warn(`warning: ${w}`)
  if (!res.ok) {
    for (const e of res.errors) console.error(`error: ${e}`)
    console.error(`publish blocked: ${res.errors.length} error(s); output left untouched`)
    process.exit(1)
  }
  console.log(`published release ${res.manifest.version} (${res.manifest.sources.length} sources)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
