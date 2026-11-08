import { describe, expect, it } from 'vitest'
import {
  NEAR_RULE_NOTE,
  intentLabel,
  nearbyOfCategory,
  noneLinkedText,
  parseIntent,
  planCategoryInTown,
  type Intent,
  type IntentContext,
} from '../src/features/search/intent'
import { indexRelationships } from '../src/features/places/relationships'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import { TOWNS } from '../src/features/towns/coverage'
import {
  normalizeOverrides,
  reconcileOverrides,
  resolveLayers,
  selectedCategories,
  type LayerOverrides,
} from '../src/features/themes/layerSelection'
import type { CategoryId, Place, ThemeId } from '../src/types/place'

type TownIntent = Extract<Intent, { kind: 'category-in-town' }>

const mk = (id: string, name: string, category: CategoryId, aliases: string[] = []): Place => ({
  id,
  name,
  aliases,
  category,
  theme: CATEGORY_THEME[category],
  municipality: 'Cary',
  centroid: [-78.8, 35.8],
  description: '',
  sourceIds: ['s'],
})

const bond = mk('bond', 'Bond Park', 'park')
const wc = mk('wc', 'Walnut Creek Trail', 'trail')
const lake = mk('lake', 'Lake Trail', 'trail')
const fire = mk('fire', 'Fire Station 4', 'fire-station')
const dupA = mk('d1', 'Black Creek Greenway', 'trail')
const dupB = mk('d2', 'Black Creek Greenway', 'park')
const places = [bond, wc, lake, fire, dupA, dupB]
const byId = new Map(places.map((p) => [p.id, p]))
const ctx: IntentContext = {
  towns: TOWNS,
  categories: Object.keys(CATEGORY_THEME) as CategoryId[],
  places,
}

describe('parseIntent: category in town', () => {
  it('parses plural and singular, any case and punctuation', () => {
    for (const text of ['parks in Apex', 'Park in apex', 'PARKS, in Apex!', '  parks   in   apex  ']) {
      expect(parseIntent(text, ctx)).toEqual({ kind: 'category-in-town', categoryIds: ['park'], townSlug: 'apex' })
    }
  })
  it('maps trails, trail and greenways to trail', () => {
    for (const w of ['trails', 'trail', 'greenway', 'Greenways']) {
      expect(parseIntent(`${w} in Cary`, ctx)).toEqual({ kind: 'category-in-town', categoryIds: ['trail'], townSlug: 'cary' })
    }
  })
  it('accepts multi-word towns and slugs', () => {
    expect(parseIntent('parks in Holly Springs', ctx)).toMatchObject({ townSlug: 'holly-springs' })
    expect(parseIntent('parks in fuquay-varina', ctx)).toMatchObject({ townSlug: 'fuquay-varina' })
    expect(parseIntent('parks in the town of Apex', ctx)).toMatchObject({ townSlug: 'apex' })
  })
  it('treats unincorporated variants as the unincorporated town', () => {
    for (const t of ['Unincorporated Wake', 'unincorporated', 'Unincorporated Wake County']) {
      expect(parseIntent(`parks in ${t}`, ctx)).toMatchObject({ townSlug: 'unincorporated-wake' })
    }
  })
  it('accepts several categories and a leading verb', () => {
    expect(parseIntent('show me parks and trails in Cary', ctx)).toEqual({
      kind: 'category-in-town',
      categoryIds: ['park', 'trail'],
      townSlug: 'cary',
    })
  })
  it('returns null for a town not in the list', () => {
    expect(parseIntent('parks in Durham', ctx)).toBeNull()
    expect(parseIntent('parks in Cary Apex', ctx)).toBeNull()
  })
  it('returns null for an unknown category or an amenity', () => {
    expect(parseIntent('breweries in Cary', ctx)).toBeNull()
    expect(parseIntent('playgrounds in Cary', ctx)).toBeNull()
    expect(parseIntent('parks and breweries in Cary', ctx)).toBeNull()
  })
  it('respects the allowed category list', () => {
    expect(parseIntent('trails in Cary', { ...ctx, categories: ['park'] })).toBeNull()
  })
  it('returns null for plain names and other text', () => {
    for (const t of ['', 'Bond Park', 'parks', 'in Apex', 'parks Apex']) expect(parseIntent(t, ctx)).toBeNull()
  })
})

describe('parseIntent: category near place', () => {
  it('matches an exact place name', () => {
    expect(parseIntent('Trails near Walnut Creek Trail', ctx)).toEqual({
      kind: 'category-near-place',
      categoryIds: ['trail'],
      placeId: 'wc',
    })
  })
  it('treats "this" and "the" as optional', () => {
    for (const t of ['trails near the Bond Park', 'trails near this Bond Park', 'trails near Bond Park', 'trails near bond park!']) {
      expect(parseIntent(t, ctx)).toMatchObject({ kind: 'category-near-place', placeId: 'bond' })
    }
  })
  it('accepts a type word before the name', () => {
    expect(parseIntent('trails near this park Bond Park', ctx)).toMatchObject({ placeId: 'bond' })
    expect(parseIntent('parks near this trail Lake Trail', ctx)).toMatchObject({ placeId: 'lake' })
  })
  it('matches aliases and ignores apostrophes', () => {
    const aliased = [mk('x', 'Bond Park', 'park', ["Bond's Lake Park"])]
    expect(parseIntent('trails near Bonds Lake Park', { ...ctx, places: aliased })).toMatchObject({ placeId: 'x' })
  })
  it('returns null for a low-confidence match', () => {
    expect(parseIntent('trails near Bond', ctx)).toBeNull()
    expect(parseIntent('trails near Bnd Prk', ctx)).toBeNull()
    expect(parseIntent('trails near Walnut Creek', ctx)).toBeNull()
    expect(parseIntent('trails near Nowhere Place', ctx)).toBeNull()
  })
  it('returns null when two places share the name', () => {
    expect(parseIntent('parks near Black Creek Greenway', ctx)).toBeNull()
  })
  it('returns null for an unknown category', () => {
    expect(parseIntent('playgrounds near Bond Park', ctx)).toBeNull()
  })
})

describe('intentLabel', () => {
  it('writes the suggestion row text', () => {
    expect(intentLabel({ kind: 'category-in-town', categoryIds: ['park'], townSlug: 'apex' }, TOWNS, byId)).toBe('Show parks in Apex')
    expect(intentLabel({ kind: 'category-near-place', categoryIds: ['trail'], placeId: 'wc' }, TOWNS, byId)).toBe(
      'Trails near Walnut Creek Trail',
    )
    expect(intentLabel({ kind: 'category-near-place', categoryIds: ['trail'], placeId: 'gone' }, TOWNS, byId)).toBeNull()
  })
})

describe('planCategoryInTown', () => {
  const all = ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community'] as const
  const townIntent = (categoryIds: CategoryId[], townSlug: string): TownIntent => ({ kind: 'category-in-town', categoryIds, townSlug })
  // Applies a plan the way the store setters do and returns the visible categories.
  const visible = (plan: ReturnType<typeof planCategoryInTown>, themes: readonly ThemeId[], overrides: LayerOverrides) => {
    const next = plan.themesChanged ? reconcileOverrides(themes, plan.themes, overrides) : overrides
    const withChanges = normalizeOverrides(
      plan.themes,
      plan.layerChanges.reduce<LayerOverrides>((o, c) => ({ ...o, [c.id]: c.on }), next),
    )
    return selectedCategories(resolveLayers(plan.themes, withChanges))
  }

  it('"parks in Apex" shows only parks', () => {
    const plan = planCategoryInTown(townIntent(['park'], 'apex'), all, {})
    expect(plan.town).toBe('apex')
    expect(plan.themes).toEqual(['parks-trails'])
    expect(visible(plan, all, {})).toEqual(['park'])
  })
  it('"parks and trails in Cary" keeps both', () => {
    const plan = planCategoryInTown(townIntent(['park', 'trail'], 'cary'), all, {})
    expect(plan.themes).toEqual(['parks-trails'])
    expect(visible(plan, all, {})).toEqual(['park', 'trail'])
  })
  it('turns a requested layer on when it was off, and drops other themes', () => {
    const overrides: LayerOverrides = { park: false }
    expect(visible(planCategoryInTown(townIntent(['park'], 'apex'), ['history'], overrides), ['history'], overrides)).toEqual(['park'])
  })
  it('turns on a layer that is off by default', () => {
    const plan = planCategoryInTown(townIntent(['fire-station'], 'cary'), all, {})
    expect(plan.themes).toEqual(['art-community'])
    expect(visible(plan, all, {})).toEqual(['fire-station'])
  })
  it('leaves geometry layers alone', () => {
    const plan = planCategoryInTown(townIntent(['park'], 'apex'), all, {})
    expect(plan.layerChanges).toEqual([{ id: 'trail', on: false }])
  })
})

describe('nearbyOfCategory', () => {
  const index = indexRelationships([
    { from: 'wc', to: 'bond', kind: 'contained' },
    { from: 'bond', to: 'lake', kind: 'nearby', distanceM: 300, basis: 'within-400m' },
    { from: 'bond', to: 'fire', kind: 'nearby', distanceM: 100, basis: 'within-400m' },
    { from: 'bond', to: 'd2', kind: 'nearby', distanceM: 1500, basis: 'nearest' },
  ])
  it('keeps only the wanted category, in relationship order with labels', () => {
    const out = nearbyOfCategory('bond', ['trail'], index, byId)
    expect(out.map((c) => c.place.id)).toEqual(['wc', 'lake'])
    expect(out[0].label).toBe('Walnut Creek Trail runs through this park')
    expect(out[1].label).toBe('About 0.2 mi away (straight line)')
  })
  it('supports several categories and labels the closest-place basis', () => {
    const out = nearbyOfCategory('bond', ['fire-station', 'park'], index, byId)
    expect(out.map((c) => c.place.id)).toEqual(['fire', 'd2'])
    expect(out[1].label).toBe('Closest place: About 0.9 mi away (straight line)')
  })
  it('is empty when nothing of that category is linked', () => {
    expect(nearbyOfCategory('bond', ['water'], index, byId)).toEqual([])
    expect(noneLinkedText(['trail'], 'Bond Park')).toBe('No trails are linked to Bond Park in our data.')
  })
  it('lists same-named places once, keeping the first in sort order', () => {
    const a = mk('w1', 'White Oak Creek Greenway', 'trail')
    const b = mk('w2', 'White Oak Creek Greenway', 'trail')
    const map = new Map([...byId, ['w1', a], ['w2', b]])
    const idx = indexRelationships([
      { from: 'bond', to: 'w2', kind: 'nearby', distanceM: 300, basis: 'within-400m' },
      { from: 'bond', to: 'w1', kind: 'nearby', distanceM: 100, basis: 'within-400m' },
    ])
    expect(nearbyOfCategory('bond', ['trail'], idx, map).map((c) => c.place.id)).toEqual(['w1'])
  })
  it('states the near rule', () => {
    expect(NEAR_RULE_NOTE).toBe('Near = within 400 m in a straight line, or the closest place within 2 km.')
  })
})
