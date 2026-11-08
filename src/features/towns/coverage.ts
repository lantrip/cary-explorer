// Town filter options and per-town, per-theme coverage derived from the loaded catalog. Pure: no React.
import type { Place, ThemeId } from '../../types/place'

export interface Town {
  slug: string
  /** Exactly the `municipality` value the catalog uses. */
  label: string
}

export const TOWNS: readonly Town[] = [
  { slug: 'cary', label: 'Cary' },
  { slug: 'apex', label: 'Apex' },
  { slug: 'morrisville', label: 'Morrisville' },
  { slug: 'raleigh', label: 'Raleigh' },
  { slug: 'garner', label: 'Garner' },
  { slug: 'holly-springs', label: 'Holly Springs' },
  { slug: 'fuquay-varina', label: 'Fuquay-Varina' },
  { slug: 'knightdale', label: 'Knightdale' },
  { slug: 'wendell', label: 'Wendell' },
  { slug: 'zebulon', label: 'Zebulon' },
  { slug: 'wake-forest', label: 'Wake Forest' },
  { slug: 'rolesville', label: 'Rolesville' },
  { slug: 'unincorporated-wake', label: 'Unincorporated Wake County' },
]

/** `data` = the town has at least one place of that theme in the loaded catalog; `gap` = none. Derived, never typed by hand. */
export type CoverageStatus = 'data' | 'gap'

export interface TownCoverage {
  /** Per-theme status from the places the catalog holds for this town. */
  themes: Record<ThemeId, CoverageStatus>
  /** Trails alone: the parks-and-trails theme can be `data` from parks while trails are a `gap`. */
  trails: CoverageStatus
  parks: number
  trailCount: number
  /** Place count per theme. */
  themeCounts: Record<ThemeId, number>
}

const THEME_IDS: readonly ThemeId[] = ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community']
const THEME_SHORT: Record<ThemeId, string> = {
  'parks-trails': 'Parks & trails',
  history: 'History',
  'birds-wildlife': 'Birds & wildlife',
  water: 'Water',
  'art-community': 'Art & community',
}

/** Places in another county's part carry that county's name as `municipality`, so they never count toward (or show under) these towns. */
const OTHER_COUNTY_PART: Readonly<Record<string, string>> = {
  apex: 'Chatham',
  morrisville: 'Durham',
  raleigh: 'Durham',
  'wake-forest': 'Franklin',
}

/** Per-theme status for one town from the catalog itself. Pure; callers memoise on `places`. Null for "all towns" or an unknown slug. */
export function coverageFor(places: readonly Pick<Place, 'municipality' | 'theme' | 'category'>[], slug: string | null): TownCoverage | null {
  const town = townBySlug(slug)
  if (!town) return null
  const themeCounts = Object.fromEntries(THEME_IDS.map((t) => [t, 0])) as Record<ThemeId, number>
  let parks = 0
  let trailCount = 0
  for (const p of places) {
    if (p.municipality !== town.label) continue
    themeCounts[p.theme] += 1
    if (p.category === 'park') parks += 1
    else if (p.category === 'trail') trailCount += 1
  }
  const status = (n: number): CoverageStatus => (n > 0 ? 'data' : 'gap')
  const themes = Object.fromEntries(THEME_IDS.map((t) => [t, status(themeCounts[t])])) as Record<ThemeId, CoverageStatus>
  return { themes, trails: status(trailCount), parks, trailCount, themeCounts }
}

export function townBySlug(slug: string | null | undefined): Town | null {
  return TOWNS.find((t) => t.slug === slug) ?? null
}

export function townByLabel(label: string | null | undefined): Town | null {
  return TOWNS.find((t) => t.label === label) ?? null
}

export function isTownSlug(value: string | null | undefined): value is string {
  return townBySlug(value) !== null
}

/** The town sentence shown under the filter, built from what the data holds. Null for "all towns" / an unknown slug. */
export function townNote(slug: string | null, coverage: TownCoverage | null): string | null {
  const town = townBySlug(slug)
  if (!town) return null
  const sentences: string[] = []
  if (coverage) {
    const counts = [`Parks: ${coverage.parks}`, `Trails: ${coverage.trailCount}`]
    for (const t of THEME_IDS.slice(1)) if (coverage.themeCounts[t] > 0) counts.push(`${THEME_SHORT[t]}: ${coverage.themeCounts[t]}`)
    sentences.push(`${counts.join(' · ')} in this town's data`)
  }
  if (town.slug === 'unincorporated-wake') sentences.push('Wake County outside town limits')
  const other = OTHER_COUNTY_PART[town.slug]
  if (other) sentences.push(`Part of ${town.label} is in ${other} County; places there aren't counted here and show only if they're near Wake`)
  return sentences.length ? `${sentences.join('. ')}.` : null
}

/** Places in the chosen town (all places when `slug` is null or unknown). */
export function placesInTown<T extends Pick<Place, 'municipality'>>(places: readonly T[], slug: string | null): T[] {
  const town = townBySlug(slug)
  return town ? places.filter((p) => p.municipality === town.label) : [...places]
}

/** Theme and town filter on top of each other. */
export function filterPlaces<T extends Pick<Place, 'municipality' | 'theme'>>(
  places: readonly T[],
  activeThemes: readonly ThemeId[],
  slug: string | null,
): T[] {
  const town = townBySlug(slug)
  return places.filter((p) => activeThemes.includes(p.theme) && (!town || p.municipality === town.label))
}

/** Active themes with no places in the chosen town, from the derived coverage. Empty when no town is chosen. */
export function emptyThemes(
  places: readonly Pick<Place, 'municipality' | 'theme' | 'category'>[],
  activeThemes: readonly ThemeId[],
  slug: string | null,
): ThemeId[] {
  const coverage = coverageFor(places, slug)
  if (!coverage) return []
  return activeThemes.filter((theme) => coverage.themes[theme] === 'gap')
}

/** The one-line message for an empty theme in a town. */
export function emptyThemeText(themeLabel: string, townLabel: string): string {
  return `${themeLabel} places for ${townLabel} aren't in the app yet.`
}

/** Label text for a place's coverage; null for core or unspecified. */
export function coverageText(coverage: Place['coverage']): string | null {
  if (coverage === 'nearby') return 'Nearby, outside core area'
  if (coverage === 'outside') return 'Outside coverage area'
  return null
}
