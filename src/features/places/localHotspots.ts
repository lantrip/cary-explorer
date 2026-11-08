// Dev-only: converts locally fetched eBird hotspots into catalog places. Never part of the public build.
import type { Place, Source } from '../../types/place'
import { isRecord, nonEmpty } from '../../lib/guards'
import { CATEGORY_THEME } from '../themes/themes'

export const LOCAL_HOTSPOTS_URL = '/__local/ebird-hotspots.json'

export interface HotspotsPayload {
  retrievedAt?: string
  features: unknown[]
}

const COUNTY: Record<string, string> = {
  'US-NC-183': 'Wake',
  'US-NC-037': 'Chatham',
  'US-NC-063': 'Durham',
}

const DESCRIPTION =
  'An eBird birding hotspot where people report sightings. Reports are observations, not a guarantee that birds are present.'

export function hotspotsToCatalog(payload: unknown): { places: Place[]; source: Source } {
  const features = isRecord(payload) && Array.isArray(payload.features) ? payload.features : []
  const retrievedAt =
    isRecord(payload) && nonEmpty(payload.retrievedAt) && Number.isFinite(Date.parse(payload.retrievedAt))
      ? payload.retrievedAt
      : undefined
  const seen = new Set<string>()
  const places: Place[] = []
  for (const f of features) {
    const p = isRecord(f) && isRecord(f.properties) ? f.properties : null
    if (!p || p.inCaryLimits !== true) continue
    const { locId, locName, lat, lng, ebirdUrl, subnational2Code } = p
    if (!nonEmpty(locId) || !nonEmpty(locName)) continue
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    if (typeof ebirdUrl !== 'string' || !ebirdUrl.startsWith('https://ebird.org/')) continue
    const id = `ebird-${locId}`
    if (seen.has(id)) continue
    seen.add(id)
    places.push({
      id,
      name: locName.trim(),
      aliases: [],
      category: 'wildlife',
      theme: CATEGORY_THEME.wildlife,
      municipality: 'Cary',
      county: typeof subnational2Code === 'string' ? COUNTY[subnational2Code] : undefined,
      centroid: [lng, lat],
      description: DESCRIPTION,
      url: ebirdUrl,
      localOnly: true,
      sourceIds: ['ebird'],
    })
  }
  return {
    places,
    source: {
      id: 'ebird',
      name: 'eBird (Cornell Lab of Ornithology)',
      url: 'https://ebird.org',
      license: 'eBird API Terms of Use (non-commercial)',
      retrievedAt,
    },
  }
}

/** Fetches the dev-server endpoint; resolves null on 404, network error or bad JSON (never throws). */
export async function loadLocalHotspots(signal?: AbortSignal): Promise<HotspotsPayload | null> {
  try {
    const response = await fetch(LOCAL_HOTSPOTS_URL, { signal })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (!isRecord(data) || !Array.isArray(data.features)) return null
    return data as unknown as HotspotsPayload
  } catch {
    return null
  }
}
