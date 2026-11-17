// Wake County Public Libraries (issue #125): pure helpers for the `library` places. build-catalog.mjs does the IO
// and the geometry. Only fields the source states are used; a closed or temporary branch (non-empty STATUS) is skipped.

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/** "Mon–Thu <M_T> · Fri <FRI> · Sat <SAT> · Sun <SUN>", leaving out any blank day; undefined when all are blank. */
export function libraryHours(p = {}) {
  const parts = [['Mon–Thu', p.M_T], ['Fri', p.FRI], ['Sat', p.SAT], ['Sun', p.SUN]]
    .map(([day, v]) => [day, clean(v)])
    .filter(([, v]) => v)
    .map(([day, v]) => `${day} ${v}`)
  return parts.length ? parts.join(' · ') : undefined
}

/** One plain sentence from the branch TYPE ("Regional branch of Wake County Public Libraries."). */
export function libraryDescription(type) {
  const t = clean(type)
  return t ? `${t} branch of Wake County Public Libraries.` : 'Branch of Wake County Public Libraries.'
}

/**
 * Libraries from the Wake layer: { libraries, skipped }. One per CODE (first by feature order wins); features with no
 * CODE, NAME or point are dropped, and features with a non-empty STATUS are counted in `skipped`, not published.
 */
export function groupLibraries(features) {
  const seen = new Set()
  const libraries = []
  let skipped = 0
  for (const f of features) {
    const p = f.properties ?? {}
    const code = clean(p.CODE)
    const name = clean(p.NAME)
    const pt = f.geometry?.coordinates
    if (!code || !name || !Array.isArray(pt) || seen.has(code.toLowerCase())) continue
    if (clean(p.STATUS)) {
      skipped++
      continue
    }
    seen.add(code.toLowerCase())
    const street = clean(p.FAC_ADDRESS)
    const city = clean(p.CITY)
    const label = clean(p.LABEL)
    const alias = label ? `${label} library` : ''
    const aliases = alias && alias.toLowerCase() !== name.toLowerCase() ? [alias] : []
    libraries.push({
      code,
      name,
      aliases,
      address: street ? `${street}, ${city ? `${city}, ` : ''}NC` : undefined,
      hours: libraryHours(p),
      description: libraryDescription(p.TYPE),
      pt,
    })
  }
  return { libraries, skipped }
}
