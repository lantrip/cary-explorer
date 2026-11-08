import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readRelease } from '../pipeline/lib/release.mjs'
import { parseCatalog } from '../src/features/places/catalog'
import {
  TOWNS,
  coverageFor,
  coverageText,
  filterPlaces,
  emptyThemeText,
  emptyThemes,
  isTownSlug,
  placesInTown,
  townByLabel,
  townBySlug,
  townNote,
} from '../src/features/towns/coverage'
import type { CategoryId, ThemeId } from '../src/types/place'

const CAT_THEME: Record<string, ThemeId> = { park: 'parks-trails', trail: 'parks-trails', history: 'history', water: 'water', art: 'art-community', community: 'art-community' }
const p = (municipality: string, theme: ThemeId, category: CategoryId = 'park') => ({ municipality, theme, category })
const c = (municipality: string, category: CategoryId) => p(municipality, CAT_THEME[category], category)
const ALL: ThemeId[] = ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community']

describe('towns', () => {
  it('lists 13 unique options', () => {
    expect(TOWNS).toHaveLength(13)
    expect(new Set(TOWNS.map((t) => t.slug)).size).toBe(13)
    expect(townBySlug('holly-springs')?.label).toBe('Holly Springs')
    expect(townByLabel('Unincorporated Wake County')?.slug).toBe('unincorporated-wake')
    expect(isTownSlug('nope')).toBe(false)
    expect(isTownSlug(null)).toBe(false)
  })
  it('derives status from the places a town has', () => {
    const places = [c('Apex', 'park'), c('Apex', 'trail'), c('Apex', 'water'), c('Zebulon', 'park')]
    const apex = coverageFor(places, 'apex')
    expect(apex?.themes).toEqual({ 'parks-trails': 'data', history: 'gap', 'birds-wildlife': 'gap', water: 'data', 'art-community': 'gap' })
    expect(apex?.trails).toBe('data')
    const zeb = coverageFor(places, 'zebulon')
    expect(zeb?.themes['parks-trails']).toBe('data')
    expect(zeb?.trails).toBe('gap')
    expect(coverageFor(places, 'wendell')?.themes['parks-trails']).toBe('gap')
    expect(coverageFor(places, null)).toBeNull()
    expect(coverageFor(places, 'nope')).toBeNull()
  })
  it('writes town notes from the counts, with no "complete" claims', () => {
    const places = [c('Cary', 'park'), c('Cary', 'park'), c('Cary', 'trail'), c('Cary', 'community'), c('Apex', 'park'), c('Zebulon', 'park')]
    const note = (slug: string | null) => townNote(slug, coverageFor(places, slug))
    expect(note(null)).toBeNull()
    expect(note('cary')).toBe("Parks: 2 \u00b7 Trails: 1 \u00b7 Art & community: 1 in this town's data.")
    expect(note('apex')).toBe(
      "Parks: 1 \u00b7 Trails: 0 in this town's data. Part of Apex is in Chatham County; places there aren't counted here and show only if they're near Wake.",
    )
    expect(note('zebulon')).toBe("Parks: 1 \u00b7 Trails: 0 in this town's data.")
    expect(note('unincorporated-wake')).toBe("Parks: 0 \u00b7 Trails: 0 in this town's data. Wake County outside town limits.")
    expect(townNote('morrisville', null)).toBe("Part of Morrisville is in Durham County; places there aren't counted here and show only if they're near Wake.")
    expect(townNote('zebulon', null)).toBeNull()
    for (const t of TOWNS) expect(townNote(t.slug, coverageFor(places, t.slug))).not.toMatch(/complete|whole town/i)
    expect(townNote('wake-forest', null)).toContain('Franklin County')
    expect(townNote('raleigh', null)).toContain('Durham County')
  })
})

describe('filtering', () => {
  const places = [p('Cary', 'water', 'water'), p('Apex', 'water', 'water'), p('Apex', 'history', 'history'), p('Zebulon', 'water', 'water')]
  it('filters by theme and town', () => {
    expect(filterPlaces(places, ALL, null)).toHaveLength(4)
    expect(filterPlaces(places, ALL, 'apex')).toHaveLength(2)
    expect(filterPlaces(places, ['water'], 'apex')).toEqual([p('Apex', 'water', 'water')])
    expect(filterPlaces(places, ALL, 'unknown')).toHaveLength(4)
    expect(placesInTown(places, 'cary')).toEqual([p('Cary', 'water', 'water')])
  })
  it('reports every active theme with no places in the town', () => {
    expect(emptyThemes(places, ALL, null)).toEqual([])
    expect(emptyThemes(places, ['art-community'], 'zebulon')).toEqual(['art-community'])
    expect(emptyThemes(places, ['history', 'art-community'], 'zebulon')).toEqual(['history', 'art-community'])
    expect(emptyThemes([...places, p('Zebulon', 'art-community', 'art')], ['art-community'], 'zebulon')).toEqual([])
  })
  it('words the empty-theme message', () => {
    expect(emptyThemeText('History', 'Raleigh')).toBe("History places for Raleigh aren't in the app yet.")
  })
})

describe('coverage label', () => {
  it('only labels nearby and outside', () => {
    expect(coverageText('nearby')).toBe('Nearby, outside core area')
    expect(coverageText('outside')).toBe('Outside coverage area')
    expect(coverageText('core')).toBeNull()
    expect(coverageText(undefined)).toBeNull()
  })
})

describe('published catalog', () => {
  const release = readRelease(new URL('../public/data', import.meta.url).pathname)
  const { places } = parseCatalog(JSON.parse(readFileSync(release.catalogPath, 'utf8')))

  it('shows Wendell and Zebulon as a trails gap, with parks still data', () => {
    for (const slug of ['wendell', 'zebulon']) {
      const cov = coverageFor(places, slug)
      expect(cov?.trails, slug).toBe('gap')
      expect(cov?.themes['parks-trails'], slug).toBe('data')
      expect(townNote(slug, cov)).toContain('Trails: 0')
    }
    expect(coverageFor(places, 'apex')?.trails).toBe('data')
  })
  it('agrees with the filter for every town and theme', () => {
    for (const t of TOWNS) {
      const cov = coverageFor(places, t.slug)
      for (const th of ALL) expect(cov?.themes[th] === 'data', `${t.slug} ${th}`).toBe(filterPlaces(places, [th], t.slug).length > 0)
    }
  })
})
