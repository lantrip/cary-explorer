// Simple search intent: "<category> in <town>", "<category> near <place>" and a bare "<category>" ("fire stations"). Pure, rule-based, no AI and no guessing.
// Anything that does not match exactly returns null, so plain name search runs unchanged.
//
// Category words (singular or plural, case and punctuation ignored): park, trail (also greenway), history (also historic
// site), wildlife, water, art (also public art), community (also community center), fire station (also firehouse).
// "playground", "restroom" and other amenities are NOT categories and are not mapped here. Several categories may be joined
// with "and"/"or" ("parks and trails in Cary"). A leading "show (me)", "find", "list" or "all" is ignored.
// Towns: a town label or slug ("Holly Springs", "holly-springs"), optionally after "town of"/"city of"; "unincorporated" and
// "unincorporated Wake" also mean Unincorporated Wake County.
// Places: only an exact (normalised) name or alias match from the search index counts; "this"/"the" and a following
// "park/trail/greenway" word are optional. Two different places with the same name are ambiguous, so they give null.
import type { CategoryId, Place, ThemeId } from '../../types/place'
import type { Town } from '../towns/coverage'
import { LAYER_LABEL, THEME_ORDER, isGeometryLayer, layersOfTheme, reconcileOverrides, resolveLayers, type LayerOverrides } from '../themes/layerSelection'
import { CATEGORY_THEME } from '../themes/themes'
import { connectionsFor, type Connection, type RelationshipIndex } from '../places/relationships'
import { createPlaceSearch, type PlaceSearch } from './searchIndex'

export type Intent =
  | { kind: 'category-in-town'; categoryIds: CategoryId[]; townSlug: string }
  | { kind: 'category-near-place'; categoryIds: CategoryId[]; placeId: string }
  | { kind: 'category'; categoryIds: CategoryId[] }

export interface IntentContext {
  towns: readonly Town[]
  /** Categories the parser may return. */
  categories: readonly CategoryId[]
  places: readonly Place[]
  /** Search index over `places`; built (and cached per array) when omitted. */
  search?: PlaceSearch
}

const CATEGORY_WORDS: Readonly<Record<string, CategoryId>> = {
  park: 'park',
  parks: 'park',
  trail: 'trail',
  trails: 'trail',
  greenway: 'trail',
  greenways: 'trail',
  history: 'history',
  'historic site': 'history',
  'historic sites': 'history',
  wildlife: 'wildlife',
  water: 'water',
  art: 'art',
  'public art': 'art',
  community: 'community',
  'community center': 'community',
  'community centers': 'community',
  'fire station': 'fire-station',
  'fire stations': 'fire-station',
  firehouse: 'fire-station',
  firehouses: 'fire-station',
}

/** Words that may sit between "near this" and the place name ("near this park Bond Park"). */
const PLACE_WORDS = new Set(['park', 'trail', 'greenway', 'place'])

/** Lowercase, apostrophes dropped, every other punctuation run a single space. */
export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const searchCache = new WeakMap<readonly Place[], PlaceSearch>()
function searchFor(ctx: IntentContext): PlaceSearch {
  if (ctx.search) return ctx.search
  let s = searchCache.get(ctx.places)
  if (!s) {
    s = createPlaceSearch(ctx.places)
    searchCache.set(ctx.places, s)
  }
  return s
}

function parseCategories(text: string, allowed: readonly CategoryId[]): CategoryId[] | null {
  const stripped = text.replace(/^(?:show me|show|find|list)\s+/, '').replace(/^all\s+/, '')
  const out: CategoryId[] = []
  for (const raw of stripped.split(/\s+(?:and|or)\s+/)) {
    const id = CATEGORY_WORDS[raw.trim()]
    if (!id || !allowed.includes(id)) return null
    if (!out.includes(id)) out.push(id)
  }
  return out.length > 0 ? out : null
}

function matchTown(text: string, towns: readonly Town[]): Town | null {
  const name = text.replace(/^(?:the )?(?:town|city) of /, '')
  const unincorporated = /^unincorporated(?: wake(?: county)?)?$/.test(name)
  return (
    towns.find((t) =>
      unincorporated ? t.slug === 'unincorporated-wake' : normalizeText(t.label) === name || normalizeText(t.slug) === name,
    ) ?? null
  )
}

function matchPlace(text: string, ctx: IntentContext): Place | null {
  const search = searchFor(ctx)
  const base = text.replace(/^(?:this|the)\s+/, '')
  const candidates = [base]
  const first = base.split(' ')[0]
  if (PLACE_WORDS.has(first)) candidates.push(base.slice(first.length).trim())
  for (const name of candidates) {
    if (!name) continue
    // The index finds candidates; only an exact name or alias match is confident enough to act on.
    const exact = search(name, undefined, 20).filter((p) => [p.name, ...p.aliases].some((n) => normalizeText(n) === name))
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
  }
  return null
}

export function parseIntent(text: string, ctx: IntentContext): Intent | null {
  const normalized = normalizeText(text)
  const m = normalized.match(/^(.+?) (in|near) (.+)$/)
  if (!m) {
    // A bare category phrase: shows that category everywhere, switching its layer on if it is off.
    const bare = parseCategories(normalized, ctx.categories)
    return bare ? { kind: 'category', categoryIds: bare } : null
  }
  const categoryIds = parseCategories(m[1], ctx.categories)
  if (!categoryIds) return null
  if (m[2] === 'in') {
    const town = matchTown(m[3], ctx.towns)
    return town ? { kind: 'category-in-town', categoryIds, townSlug: town.slug } : null
  }
  const place = matchPlace(m[3], ctx)
  return place ? { kind: 'category-near-place', categoryIds, placeId: place.id } : null
}

/** "parks", "parks and trails": the plural layer names, lowercase. */
export function categoriesText(categoryIds: readonly CategoryId[]): string {
  const names = categoryIds.map((id) => (id === 'fire-station' ? 'fire stations' : LAYER_LABEL[id].toLocaleLowerCase('en-US')))
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Show parks in Apex" / "Trails near Walnut Creek Trail"; null if the target no longer resolves. */
export function intentLabel(intent: Intent, towns: readonly Town[], placesById: ReadonlyMap<string, Place>): string | null {
  const what = categoriesText(intent.categoryIds)
  if (intent.kind === 'category') return `Show ${what}`
  if (intent.kind === 'category-in-town') {
    const town = towns.find((t) => t.slug === intent.townSlug)
    return town ? `Show ${what} in ${town.label}` : null
  }
  const place = placesById.get(intent.placeId)
  return place ? `${what.charAt(0).toLocaleUpperCase('en-US')}${what.slice(1)} near ${place.name}` : null
}

export interface TownPlan {
  /** The town to switch to; null for a bare category (the town stays as it is). */
  town: string | null
  /** Exactly the themes of the requested categories. */
  themes: ThemeId[]
  themesChanged: boolean
  /** Category layers to flip with `setLayer(id, on)` once `themes` is applied, so only the requested categories stay on. */
  layerChanges: { id: CategoryId; on: boolean }[]
}

/** The setter arguments for "category in town": the town, the only themes to show, and the category layers to switch. */
export function planCategoryInTown(
  intent: Extract<Intent, { kind: 'category-in-town' | 'category' }>,
  activeThemes: readonly ThemeId[],
  overrides: LayerOverrides,
): TownPlan {
  const needed = intent.categoryIds.map((id) => CATEGORY_THEME[id])
  const themes = THEME_ORDER.filter((t) => needed.includes(t))
  const themesChanged = themes.length !== activeThemes.length || themes.some((t) => !activeThemes.includes(t))
  // Mirrors what setActiveThemes does to overrides, so the layers are judged as the store will hold them.
  const next = themesChanged ? reconcileOverrides(activeThemes, themes, overrides) : overrides
  const on = resolveLayers(themes, next)
  // Geometry layers (outlines, proposed trails) keep their state; only category layers follow the request.
  const layerChanges = themes
    .flatMap((t) => layersOfTheme(t))
    .filter((id): id is CategoryId => !isGeometryLayer(id))
    .map((id) => ({ id, on: intent.categoryIds.includes(id) }))
    .filter((c) => on.includes(c.id) !== c.on)
  return { town: intent.kind === 'category-in-town' ? intent.townSlug : null, themes, themesChanged, layerChanges }
}

/** Connected places of the wanted categories, in `connectionsFor` order (contained, curated, then nearby, closest first). */
export function nearbyOfCategory(
  placeId: string,
  categoryIds: readonly CategoryId[],
  index: RelationshipIndex,
  placesById: ReadonlyMap<string, Place>,
  limit = 12,
): Connection[] {
  // Two datasets can hold the same real place under one name; list it once (the first in sort order), never the origin's twin.
  const seen = new Set([normalizeText(placesById.get(placeId)?.name ?? '')])
  return connectionsFor(placeId, index, placesById, Infinity)
    .filter((c) => categoryIds.includes(c.place.category))
    .filter((c) => {
      const key = normalizeText(c.place.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export const NEAR_RULE_NOTE = 'Near = within 400 m in a straight line, or the closest place within 2 km.'

export function noneLinkedText(categoryIds: readonly CategoryId[], placeName: string): string {
  return `No ${categoriesText(categoryIds)} are linked to ${placeName} in our data.`
}
