import { describe, expect, it } from 'vitest'
import { buildCollections, validateCollections } from '../pipeline/lib/collections.mjs'
// @ts-expect-error untyped .mjs pipeline module
import { validateRelease } from '../pipeline/lib/validate.mjs'
import { parseCollections, resolveCollectionPlaces } from '../src/features/collections/collections'
import {
  FAVORITES_KEY,
  createFavoritesStore,
  parseFavorites,
  pruneFavorites,
} from '../src/features/favorites/favoritesStore'
import { parseManifest } from '../src/features/places/release'
import { parseUrlState, serializeUrlState, type UrlState } from '../src/lib/urlState'
import type { Place } from '../src/types/place'

const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  category: 'park',
  coverage: 'core',
  municipality: 'Apex',
  amenities: ['restrooms'],
  ...extra,
})
const detail = (entrances: 'known' | 'unknown') => ({ fields: [{ key: 'entrances', status: entrances }] })

describe('collection rules', () => {
  it('restroom collection needs restrooms AND known entrances, ranked by amenities, then Cary, then name, max 12', () => {
    const places = [
      place('z-rich', { amenities: ['restrooms', 'parking', 'playground'] }),
      place('y-cary', { municipality: 'Cary' }),
      place('a-apex'),
      place('no-entrance', { amenities: ['restrooms', 'parking', 'playground', 'water'] }),
      place('no-restroom', { amenities: ['parking'] }),
      place('a-trail', { category: 'trail' }),
      ...Array.from({ length: 14 }, (_, i) => place(`p${String(i).padStart(2, '0')}`)),
    ]
    const details: Record<string, ReturnType<typeof detail>> = {}
    for (const p of places) details[p.id] = detail(p.id === 'no-entrance' ? 'unknown' : 'known')
    const c = buildCollections(places, details).collections.find((x) => x.id === 'short-visit-restroom')!
    expect(c.placeIds).toHaveLength(12)
    expect(c.placeIds.slice(0, 3)).toEqual(['z-rich', 'y-cary', 'a-apex'])
    expect(c.placeIds[3]).toBe('p00')
    for (const gone of ['no-entrance', 'no-restroom', 'a-trail']) expect(c.placeIds).not.toContain(gone)
    expect(c.curation).toMatch(/most confirmed facilities first, Cary first on ties/)
    expect(c.title).toBe('Parks with restrooms and mapped entrances')
    expect(c.summary).toMatch(/the 12 with the most confirmed facilities, of 17 that qualify/)
    expect(c.curation).toMatch(/top 12 of 17 qualifying parks/)
  })

  it('ships nothing empty and builds paved trails only from confirmed paved surface', () => {
    expect(buildCollections([place('x', { amenities: [] })], {}).collections).toEqual([])
    const out = buildCollections(
      [place('t1', { category: 'trail', amenities: ['pavedSurface'] }), place('t2', { category: 'trail', amenities: [] })],
      {},
    )
    expect(out.collections.map((c) => c.id)).toEqual(['paved-trails'])
    expect(out.collections[0].placeIds).toEqual(['t1'])
  })

  it('ranks paved trails by the build-computed length, longest first, and states 12 of N', () => {
    const trails = [
      place('short', { category: 'trail', amenities: ['pavedSurface'] }),
      place('long', { category: 'trail', amenities: ['pavedSurface', 'parking'] }),
      place('mid-b', { category: 'trail', amenities: ['pavedSurface'] }),
      place('mid-a', { category: 'trail', amenities: ['pavedSurface'] }),
      place('unknown', { category: 'trail', amenities: ['pavedSurface'] }),
    ]
    const trailMiles = new Map([['short', 1], ['long', 9.5], ['mid-b', 4], ['mid-a', 4]])
    const c = buildCollections(trails, {}, { trailMiles }).collections[0]
    expect(c.placeIds).toEqual(['long', 'mid-a', 'mid-b', 'short', 'unknown'])
    expect(c.summary).toBe('Trails whose surface is recorded as paved; the 5 longest, of 5 that qualify.')
    expect(c.curation).not.toMatch(/not in the data/)
    expect(c.curation).toMatch(/longest first/)
  })
})

describe('collections validation gate', () => {
  const ids = new Set(['a', 'b'])
  const ok = { id: 'one', title: 'One', summary: 's', curation: 'rule', placeIds: ['a', 'b'] }
  it('accepts a valid file', () => expect(validateCollections({ collections: [ok] }, ids)).toEqual([]))
  it('rejects unknown places, duplicate and empty ids, missing titles', () => {
    expect(validateCollections({ collections: [{ ...ok, placeIds: ['a', 'gone'] }] }, ids).join()).toMatch(/"gone" is not in the catalog/)
    expect(validateCollections({ collections: [ok, ok] }, ids).join()).toMatch(/duplicate id/)
    expect(validateCollections({ collections: [{ ...ok, id: '' }] }, ids).join()).toMatch(/id must be/)
    expect(validateCollections({ collections: [{ ...ok, title: ' ' }] }, ids).join()).toMatch(/title/)
    expect(validateCollections({ collections: [{ ...ok, placeIds: [] }] }, ids).join()).toMatch(/placeIds/)
    expect(validateCollections({}, ids)).not.toEqual([])
  })
  it('is wired into validateRelease', () => {
    const catalog = { sources: [], places: [] }
    const r = validateRelease({ catalog, collections: { collections: [{ ...ok, placeIds: ['nope'] }] } })
    expect(r.errors.join()).toMatch(/collections\[0\]/)
  })
})

describe('manifest parse', () => {
  const base = (artifacts: Record<string, unknown> = {}) => ({
    version: '4188bdab5a4741a2',
    artifacts: { catalog: 'catalog.a.json', relationships: 'relationships.a.json', places: 'places/abc/', ...artifacts },
  })
  it('works without collections (older manifests)', () => {
    expect(parseManifest(base()).collectionsUrl).toBeUndefined()
  })
  it('resolves collections and rejects unsafe paths', () => {
    expect(parseManifest(base({ collections: 'collections.abc.json' })).collectionsUrl).toBe('/data/collections.abc.json')
    expect(() => parseManifest(base({ collections: '../x.json' }))).toThrow(/artifacts.collections/)
  })
})

describe('app-side collections', () => {
  it('parseCollections drops invalid entries and duplicates', () => {
    const raw = {
      collections: [
        { id: 'a', title: 'A', summary: 's', curation: 'c', placeIds: ['p1', 'p1', 'p2'] },
        { id: 'a', title: 'dup', summary: 's', curation: 'c', placeIds: ['p1'] },
        { id: 'b', title: '', summary: 's', curation: 'c', placeIds: ['p1'] },
        { id: 'c', title: 'C', summary: 's', curation: 'c', placeIds: [] },
        'junk',
      ],
    }
    const out = parseCollections(raw)
    expect(out).toHaveLength(1)
    expect(out[0].placeIds).toEqual(['p1', 'p2'])
    expect(parseCollections(null)).toEqual([])
  })
  it('drops places missing from the catalog and keeps collection order', () => {
    const c = { id: 'a', title: 'A', summary: 's', curation: 'c', placeIds: ['p2', 'gone', 'p1'] }
    const places = [{ id: 'p1' }, { id: 'p2' }] as Place[]
    expect(resolveCollectionPlaces(c, places).map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(resolveCollectionPlaces({ ...c, placeIds: ['gone'] }, places)).toEqual([])
  })
})

describe('collection URL param', () => {
  const state: UrlState = { place: null, themes: ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community'], view: 'map', q: '', town: null, map: null, collection: 'paved-trails' }
  it('round-trips', () => {
    const search = serializeUrlState(state)
    expect(search).toBe('?collection=paved-trails')
    expect(parseUrlState(search).collection).toBe('paved-trails')
  })
  it('ignores malformed ids and omits when closed', () => {
    expect(parseUrlState('?collection=Bad%20Id').collection).toBeUndefined()
    expect(parseUrlState('?collection=' + 'a'.repeat(61)).collection).toBeUndefined()
    expect(serializeUrlState({ ...state, collection: null })).toBe('')
  })
})

describe('favorites store', () => {
  const memoryStorage = () => {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }
  it('persists ids only and reloads them', () => {
    const storage = memoryStorage()
    const a = createFavoritesStore(() => storage)
    a.toggle('p1')
    a.toggle('p2')
    expect(storage.data.get(FAVORITES_KEY)).toBe('["p1","p2"]')
    expect(createFavoritesStore(() => storage).getSnapshot()).toEqual({ ids: ['p1', 'p2'], persistent: true })
    a.toggle('p1')
    expect(a.getSnapshot().ids).toEqual(['p2'])
  })
  it('falls back to memory when storage throws', () => {
    const broken = () => {
      throw new Error('denied')
    }
    const store = createFavoritesStore(broken)
    expect(store.getSnapshot().persistent).toBe(false)
    store.toggle('p1')
    expect(store.getSnapshot()).toEqual({ ids: ['p1'], persistent: false })
    const failingWrites = createFavoritesStore(() => ({ getItem: () => null, setItem: broken }))
    failingWrites.toggle('p9')
    expect(failingWrites.getSnapshot()).toEqual({ ids: ['p9'], persistent: false })
  })
  it('prunes ids missing from the catalog on save and ignores corrupt storage', () => {
    const storage = memoryStorage()
    storage.setItem(FAVORITES_KEY, '["keep","gone"]')
    const store = createFavoritesStore(() => storage)
    store.toggle('new', new Set(['keep', 'new']))
    expect(store.getSnapshot().ids).toEqual(['keep', 'new'])
    expect(pruneFavorites(['a', 'b'], new Set(['b']))).toEqual(['b'])
    expect(parseFavorites('not json')).toEqual([])
    expect(parseFavorites('{"a":1}')).toEqual([])
    expect(parseFavorites('["ok","BAD ID",5,"ok"]')).toEqual(['ok'])
  })
})
