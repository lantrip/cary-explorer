import { describe, expect, it } from 'vitest'
import { ALL_THEME_IDS, parseUrlState, serializeUrlState, type UrlState } from '../src/lib/urlState'

const base: UrlState = { place: null, themes: [...ALL_THEME_IDS], view: 'map', q: '', town: null, map: null }

describe('serializeUrlState', () => {
  it('omits defaults', () => {
    expect(serializeUrlState(base)).toBe('')
  })
  it('uses a stable key order and rounding', () => {
    const s = serializeUrlState({
      place: 'dorothy-park',
      themes: ['water', 'history'],
      view: 'list',
      q: 'duck pond',
      town: 'holly-springs',
      map: { zoom: 14.123456, lat: 35.8123456, lon: -78.7654321 },
    })
    expect(s).toBe('?place=dorothy-park&themes=history,water&view=list&q=duck%20pond&town=holly-springs&map=14.12/35.81235/-78.76543')
  })
  it('writes themes=none when none are on', () => {
    expect(serializeUrlState({ ...base, themes: [] })).toBe('?themes=none')
  })
  it('omits the default camera', () => {
    expect(serializeUrlState({ ...base, map: { zoom: 12, lat: 35.7915, lon: -78.7811 } })).toBe('')
  })
})

describe('round trip', () => {
  it('parses what it serialises', () => {
    const state: UrlState = {
      place: 'a-1',
      themes: ['parks-trails', 'art-community'],
      view: 'list',
      q: 'café & trails?',
      town: 'unincorporated-wake',
      map: { zoom: 15.5, lat: 35.8, lon: -78.8 },
    }
    expect(parseUrlState(serializeUrlState(state))).toEqual({
      place: 'a-1',
      themes: ['parks-trails', 'art-community'],
      view: 'list',
      q: 'café & trails?',
      town: 'unincorporated-wake',
      map: { zoom: 15.5, lat: 35.8, lon: -78.8 },
    })
  })
  it('round-trips themes=none', () => {
    expect(parseUrlState(serializeUrlState({ ...base, themes: [] })).themes).toEqual([])
  })
})

describe('parseUrlState validation', () => {
  it('returns nothing for empty or garbage input', () => {
    expect(parseUrlState('')).toEqual({})
    expect(parseUrlState('?%%%&=&&==x')).toEqual({})
    expect(parseUrlState('???')).toEqual({})
    expect(parseUrlState('?place=%E0%A4%A&q=%')).toEqual({ q: '%' })
  })
  it('drops unknown themes, and treats all-unknown as absent', () => {
    expect(parseUrlState('?themes=water,bogus').themes).toEqual(['water'])
    expect(parseUrlState('?themes=bogus,nope').themes).toBeUndefined()
  })
  it('only accepts map or list for view', () => {
    expect(parseUrlState('?view=list').view).toBe('list')
    expect(parseUrlState('?view=grid').view).toBeUndefined()
  })
  it('validates place ids', () => {
    expect(parseUrlState('?place=ok-id-1').place).toBe('ok-id-1')
    expect(parseUrlState('?place=Bad_Id').place).toBeUndefined()
    expect(parseUrlState('?place=../x').place).toBeUndefined()
    expect(parseUrlState(`?place=${'a'.repeat(121)}`).place).toBeUndefined()
    expect(parseUrlState('?place=%3Cscript%3E').place).toBeUndefined()
  })
  it('trims and caps q', () => {
    expect(parseUrlState('?q=%20%20hi%20%20').q).toBe('hi')
    expect(parseUrlState(`?q=${'x'.repeat(5000)}`)).toEqual({})
    expect(parseUrlState(`?q=${'x'.repeat(300)}`).q).toHaveLength(200)
    expect(parseUrlState('?q=%20').q).toBeUndefined()
  })
  it('uses the first of duplicate keys', () => {
    expect(parseUrlState('?view=list&view=map&place=a&place=b')).toMatchObject({ view: 'list', place: 'a' })
  })
  it('clamps zoom and ignores out-of-box cameras', () => {
    expect(parseUrlState('?map=3/35.8/-78.8').map?.zoom).toBe(8)
    expect(parseUrlState('?map=99/35.8/-78.8').map?.zoom).toBe(20)
    expect(parseUrlState('?map=12/10/-78.8').map).toBeUndefined()
    expect(parseUrlState('?map=12/35.8/-120').map).toBeUndefined()
    expect(parseUrlState('?map=12/35.8').map).toBeUndefined()
    expect(parseUrlState('?map=a/b/c').map).toBeUndefined()
    expect(parseUrlState('?map=12/35.8/-78.8/1').map).toBeUndefined()
    expect(parseUrlState('?map=1e3/35.8/-78.8').map).toBeUndefined()
    expect(parseUrlState('?map=NaN/Infinity/-Infinity').map).toBeUndefined()
  })
  it('never throws on huge or encoded junk', () => {
    const junk = ['%00', '%FF%FE', 'a'.repeat(100000), `?q=${'%41'.repeat(20000)}`, '?themes=' + ','.repeat(10000), '?map=' + '/'.repeat(5000)]
    for (const j of junk) expect(() => parseUrlState(j)).not.toThrow()
  })
})

describe('town', () => {
  it('omits a null town and writes a slug', () => {
    expect(serializeUrlState(base)).toBe('')
    expect(serializeUrlState({ ...base, town: 'apex' })).toBe('?town=apex')
  })
  it('round-trips every slug and ignores unknown ones', () => {
    expect(parseUrlState('?town=holly-springs').town).toBe('holly-springs')
    expect(parseUrlState('?town=atlantis').town).toBeUndefined()
    expect(parseUrlState('?town=Holly%20Springs').town).toBeUndefined()
    expect(serializeUrlState({ ...base, town: 'atlantis' })).toBe('')
  })
})

describe('about param', () => {
  it('serialises about=1 last and omits it when closed', () => {
    expect(serializeUrlState({ ...base, about: true })).toBe('?about=1')
    expect(serializeUrlState({ ...base, about: false })).toBe('')
    expect(serializeUrlState({ ...base, place: 'dorothy-park', view: 'list', about: true })).toBe('?place=dorothy-park&view=list&about=1')
  })
  it('round-trips and keeps the other params', () => {
    const state: UrlState = {
      ...base,
      place: 'dorothy-park',
      themes: ['water'],
      q: 'duck',
      town: 'holly-springs',
      map: { zoom: 14, lat: 35.8, lon: -78.7 },
      about: true,
    }
    const search = serializeUrlState(state)
    expect(search).toContain('about=1')
    const parsed = parseUrlState(search)
    expect(parsed).toMatchObject({ about: true, place: 'dorothy-park', themes: ['water'], q: 'duck', town: 'holly-springs' })
    const again: UrlState = {
      place: parsed.place ?? null,
      themes: parsed.themes ?? base.themes,
      view: parsed.view ?? 'map',
      q: parsed.q ?? '',
      town: parsed.town ?? null,
      map: parsed.map ?? null,
      about: parsed.about,
    }
    expect(serializeUrlState(again)).toBe(search)
  })
  it('only accepts about=1', () => {
    expect(parseUrlState('?about=1').about).toBe(true)
    for (const v of ['0', 'true', '', 'yes']) expect(parseUrlState(`?about=${v}`).about).toBeUndefined()
    expect(parseUrlState('').about).toBeUndefined()
  })
})
