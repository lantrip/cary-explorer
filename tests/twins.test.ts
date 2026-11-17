import { describe, expect, it } from 'vitest'
import { CONTAIN_TOL_M, distanceToPolygonsM, findContainedTwin } from '../pipeline/lib/twins.mjs'

// A square park about 222 m on a side near Cary: lon -78.80 to -78.798, lat 35.80 to 35.802.
const park = [[[-78.8, 35.8], [-78.798, 35.8], [-78.798, 35.802], [-78.8, 35.802], [-78.8, 35.8]]]
const mLat = 111320
const names = (...n: string[]) => new Set(n)
const candidates = [
  { id: 'cary-park-a', names: names('lake park'), polygons: [park] },
  { id: 'cary-greenway-lake-park', names: names('lake park') },
]

describe('distanceToPolygonsM', () => {
  it('is 0 inside and measures to the nearest edge outside', () => {
    expect(distanceToPolygonsM([-78.799, 35.801], [park])).toBe(0)
    const d = distanceToPolygonsM([-78.799, 35.8 - 30 / mLat], [park])
    expect(d).toBeGreaterThan(29)
    expect(d).toBeLessThan(31)
  })
  it('treats a hole as outside', () => {
    const hole = [[-78.7995, 35.8005], [-78.7985, 35.8005], [-78.7985, 35.8015], [-78.7995, 35.8015], [-78.7995, 35.8005]]
    expect(distanceToPolygonsM([-78.799, 35.801], [[park[0], hole]])).toBeGreaterThan(0)
  })
})

describe('findContainedTwin (name match plus containment)', () => {
  it('matches a same-named point inside the polygon', () => {
    const hit = findContainedTwin('lake park', [-78.799, 35.801], candidates)
    expect(hit?.candidate.id).toBe('cary-park-a')
    expect(hit?.distanceM).toBe(0)
  })
  it('matches within the tolerance and not beyond it', () => {
    expect(CONTAIN_TOL_M).toBe(50)
    expect(findContainedTwin('lake park', [-78.799, 35.8 - 40 / mLat], candidates)?.distanceM).toBe(40)
    expect(findContainedTwin('lake park', [-78.799, 35.8 - 60 / mLat], candidates)).toBeUndefined()
  })
  it('never merges on proximity alone: a same-named point 500 m away stays separate', () => {
    expect(findContainedTwin('lake park', [-78.799, 35.8 - 500 / mLat], candidates)).toBeUndefined()
  })
  it('needs the names to match even when the point is inside', () => {
    expect(findContainedTwin('other park', [-78.799, 35.801], candidates)).toBeUndefined()
  })
  it('never matches a candidate without polygons (a greenway)', () => {
    expect(findContainedTwin('lake park', [-78.799, 35.801], [candidates[1]])).toBeUndefined()
  })
})
