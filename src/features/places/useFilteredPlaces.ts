// Places restricted to the active theme, layer and town selection (the one filter shared by map, search and list).
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { filterByLayers, resolveLayers, type LayerId } from '../themes/layerSelection'
import { filterPlaces } from '../towns/coverage'
import { useOpenCollection } from '../collections/collections'
import { filterByAmenities } from './amenities'
import { usePlaces } from './usePlaces'

/** The layers that are on, from the active themes and the user's switches. */
export function useLayerSelection(): LayerId[] {
  const activeThemes = useAppStore((s) => s.activeThemes)
  const overrides = useAppStore((s) => s.layerOverrides)
  return useMemo(() => resolveLayers(activeThemes, overrides), [activeThemes, overrides])
}

export function useFilteredPlaces() {
  const { places, status, retry } = usePlaces()
  const activeThemes = useAppStore((s) => s.activeThemes)
  const town = useAppStore((s) => s.town)
  const amenities = useAppStore((s) => s.amenityFilters)
  const layers = useLayerSelection()
  const beforeAmenities = useMemo(
    () => filterByLayers(filterPlaces(places, activeThemes, town), layers),
    [places, activeThemes, town, layers],
  )
  // While a collection is open the map and list show exactly its places (theme, town and amenity filters do not apply).
  const collectionId = useAppStore((s) => s.collectionId)
  const open = useOpenCollection(collectionId)
  const filtered = useMemo(
    () => (open ? open.places : filterByAmenities(beforeAmenities, amenities)),
    [open, beforeAmenities, amenities],
  )
  // `amenityEmpty`: the amenity filters alone are why nothing is shown.
  const amenityEmpty = !open && amenities.length > 0 && filtered.length === 0 && beforeAmenities.length > 0
  return useMemo(
    () => ({ places: filtered, layers, status, retry, amenityEmpty }),
    [filtered, layers, status, retry, amenityEmpty],
  )
}
