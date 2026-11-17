import { CATEGORY_ICON } from '../src/features/themes/icons'
import { CATEGORY_THEME, categoryLabel } from '../src/features/themes/themes'
import type { VisitField } from '../src/types/data-model'
import { describe, expect, it } from 'vitest'
import { selectCardFields, showsParkVisitFields } from '../src/features/places/placeDetails'

describe('which cards show the park visit fields', () => {
  it('hides the not-verified block for fire stations, watersheds and creeks (water)', () => {
    expect(showsParkVisitFields('fire-station')).toBe(false)
    expect(showsParkVisitFields('water')).toBe(false)
  })
  it('keeps it for parks, trails and every other category', () => {
    for (const c of ['park', 'trail', 'history', 'wildlife', 'art', 'community'] as const) expect(showsParkVisitFields(c), c).toBe(true)
  })
})

const field = (key: VisitField['key'], known: boolean): VisitField =>
  known ? { key, label: key, status: 'known', value: 'v', sourceId: 'wake-libraries', verifiedAt: '2026-11-01' } : { key, label: key, status: 'unknown' }

describe('library category', () => {
  it('has a theme, label and icon', () => {
    expect(CATEGORY_THEME.library).toBe('art-community')
    expect(categoryLabel.library).toBe('Library')
    expect(CATEGORY_ICON.library).toMatch(/^M/)
  })
  it('shows address and hours only, with no not-verified park block', () => {
    expect(showsParkVisitFields('library')).toBe(false)
    const fields = [field('address', true), field('hours', true), field('restrooms', false), field('wheelchair', false), field('playground', false), field('phone', true)]
    const out = selectCardFields('library', fields)
    expect(out.known.map((f) => f.key)).toEqual(['address', 'hours'])
    expect(out.unknown).toEqual([])
    expect(out.wheelchairUnknown).toBe(false)
  })
  it('keeps park, fire-station and water behaviour', () => {
    const fields = [field('address', true), field('restrooms', false), field('wheelchair', false)]
    const park = selectCardFields('park', fields)
    expect(park.unknown.map((f) => f.key)).toEqual(['restrooms'])
    expect(park.wheelchairUnknown).toBe(true)
    expect(selectCardFields('fire-station', fields).known.map((f) => f.key)).toEqual(['address'])
    expect(selectCardFields('water', fields).unknown).toEqual([])
  })
})
