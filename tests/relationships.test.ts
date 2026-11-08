import { describe, expect, it } from 'vitest'
import {
  connectionsFor,
  indexRelationships,
  parseRelationships,
} from '../src/features/places/relationships'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import type { Place } from '../src/types/place'

const place = (id: string, name = `Place ${id}`): Place => ({
  id,
  name,
  aliases: [],
  category: 'park',
  theme: CATEGORY_THEME.park,
  municipality: 'Example Town',
  centroid: [-78.8, 35.8],
  description: '',
  sourceIds: ['s'],
})
const byId = (...ids: string[]) => new Map(ids.map((id) => [id, place(id)]))

describe('parseRelationships', () => {
  it('drops malformed records and unknown kinds', () => {
    const rels = parseRelationships({
      relationships: [
        { from: 'a', to: 'b', kind: 'nearby', distanceM: 100, basis: 'nearest' },
        { from: 'a', to: 'c', kind: 'weird' },
        { from: 'a', kind: 'nearby' },
        { from: 'a', to: 'a', kind: 'curated' },
        'nope',
        { from: 'a', to: 'd', kind: 'curated', distanceM: 'x', basis: 'bogus' },
      ],
    })
    expect(rels).toEqual([
      { from: 'a', to: 'b', kind: 'nearby', distanceM: 100, basis: 'nearest' },
      { from: 'a', to: 'd', kind: 'curated' },
    ])
    expect(parseRelationships(null)).toEqual([])
    expect(parseRelationships({ relationships: 3 })).toEqual([])
  })
})

describe('connectionsFor', () => {
  it('indexes both directions', () => {
    const index = indexRelationships([{ from: 'a', to: 'b', kind: 'nearby', distanceM: 50 }])
    expect(connectionsFor('a', index, byId('a', 'b')).map((c) => c.place.id)).toEqual(['b'])
    expect(connectionsFor('b', index, byId('a', 'b')).map((c) => c.place.id)).toEqual(['a'])
  })

  it('orders contained, curated, nearby (closest first) and limits to 3', () => {
    const index = indexRelationships([
      { from: 'x', to: 'n2', kind: 'nearby', distanceM: 300 },
      { from: 'x', to: 'n1', kind: 'nearby', distanceM: 100 },
      { from: 'x', to: 'cur', kind: 'curated' },
      { from: 'x', to: 'park', kind: 'contained' },
    ])
    const ids = connectionsFor('x', index, byId('x', 'n1', 'n2', 'cur', 'park')).map((c) => c.place.id)
    expect(ids).toEqual(['park', 'cur', 'n1'])
  })

  it('labels contained in both directions', () => {
    const index = indexRelationships([{ from: 't', to: 'p', kind: 'contained' }])
    const places = new Map([['t', place('t', 'Trail')], ['p', place('p', 'Park')]])
    expect(connectionsFor('t', index, places)[0].label).toBe('Runs through Park')
    expect(connectionsFor('p', index, places)[0].label).toBe('Trail runs through this park')
  })

  it('skips a connection to a place with the same name (same thing in another dataset)', () => {
    const index = indexRelationships([
      { from: 't', to: 'p', kind: 'contained' },
      { from: 't', to: 'q', kind: 'contained' },
    ])
    const places = new Map([
      ['t', place('t', 'Black Creek Greenway')],
      ['p', place('p', 'Black  creek greenway')],
      ['q', place('q', 'Bond Park')],
    ])
    expect(connectionsFor('t', index, places).map((c) => c.place.id)).toEqual(['q'])
  })

  it('formats nearby distance and nearest prefix', () => {
    const index = indexRelationships([
      { from: 'a', to: 'b', kind: 'nearby', distanceM: 482, basis: 'within-400m' },
      { from: 'a', to: 'c', kind: 'nearby', distanceM: 600, basis: 'nearest' },
      { from: 'a', to: 'd', kind: 'nearby', distanceM: 10 },
    ])
    const labels = connectionsFor('a', index, byId('a', 'b', 'c', 'd')).map((c) => c.label)
    expect(labels).toEqual([
      'About 0.1 mi away (straight line)',
      'About 0.3 mi away (straight line)',
      'Closest place: About 0.4 mi away (straight line)',
    ])
  })

  it('labels curated and skips unknown ids', () => {
    const index = indexRelationships([
      { from: 'a', to: 'ghost', kind: 'contained' },
      { from: 'a', to: 'b', kind: 'curated' },
    ])
    const out = connectionsFor('a', index, byId('a', 'b'))
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Connected (curated)')
  })
})
