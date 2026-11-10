import { describe, expect, it } from 'vitest'
import { fireStationDescription, fireStationName, groupFireStations } from '../pipeline/scripts/build-catalog.mjs'
import { validateRegistry } from '../pipeline/lib/snapshot-core.mjs'
import { buildVisitFields } from '../pipeline/lib/visit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { builtCatalog } from './helpers/builtCatalog'
import { computeStationLinks } from '../pipeline/lib/relationships.mjs'
import { createPlaceSearch } from '../src/features/search/searchIndex'
import { connectionsFor, indexRelationships, parseRelationships } from '../src/features/places/relationships'
import type { Place } from '../src/types/place'
import type { Position } from '../pipeline/lib/geo.mjs'

type Pt = [number, number]
const feat = (props: Record<string, unknown>, pt: Pt | null = [-78.75, 35.77]) => ({
  properties: props,
  geometry: pt ? { type: 'Point', coordinates: pt } : null,
})

describe('fireStationName', () => {
  it('turns "<prefix> #N" into "<prefix> Fire Station N" with that number', () => {
    expect(fireStationName('Cary #9')).toEqual({ name: 'Cary Fire Station 9', stationNumber: 9 })
    expect(fireStationName('Durham Highway #2')).toEqual({ name: 'Durham Highway Fire Station 2', stationNumber: 2 })
    expect(fireStationName('Fuquay-Varina  #04')).toEqual({ name: 'Fuquay-Varina Fire Station 4', stationNumber: 4 })
  })
  it('expands RFD to Raleigh', () => {
    expect(fireStationName('RFD #12')).toEqual({ name: 'Raleigh Fire Station 12', stationNumber: 12 })
  })
  it('never invents a number for labels without one', () => {
    expect(fireStationName('Hopkins')).toEqual({ name: 'Hopkins Fire Station' })
    expect(fireStationName('Creedmoor ')).toEqual({ name: 'Creedmoor Fire Station' })
    expect(fireStationName('Durham Fire 17')).toEqual({ name: 'Durham Fire 17' })
    expect(fireStationName('')).toBeUndefined()
    expect(fireStationName(null)).toBeUndefined()
  })
})

describe('groupFireStations', () => {
  it('dedupes on STATIONID (not ID) and keeps the first record', () => {
    const out = groupFireStations([
      feat({ ID: 4, STATIONID: 'AF1', LABEL: 'Apex #1', LOCATION: '210 N Salem St', CITY: 'Apex', AGENCY: 'FD' }),
      feat({ ID: 4, STATIONID: 'AF4', LABEL: 'Apex #4', LOCATION: '1615 E Williams St', CITY: 'Apex', AGENCY: 'FD' }),
      feat({ ID: 4, STATIONID: 'af1', LABEL: 'Apex #1 again', LOCATION: 'x', CITY: 'Apex', AGENCY: 'FD' }),
    ])
    expect(out.map((s) => s.stationId)).toEqual(['AF1', 'AF4'])
    expect(out[0].name).toBe('Apex Fire Station 1')
  })
  it('skips records with no STATIONID, no usable label or no point', () => {
    expect(groupFireStations([feat({ LABEL: 'Cary #1' }), feat({ STATIONID: 'X1', LABEL: ' ' }), feat({ STATIONID: 'X2', LABEL: 'Cary #2' }, null)])).toEqual([])
  })
  it('builds the address from LOCATION and CITY and the operator only for known AGENCY codes', () => {
    const [cf, fd] = groupFireStations([
      feat({ STATIONID: 'CF9', LABEL: 'Cary #9', LOCATION: '1427 Walnut St', CITY: 'Cary', AGENCY: 'CF' }),
      feat({ STATIONID: 'AF1', LABEL: 'Apex #1', LOCATION: '210 N Salem St', CITY: 'Apex', AGENCY: 'FD' }),
    ])
    expect(cf.address).toBe('1427 Walnut St, Cary')
    expect(fireStationDescription(cf)).toBe("Fire station operated by Cary Fire Department, at 1427 Walnut St, Cary (from Wake County's fire stations layer).")
    expect(fireStationDescription(fd)).toBe("Fire station, at 210 N Salem St, Apex (from Wake County's fire stations layer).")
  })
})

describe('fire station visit fields', () => {
  it('know only the address; the 13 other fields stay unknown', () => {
    const fields = buildVisitFields({ fire: { address: '1427 Walnut St, Cary' }, dates: { fire: '2026-10-15' } }) as { key: string; status: string; value?: string; sourceId?: string }[]
    const known = fields.filter((f) => f.status === 'known')
    expect(fields).toHaveLength(14)
    expect(known).toEqual([expect.objectContaining({ key: 'address', value: '1427 Walnut St, Cary', sourceId: 'wake-fire-stations' })])
  })
})

describe('wake-fire-stations source', () => {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../pipeline/sources.config.json', import.meta.url)), 'utf8')) as { id: string }[]
  it('is registered as an open CC BY 4.0 source and the registry validates', () => {
    const s = registry.find((r) => r.id === 'wake-fire-stations') as Record<string, unknown>
    expect(s).toMatchObject({ licence: 'CC-BY-4.0', licenceStatus: 'open', cadence: 'monthly', attribution: 'Wake County GIS (CC BY 4.0)', enabled: true })
    expect(validateRegistry(registry)).toEqual([])
  })
})

describe('fire stations in the built catalog (real data)', () => {
  const out = builtCatalog()
  type P = { id: string; name: string; category: string; municipality: string; coverage: string; address?: string; stationNumber?: number; sourceIds: string[]; amenities?: string[] }
  const stations = (out.catalog.places as P[]).filter((p) => p.category === 'fire-station')

  it('includes all 89 snapshot records exactly once, with unique ids and only in-scope coverage', () => {
    expect(stations).toHaveLength(89)
    expect(new Set(stations.map((p) => p.id)).size).toBe(89)
    for (const p of stations) {
      expect(p.id).toMatch(/^wake-fire-[a-z0-9]+$/)
      expect(['core', 'nearby']).toContain(p.coverage)
      expect(p.sourceIds).toEqual(['wake-fire-stations'])
      expect(p.amenities).toBeUndefined()
    }
  })

  it('has the 9 Cary stations with the right addresses', () => {
    const cary = stations.filter((p) => /^Cary Fire Station \d$/.test(p.name))
    expect(cary.map((p) => p.name).sort()).toEqual(Array.from({ length: 9 }, (_, i) => `Cary Fire Station ${i + 1}`))
    expect(cary.every((p) => p.municipality === 'Cary')).toBe(true)
    const byNum = Object.fromEntries(cary.map((p) => [p.stationNumber, p.address]))
    expect(byNum[9]).toBe('1427 Walnut St, Cary')
    expect(byNum[1]).toBe('1501 N Harrison Ave, Cary')
    expect(byNum[7]).toBe('6900 Carpenter Fire Station Rd, Cary')
    expect(cary.find((p) => p.stationNumber === 9)?.id).toBe('wake-fire-cf9')
  })

  it('gives address-only visit details; only parks link to stations, by nearest distance', () => {
    const d = out.details['wake-fire-cf9'] as { fields: { key: string; status: string }[] }
    expect(d.fields.filter((f) => f.status === 'known').map((f) => f.key)).toEqual(['address'])
    const rel = (out.relationships as { relationships: { from: string; to: string }[] }).relationships
    const withStation = rel.filter((r) => r.from.startsWith('wake-fire-') || r.to.startsWith('wake-fire-')) as unknown as { from: string; to: string; kind: string; basis: string; distanceM: number }[]
    expect(withStation.length).toBeGreaterThan(0)
    const parkIds = new Set((out.catalog.places as P[]).filter((p) => p.category === 'park').map((p) => p.id))
    const perPark = new Map<string, number>()
    for (const r of withStation) {
      expect(parkIds.has(r.from)).toBe(true)
      expect(r.to).toMatch(/^wake-fire-/)
      expect(r).toMatchObject({ kind: 'nearby', basis: 'nearest' })
      expect(Number.isInteger(r.distanceM)).toBe(true)
      expect(r.distanceM).toBeLessThanOrEqual(2000)
      perPark.set(r.from, (perPark.get(r.from) ?? 0) + 1)
    }
    expect([...perPark.values()].every((n) => n === 1)).toBe(true)
  })

  it('sets department only for CF and RF stations, and the website only for Raleigh', () => {
    type D = P & { department?: string; url?: string }
    for (const p of stations as D[]) {
      if (/^Cary Fire Station \d$/.test(p.name)) expect(p.department).toBe('Cary Fire Department')
      if (p.name.startsWith('Raleigh Fire Station')) {
        expect(p.department).toBe('Raleigh Fire Department')
        expect(p.url).toBe('https://raleighnc.gov/fire')
      } else expect(p.url).toBeUndefined()
      if (p.department) expect(['Cary Fire Department', 'Raleigh Fire Department']).toContain(p.department)
    }
    expect((stations as D[]).some((p) => !p.department)).toBe(true)
  })

  it('credits Wake County under CC BY 4.0', () => {
    const s = (out.catalog.sources as { id: string; license: string; name: string }[]).find((x) => x.id === 'wake-fire-stations')
    expect(s).toMatchObject({ name: 'Wake County', license: 'CC BY 4.0' })
  })
})

describe('station number is data for search, not a card row', () => {
  it('VisitInfo never renders stationNumber (it has no source line)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/features/places/VisitInfo.tsx', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/stationNumber/)
    expect(src).not.toMatch(/label="Station"/)
  })
  it('the catalog keeps stationNumber, which search uses', () => {
    const p = (builtCatalog().catalog.places as { id: string; stationNumber?: number }[]).find((x) => x.id === 'wake-fire-cf9')
    expect(p?.stationNumber).toBe(9)
  })
})

describe('two departments with a Station 7', () => {
  const mk = (id: string, name: string, department: string, municipality: string) =>
    ({ id, name, aliases: [], category: 'fire-station', theme: 'art-community', municipality, county: 'Wake', centroid: [-78.7, 35.8], description: '', stationNumber: 7, department, sourceIds: ['s'] }) as unknown as Place
  const places = [mk('a', 'Cary Fire Station 7', 'Cary Fire Department', 'Cary'), mk('b', 'Raleigh Fire Station 7', 'Raleigh Fire Department', 'Raleigh')]
  const search = createPlaceSearch(places)
  it('scopes "<town> station 7" to that department only', () => {
    expect(search('Cary Station 7').map((p) => p.id)).toEqual(['a'])
    expect(search('Raleigh Station 7').map((p) => p.id)).toEqual(['b'])
  })
})

describe('computeStationLinks', () => {
  const sq = (lon: number, lat: number): Position[][][] => [[[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]]]
  const park = (id: string, lon: number, lat: number) => ({ id, kind: 'park' as const, polygons: sq(lon, lat) })
  it('links a park to its nearest station within 2 km, once, with whole metres', () => {
    const links = computeStationLinks([park('p', -78.7, 35.8)], [
      { id: 's2', point: [-78.69, 35.8005] },
      { id: 's1', point: [-78.6975, 35.8005] },
    ])
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ from: 'p', to: 's1', kind: 'nearby', basis: 'nearest' })
    expect(Number.isInteger(links[0].distanceM)).toBe(true)
  })
  it('gives 0 m inside the park and nothing beyond 2 km', () => {
    expect(computeStationLinks([park('p', -78.7, 35.8)], [{ id: 's', point: [-78.6995, 35.8005] }])[0].distanceM).toBe(0)
    expect(computeStationLinks([park('p', -78.7, 35.8)], [{ id: 's', point: [-78.65, 35.8] }])).toEqual([])
  })
})

describe('park card station label', () => {
  const park = { id: 'p', name: 'Some Park', category: 'park' } as unknown as Place
  const stn = { id: 's', name: 'Cary Fire Station 7', category: 'fire-station' } as unknown as Place
  const byId = new Map([['p', park], ['s', stn]])
  const index = indexRelationships(parseRelationships({ relationships: [{ from: 'p', to: 's', kind: 'nearby', distanceM: 1931, basis: 'nearest' }] }))
  it('reads as distance only, both ways', () => {
    expect(connectionsFor('p', index, byId)[0].label).toBe('Nearest fire station · 1.2 mi straight-line')
    expect(connectionsFor('s', index, byId)[0].label).toBe('Nearby park · 1.2 mi straight-line')
  })
})

describe('fire station card safety note', () => {
  it('VisitInfo shows the 911 line for fire-station only', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/features/places/VisitInfo.tsx', import.meta.url)), 'utf8')
    expect(src).toMatch(/place\.category === 'fire-station'[\s\S]*Not for emergencies\. In an emergency, call 911\./)
  })
})

describe('fire station visit block', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/features/places/VisitInfo.tsx', import.meta.url)), 'utf8')
  it('hides the "Not verified" and wheelchair lines for fire stations only', () => {
    expect(src).toMatch(/\{split && place\.category !== 'fire-station' && \([\s\S]*Not verified:[\s\S]*Wheelchair access: Not verified/)
  })
})
