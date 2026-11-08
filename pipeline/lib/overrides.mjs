// Curated overrides: { "<placeId>": { description?, aliases?, url?, name? } }. Curated values win over
// generated ones. Applied after build, before validation. Unknown placeIds / fields are warnings.
import { existsSync, readFileSync } from 'node:fs'

export const OVERRIDE_FIELDS = ['description', 'aliases', 'url', 'name']

export function loadOverrides(path) {
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: overrides must be a JSON object keyed by placeId`)
  }
  return parsed
}

/** Pure: returns { catalog (new object), warnings[], applied: number }. */
export function applyOverrides(catalog, overrides) {
  const warnings = []
  const byId = new Map(catalog.places.map((p) => [p.id, p]))
  const patched = new Map()
  for (const id of Object.keys(overrides).sort()) {
    const patch = overrides[id]
    const place = byId.get(id)
    if (!place) {
      warnings.push(`override for unknown placeId "${id}" ignored`)
      continue
    }
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      warnings.push(`override for "${id}" is not an object; ignored`)
      continue
    }
    const next = { ...place }
    for (const [key, value] of Object.entries(patch)) {
      if (!OVERRIDE_FIELDS.includes(key)) {
        warnings.push(`override for "${id}" has unsupported field "${key}"; ignored`)
        continue
      }
      next[key] = value
    }
    patched.set(id, next)
  }
  return {
    catalog: { ...catalog, places: catalog.places.map((p) => patched.get(p.id) ?? p) },
    warnings,
    applied: patched.size,
  }
}
