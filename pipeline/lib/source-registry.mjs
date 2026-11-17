// Per-source registry fields for the release (decision 19): the credit string, the publisher's own modified date and a
// short factual coverage line. Attribution and sourceModified come from the snapshot meta.json; coverage is stated
// here from docs/source-matrix.md and pipeline/sources.config.json. Nothing is invented: a source with no
// attribution or no coverage line fails the build, and a missing sourceModified is simply left out.

const COUNTIES = 'Wake, Chatham and Durham counties (in scope)'

/** Catalog source id -> coverage line. */
export const COVERAGE = {
  'cary-parks': 'Town of Cary',
  'cary-greenways': 'Town of Cary',
  'cary-park-features': 'Town of Cary',
  'wake-parks': 'Wake County',
  'wake-park-entrances': 'Wake County',
  'wake-fire-stations': 'Wake County',
  'wake-libraries': 'Wake County',
  'wake-greenways': 'Wake County',
  'usgs-wbd-huc12': COUNTIES,
  'usgs-3dhp-streams': COUNTIES,
}

/** { attribution, sourceModified?, coverage } for one catalog source, from its snapshot meta. */
export function sourceRegistryFields(id, meta) {
  const attribution = typeof meta?.attribution === 'string' ? meta.attribution.trim() : ''
  if (!attribution) throw new Error(`source "${id}": snapshot meta has no attribution`)
  const coverage = COVERAGE[id]
  if (!coverage) throw new Error(`source "${id}": no coverage line in pipeline/lib/source-registry.mjs`)
  const modified = typeof meta.sourceModified === 'string' && Number.isFinite(Date.parse(meta.sourceModified)) ? meta.sourceModified : undefined
  return { attribution, ...(modified && { sourceModified: modified }), coverage }
}
