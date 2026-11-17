import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { groupLibraries, libraryDescription, libraryHours } from '../pipeline/lib/libraries.mjs'
import { readRelease } from '../pipeline/lib/release.mjs'
import { buildVisitFields } from '../pipeline/lib/visit.mjs'

const feat = (props: Record<string, unknown>, pt: [number, number] | null = [-78.78, 35.79]) => ({
  properties: props,
  geometry: pt ? { type: 'Point', coordinates: pt } : null,
})

describe('libraryHours', () => {
  it('joins the days the source states', () => {
    expect(libraryHours({ M_T: '9 a.m. - 9 p.m.', FRI: '9 a.m. - 6 p.m.', SAT: '9 a.m. - 6 p.m.', SUN: '1 p.m. - 5 p.m.' })).toBe(
      'Mon–Thu 9 a.m. - 9 p.m. · Fri 9 a.m. - 6 p.m. · Sat 9 a.m. - 6 p.m. · Sun 1 p.m. - 5 p.m.',
    )
  })
  it('omits blank days and is undefined when all are blank', () => {
    expect(libraryHours({ M_T: '10 a.m. - 6 p.m.', FRI: ' ', SAT: null, SUN: '' })).toBe('Mon–Thu 10 a.m. - 6 p.m.')
    expect(libraryHours({ M_T: '', FRI: null })).toBeUndefined()
  })
})

describe('libraryDescription', () => {
  it('uses the branch type', () => {
    expect(libraryDescription('Regional')).toBe('Regional branch of Wake County Public Libraries.')
    expect(libraryDescription(null)).toBe('Branch of Wake County Public Libraries.')
  })
})

describe('groupLibraries', () => {
  const base = { NAME: 'Cary Community Library', CODE: 'CAR', LABEL: 'Cary', FAC_ADDRESS: '310 S Academy St', CITY: 'Cary', TYPE: 'Community', STATUS: null, M_T: '9 a.m. - 9 p.m.' }
  it('builds name, alias, address and hours', () => {
    const { libraries, skipped } = groupLibraries([feat(base)])
    expect(skipped).toBe(0)
    expect(libraries[0]).toMatchObject({ code: 'CAR', name: 'Cary Community Library', aliases: ['Cary library'], address: '310 S Academy St, Cary, NC', hours: 'Mon–Thu 9 a.m. - 9 p.m.' })
  })
  it('skips and counts any feature with a non-empty STATUS', () => {
    const { libraries, skipped } = groupLibraries([feat(base), feat({ ...base, CODE: 'XYZ', STATUS: 'Temporarily closed' })])
    expect(libraries.map((l: { code: string }) => l.code)).toEqual(['CAR'])
    expect(skipped).toBe(1)
  })
  it('drops duplicates by CODE and features without a point', () => {
    expect(groupLibraries([feat(base), feat(base), feat({ ...base, CODE: 'NOP' }, null)]).libraries).toHaveLength(1)
  })
  it('does not alias when the label already equals the name', () => {
    expect(groupLibraries([feat({ ...base, NAME: 'Cary Library', LABEL: 'Cary' })]).libraries[0].aliases).toEqual([])
  })
})

describe('library visit fields', () => {
  it('knows address and hours from wake-libraries and leaves the rest unknown', () => {
    const fields = buildVisitFields({ library: { address: '1 Main St, Cary, NC', hours: 'Mon–Thu 9 a.m. - 9 p.m.' }, dates: { library: '2026-11-16' } })
    const by = Object.fromEntries(fields.map((f: { key: string }) => [f.key, f]))
    expect(by.address).toMatchObject({ status: 'known', sourceId: 'wake-libraries', verifiedAt: '2026-11-16' })
    expect(by.hours).toMatchObject({ status: 'known', value: 'Mon–Thu 9 a.m. - 9 p.m.', sourceId: 'wake-libraries' })
    expect(fields.filter((f: { status: string }) => f.status === 'known')).toHaveLength(2)
  })
  it('keeps hours unknown when there are none', () => {
    const fields = buildVisitFields({ library: { address: '1 Main St, Cary, NC' }, dates: { library: '2026-11-16' } })
    expect(fields.find((f: { key: string }) => f.key === 'hours')?.status).toBe('unknown')
  })
})

describe('published libraries', () => {
  const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))
  const catalog = JSON.parse(readFileSync(release.catalogPath, 'utf8')) as {
    places: { id: string; name: string; aliases?: string[]; category: string; coverage: string; sourceIds: string[] }[]
    sources: { id: string; license: string; attribution?: string }[]
  }
  const libs = catalog.places.filter((p) => p.category === 'library')
  const detail = (id: string) =>
    JSON.parse(readFileSync(join(release.placesDir, `${id}.json`), 'utf8')) as { fields: { key: string; status: string; value?: string; sourceId?: string }[] }

  it('publishes at least 20 libraries with unique wake-library- ids', () => {
    expect(libs.length).toBeGreaterThanOrEqual(20)
    expect(new Set(libs.map((l) => l.id)).size).toBe(libs.length)
    for (const l of libs) {
      expect(l.id.startsWith('wake-library-')).toBe(true)
      expect(l.name.trim()).not.toBe('')
      expect(['core', 'nearby']).toContain(l.coverage)
      expect(l.sourceIds).toEqual(['wake-libraries'])
    }
  })
  it('gives every library a known address and known or unknown hours', () => {
    for (const l of libs) {
      const f = detail(l.id).fields
      expect(f.find((x) => x.key === 'address')).toMatchObject({ status: 'known', sourceId: 'wake-libraries' })
      expect(f.find((x) => x.key === 'address')?.value).toMatch(/, NC$/)
      const hours = f.find((x) => x.key === 'hours')
      expect(['known', 'unknown']).toContain(hours?.status)
      if (hours?.status === 'known') expect(hours.value).toMatch(/^Mon–Thu /)
    }
  })
  it('has a Cary library findable as "Cary library"', () => {
    const cary = libs.find((l) => l.aliases?.includes('Cary library'))
    expect(cary).toBeDefined()
    expect(cary?.name).toMatch(/Cary/)
  })
  it('credits Wake County GIS under CC BY 4.0', () => {
    const s = catalog.sources.find((x) => x.id === 'wake-libraries')
    expect(s?.license).toBe('CC BY 4.0')
    const manifest = release.manifest as { sources: { id: string; attribution: string }[] }
    expect(manifest.sources.find((x) => x.id === 'wake-libraries')?.attribution).toBe('Wake County GIS (CC BY 4.0)')
  })
})
