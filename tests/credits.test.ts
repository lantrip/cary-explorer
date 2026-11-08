import { describe, expect, it } from 'vitest'
import {
  LICENCE_UNKNOWN,
  buildCreditsRows,
  formatCreditDate,
  requiresCredit,
  showEbirdSection,
} from '../src/features/about/credits'
import { parseManifest } from '../src/features/places/release'
import type { Source } from '../src/types/place'

const cat = (id: string, extra: Partial<Source> = {}): Source => ({
  id,
  name: `Name ${id}`,
  url: `https://example.org/${id}`,
  license: 'CC0 1.0',
  retrievedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
})
const man = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  recordCount: 5,
  retrievedAt: '2026-11-07T17:40:42.606Z',
  licence: 'CC0 1.0',
  licenceStatus: 'declared',
  lastSuccess: '2026-11-07T17:40:42.606Z',
  ok: true,
  ...extra,
})
const manifestSources = (...items: ReturnType<typeof man>[]) =>
  parseManifest({
    version: '4188bdab5a4741a2',
    artifacts: { catalog: 'c.json', relationships: 'r.json', places: 'places/x/' },
    sources: items,
  }).sources

describe('buildCreditsRows', () => {
  it('uses the dataset title as the label, falling back to the publisher name, then the id', () => {
    const rows = buildCreditsRows(manifestSources(man('a'), man('b'), man('c')), [cat('a', { title: 'Greenways in Wake County, NC' }), cat('b')])
    expect(rows.map((r) => r.title)).toEqual(['Greenways in Wake County, NC', 'Name b', 'c'])
    expect(rows[0].name).toBe('Name a')
  })

  it('joins manifest and catalog sources by id and keeps manifest order', () => {
    const rows = buildCreditsRows(manifestSources(man('b'), man('a')), [cat('a'), cat('b')])
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(rows[0]).toMatchObject({
      name: 'Name b',
      url: 'https://example.org/b',
      licence: 'CC0 1.0',
      retrievedAt: '2026-11-07T17:40:42.606Z',
      lastSuccess: '2026-11-07T17:40:42.606Z',
      recordCount: 5,
      ok: true,
    })
  })

  it('falls back to the id (and no link) when the catalog has no such source', () => {
    const [row] = buildCreditsRows(manifestSources(man('mystery')), [cat('other')])
    expect(row.name).toBe('mystery')
    expect(row.url).toBeUndefined()
  })

  it('flags ok:false and hides a zero record count', () => {
    const [row] = buildCreditsRows(manifestSources(man('a', { ok: false, recordCount: 0 })), [cat('a')])
    expect(row.ok).toBe(false)
    expect(row.recordCount).toBeUndefined()
  })

  it('uses the catalog licence when the manifest has none, else says it is not stated', () => {
    const [fromCatalog] = buildCreditsRows(manifestSources(man('a', { licence: undefined })), [cat('a', { license: 'CC BY 4.0' })])
    expect(fromCatalog.licence).toBe('CC BY 4.0')
    const [none] = buildCreditsRows(manifestSources(man('a', { licence: undefined })), [cat('a', { license: undefined })])
    expect(none.licence).toBe(LICENCE_UNKNOWN)
  })

  it('adds a credit line for CC BY sources only', () => {
    const rows = buildCreditsRows(
      manifestSources(man('w', { licence: 'CC BY 4.0' }), man('c')),
      [cat('w', { name: 'Wake County' }), cat('c')],
    )
    expect(rows[0].credit).toBe('Adapted from data by Wake County, licensed CC BY 4.0.')
    expect(rows[1].credit).toBeUndefined()
  })

  it('has one row per manifest source even when the catalog lists others', () => {
    const rows = buildCreditsRows(manifestSources(man('a')), [cat('a'), cat('z')])
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })
})

describe('requiresCredit', () => {
  it.each([
    ['CC BY 4.0', true],
    ['CC-BY-4.0', true],
    ['CC BY-SA 4.0', true],
    ['CC0 1.0', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (licence, expected) => expect(requiresCredit(licence)).toBe(expected))
})

describe('showEbirdSection', () => {
  it('shows only when an ebird source is in the catalog', () => {
    expect(showEbirdSection([cat('cary-parks')])).toBe(false)
    expect(showEbirdSection([])).toBe(false)
    expect(showEbirdSection([cat('cary-parks'), cat('ebird')])).toBe(true)
  })
})

describe('formatCreditDate', () => {
  it('formats in UTC so a day-only date does not shift', () => {
    expect(formatCreditDate('2026-11-02')).toBe('November 2, 2026')
    expect(formatCreditDate('2026-11-07T23:59:00.000Z')).toBe('November 7, 2026')
  })
  it('returns unparseable text unchanged', () => {
    expect(formatCreditDate('soon')).toBe('soon')
  })
})
