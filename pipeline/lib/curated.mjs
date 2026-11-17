// Hand-maintained place links (pipeline/relationships.curated.json). See pipeline/README.md, "Curated relationships".
//
// File: an array of { from, to, note, source }
//   from, to  place ids that exist in the built catalog (from !== to)
//   note      one plain sentence saying why the two places are connected
//   source    an https URL (or a document link) that supports the link; no source, no link
// A pair appears once, in either order. Every problem is reported together and the build fails.
import { existsSync, readFileSync } from 'node:fs'

const isText = (v) => typeof v === 'string' && v.trim().length > 0

function isHttps(value) {
  if (!isText(value)) return false
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

/** Reads the curated file. A missing file is an empty list; anything but a JSON array throws. */
export function loadCurated(path) {
  if (!existsSync(path)) return []
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path}: not valid JSON (${err.message})`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${path}: curated relationships must be a JSON array of { from, to, note, source }`)
  return parsed
}

/**
 * Validates entries against the catalog place ids and returns `kind: 'curated'` relationships sorted by from, to.
 * Throws one Error listing every problem.
 */
export function curatedRelationships(entries, placeIds, label = 'relationships.curated.json') {
  const errors = []
  const seen = new Map()
  const out = []
  entries.forEach((e, i) => {
    const at = `${label} entry ${i + 1}`
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`${at}: must be an object { from, to, note, source }`)
      return
    }
    const { from, to, note, source } = e
    let ok = true
    for (const [key, value] of [['from', from], ['to', to]]) {
      if (!isText(value)) {
        errors.push(`${at}: "${key}" must be a place id`)
        ok = false
      } else if (!placeIds.has(value)) {
        errors.push(`${at}: "${key}" id "${value}" is not in the catalog`)
        ok = false
      }
    }
    if (ok && from === to) {
      errors.push(`${at}: "from" and "to" are the same place ("${from}")`)
      ok = false
    }
    if (!isText(note)) {
      errors.push(`${at}: "note" is required (one sentence on why the places are connected)`)
      ok = false
    }
    if (!isText(source)) {
      errors.push(`${at}: "source" is required (an https URL that supports the link)`)
      ok = false
    } else if (!isHttps(source)) {
      errors.push(`${at}: "source" must be an https URL (got "${source}")`)
      ok = false
    }
    if (!ok) return
    const pair = [from, to].sort().join('\0')
    if (seen.has(pair)) {
      errors.push(`${at}: duplicates entry ${seen.get(pair)} (${from} and ${to} are already linked)`)
      return
    }
    seen.set(pair, i + 1)
    out.push({ from, to, kind: 'curated', evidence: `${note.trim()} Source: ${source.trim()}` })
  })
  if (errors.length) throw new Error(`Curated relationships are invalid:\n- ${errors.join('\n- ')}`)
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
}
