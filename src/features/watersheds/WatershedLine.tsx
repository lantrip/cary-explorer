// "In the <name> watershed" for a point, worked out in the browser from the already loaded water layer. The point never leaves memory.
import { useMemo } from 'react'
import { fromLonLat } from 'ol/proj'
import { useAppStore } from '../../store/useAppStore'
import { useGeometryLayers } from '../map/layers'
import { usePlaces } from '../places/usePlaces'
import { NOT_IN_WATERSHED_TEXT, watershedAt, watershedLineText, type WatershedFeature } from './watershedAt'

const SOURCE_ID = 'usgs-wbd-huc12'

/** Water-layer polygons as plain coordinates in map projection (EPSG:3857), rebuilt only when new layer data arrives. */
function useWatershedFeatures(): WatershedFeature[] | null {
  const { status, areas } = useGeometryLayers()
  const { places } = usePlaces()
  return useMemo(() => {
    // A layer that failed to load would turn into a wrong "not in a watershed", so say nothing then.
    if (status !== 'ready') return null
    const water = new Set(places.filter((p) => p.category === 'water').map((p) => p.id))
    const out: WatershedFeature[] = []
    for (const f of areas) {
      const placeId = f.get('placeId') as string
      const g = f.getGeometry()
      if (!water.has(placeId) || !g) continue
      const type = g.getType()
      if (type === 'Polygon' || type === 'MultiPolygon') {
        out.push({ placeId, geometry: { type, coordinates: (g as unknown as { getCoordinates(): unknown }).getCoordinates() } })
      }
    }
    return out.length > 0 ? out : null
  }, [status, areas, places])
}

export function WatershedLine({ point }: { point: [number, number] | null }) {
  const features = useWatershedFeatures()
  const { places, sources } = usePlaces()
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const setView = useAppStore((s) => s.setView)
  const placeId = useMemo(
    () => (point && features ? watershedAt(fromLonLat(point) as [number, number], features) : undefined),
    [point, features],
  )
  if (placeId === undefined) return null
  const place = placeId ? places.find((p) => p.id === placeId) : undefined
  if (placeId !== null && !place) return null
  const source = sources.find((s) => s.id === SOURCE_ID)
  return (
    <div data-testid="watershed-line" className="text-sm text-ink">
      {place ? (
        <button
          type="button"
          onClick={() => {
            setSelectedPlaceId(place.id)
            setView('map')
          }}
          className="min-h-11 rounded-control px-1.5 text-left font-semibold text-forest underline hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          {watershedLineText(place.name)}
        </button>
      ) : (
        <p className="px-1.5">{NOT_IN_WATERSHED_TEXT}</p>
      )}
      {source && <p className="px-1.5 text-[13px] text-ink-muted">Source: {source.name} (watershed boundaries)</p>}
    </div>
  )
}
