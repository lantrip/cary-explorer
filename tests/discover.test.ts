import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRelease } from '../pipeline/lib/release.mjs'
import { discoverFor, sourceVintage, type DiscoverResult } from '../src/features/places/discover'
import { indexRelationships, parseRelationships } from '../src/features/places/relationships'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import type { Place } from '../src/types/place'

const dataDir = fileURLToPath(new URL('../public/data', import.meta.url))
const release = readRelease(dataDir)
const catalog = JSON.parse(readFileSync(release.catalogPath, 'utf8')) as { places: Place[]; sources: { id: string; name: string; retrievedAt?: string }[] }
const rels = parseRelationships(JSON.parse(readFileSync(release.relationshipsPath, 'utf8')))
const index = indexRelationships(rels)
const byId = new Map(catalog.places.map((p) => [p.id, p]))
const real = (id: string): DiscoverResult => discoverFor(id, index, byId, catalog.sources)
const FORBIDDEN = /flow|downstream|upstream|drink|\bserves?\b|\bcovers?\b|respon/i

describe('discoverFor on the published release', () => {
  it('Bond Park: one per theme, at most 3, fire station on its own line', () => {
    const r = real('cary-park-fred-g-bond-metro-park')
    expect(r.discoveries.length).toBeGreaterThan(0)
    expect(r.discoveries.length).toBeLessThanOrEqual(3)
    expect(new Set(r.discoveries.map((d) => d.theme)).size).toBe(r.discoveries.length)
    expect(r.discoveries.some((d) => d.theme === 'watershed')).toBe(true)
    expect(r.fireStation?.text).toMatch(/Fire Station.* · \d\.\d mi straight-line$/)
    expect(r.discoveries.some((d) => d.place.category === 'fire-station')).toBe(false)
  })
  it('a trail that follows a creek leads with the creek', () => {
    const along = rels.find((x) => x.basis === 'along' && byId.get(x.from)?.category === 'trail')!
    const r = real(along.from)
    expect(r.discoveries[0]).toMatchObject({ theme: 'creek', heading: 'Meet this creek', kind: 'nearby' })
    expect(r.discoveries[0].reason).toMatch(/^This trail follows .+ for about \d\.\d mi\.$/)
    expect(r.discoveries[0].vintage).toMatch(/^USGS, retrieved [A-Z][a-z]{2} \d{4}$/)
    expect(r.fireStation).toBeNull()
  })
  it('a creek place gets its watershed and trails, not "Meet this creek"', () => {
    const r = real('creek-swift-creek')
    expect(r.discoveries.some((d) => d.theme === 'creek')).toBe(false)
    expect(r.discoveries.length).toBeGreaterThan(0)
  })
  it('a watershed place lists a creek and a trail or park inside it', () => {
    const r = real('watershed-030202011001')
    expect(r.discoveries.every((d) => d.theme !== 'watershed')).toBe(true)
    expect(r.discoveries.length).toBeGreaterThan(0)
  })
  it('a place with no relationships renders nothing', () => {
    const lone = catalog.places.find((p) => !index.has(p.id))!
    expect(real(lone.id)).toMatchObject({ discoveries: [], fireStation: null, notes: [], visible: false })
  })
  it('every discovery in the release is membership/distance only, with a visible kind', () => {
    for (const p of catalog.places) {
      const r = real(p.id)
      expect(r.discoveries.length).toBeLessThanOrEqual(3)
      for (const d of r.discoveries) {
        expect(`${d.heading} ${d.reason} ${d.kindLabel}`).not.toMatch(FORBIDDEN)
        expect(d.kindLabel).toMatch(/^(Inside|Curated|Nearby · )/)
        if (d.theme !== 'creek' && d.theme !== 'watershed') expect(d.vintage).toBeUndefined()
      }
      if (r.fireStation) expect(r.fireStation.text).not.toMatch(FORBIDDEN)
    }
  })
})

describe('discoverFor selection rules', () => {
  const mk = (id: string, name: string, category: Place['category'], extra: Partial<Place> = {}): Place =>
    ({ id, name, aliases: [], category, theme: CATEGORY_THEME[category], municipality: 'X', centroid: [-78.8, 35.8], description: '', sourceIds: ['s'], ...extra }) as Place
  const places = new Map<string, Place>(
    [
      mk('park', 'Test Park', 'park'),
      mk('creek', 'Test Creek', 'water'),
      mk('ws', 'Upper Test Creek watershed', 'water', { description: 'Part of the Neuse River Basin (HUC-8 Upper Neuse).' }),
      mk('t1', 'Alpha Trail', 'trail'),
      mk('t2', 'Beta Trail', 'trail'),
      mk('cur', 'Curated Spot', 'community' as Place['category']),
      mk('fs', 'Cary Fire Station 4', 'fire-station'),
    ].map((p) => [p.id, p]),
  )
  const idx = (r: object[]) => indexRelationships(parseRelationships({ relationships: r }))
  const full = idx([
    { from: 'creek', to: 'park', kind: 'contained' },
    { from: 'park', to: 'ws', kind: 'contained', basis: 'watershed' },
    { from: 't1', to: 'park', kind: 'contained' },
    { from: 'park', to: 't2', kind: 'nearby', distanceM: 300, basis: 'within-400m' },
    { from: 'park', to: 'cur', kind: 'curated' },
    { from: 'park', to: 'fs', kind: 'nearby', distanceM: 1448, basis: 'nearest' },
  ])
  const sources = [{ id: 's', name: 'Src', retrievedAt: '2026-11-08T15:40:24.853Z' }]

  it('priority creek, watershed, trail/park; curated only fills; max 3; fire station apart', () => {
    const r = discoverFor('park', full, places, sources)
    expect(r.discoveries.map((d) => d.theme)).toEqual(['creek', 'watershed', 'trail-park'])
    expect(r.discoveries[0]).toMatchObject({ heading: 'Meet this creek', reason: 'Test Creek runs through this park.', kindLabel: 'Inside', vintage: 'Src, retrieved Nov 2026' })
    expect(r.discoveries[1].reason).toBe('In the Upper Test Creek watershed · Neuse basin')
    expect(r.discoveries[2]).toMatchObject({ heading: 'Walk on', place: { id: 't1' }, reason: 'Alpha Trail runs through this park.' })
    expect(r.fireStation).toMatchObject({ text: 'Cary Fire Station 4 · 0.9 mi straight-line' })
  })
  it('curated is shown when there is room, and not padded otherwise', () => {
    const r = discoverFor('park', idx([{ from: 'park', to: 'cur', kind: 'curated' }]), places, sources)
    expect(r.discoveries).toHaveLength(1)
    expect(r.discoveries[0]).toMatchObject({ theme: 'curated', kind: 'curated', kindLabel: 'Curated' })
    expect(r.discoveries[0].vintage).toBeUndefined()
  })
  it('nearby uses the straight-line wording and ignores links beyond the within-400m rule', () => {
    const r = discoverFor('park', idx([{ from: 'park', to: 't2', kind: 'nearby', distanceM: 482, basis: 'within-400m' }, { from: 'park', to: 't1', kind: 'nearby', distanceM: 900, basis: 'nearest' }]), places, sources)
    expect(r.discoveries).toHaveLength(1)
    expect(r.discoveries[0]).toMatchObject({ heading: 'Nearby trail', reason: 'About 0.3 mi away, straight line.', kindLabel: 'Nearby · 0.3 mi straight-line' })
  })
  it('a fire-station-only park shows only the station line; nothing relevant shows nothing', () => {
    const r = discoverFor('park', idx([{ from: 'park', to: 'fs', kind: 'nearby', distanceM: 100, basis: 'nearest' }]), places, sources)
    expect(r.discoveries).toEqual([])
    expect(r.visible).toBe(true)
    expect(discoverFor('cur', idx([]), places, sources).visible).toBe(false)
  })
  it('no vintage when the source has no date', () => {
    expect(sourceVintage(places.get('ws')!, [{ id: 's', name: 'Src' }])).toBeUndefined()
  })
  it('a trail park says it is not determined when it has no watershed link', () => {
    expect(discoverFor('t1', idx([{ from: 't1', to: 'park', kind: 'contained' }]), places, sources).notes).toEqual(['Watershed not determined'])
  })
})
