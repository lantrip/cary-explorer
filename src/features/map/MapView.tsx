// OpenLayers map inside a React component: created once in an effect, disposed on unmount. Shows place points.
import { useEffect, useRef, useState } from 'react'
import 'ol/ol.css'
import './map.css'
import OLMap from 'ol/Map'
import { ScaleLine, defaults as defaultControls } from 'ol/control'
import { defaults as defaultInteractions } from 'ol/interaction'
import { createEmpty, extend as extendExtent } from 'ol/extent'
import type { Extent } from 'ol/extent'
import View from 'ol/View'
import Feature from 'ol/Feature'
import type { Coordinate } from 'ol/coordinate'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import VectorSource from 'ol/source/Vector'
import Cluster from 'ol/source/Cluster'
import type { FeatureLike } from 'ol/Feature'
import type BaseLayer from 'ol/layer/Base'
import { fromLonLat, toLonLat } from 'ol/proj'
import { useAppStore } from '../../store/useAppStore'
import { useLocationStore } from '../location/locationStore'
import type { SheetState } from '../../store/useAppStore'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { desktopSelectionPadding, sheetHeightPx } from '../../lib/layout'
import { reportCamera } from '../../lib/cameraBus'
import { useFilteredPlaces } from '../places/useFilteredPlaces'
import { usePlaces } from '../places/usePlaces'
import type { CategoryId, ThemeId } from '../../types/place'
import { createBasemapLayer } from './basemap'
import { MapNotes } from './MapNotes'
import { ICON_SIZE } from '../themes/icons'
import { getClusterStyle, getLabelBorderStyle, getPinStyle } from './pinStyles'
import { LAYER_Z, AREA_LAYER_MIN_ZOOM, geometryStyleFor } from './geometryStyles'
import { useGeometryLayers } from './layers'
import { isGeometryShown } from '../themes/layerSelection'
import type { GeometryKind, GeometryStatus } from './layers'
import { pickBest } from './picking'
import type { PickKind } from './picking'
import { FRAME_MAX_ZOOM, planFrame, selectedGeometryFeatures, shouldFrame } from './framing'
import type { FramedState } from './framing'
import { getTheme } from '../themes/themes'
import { reportMapInitFailed, reportTileEvent, resetMapStatus } from './mapStatus'

// Cary, NC as [lon, lat]
const CARY_CENTER: [number, number] = [-78.7811, 35.7915]
const MIN_SELECTED_ZOOM = 14
const SELECT_ANIMATION_MS = 400
const HIT_TOLERANCE_PX = 8
const CLUSTER_DISTANCE_PX = 44
const CLUSTER_MIN_DISTANCE_PX = 16
const CLUSTER_MAX_ZOOM = 16
const CONTROL_GAP_PX = 12
const ZOOM_ANIMATION_MS = 200
const TOWN_FIT_ANIMATION_MS = 300
const TOWN_FIT_MAX_ZOOM = 15

// Same order as OpenLayers padding: [top, right, bottom, left], in pixels.
type Padding = [number, number, number, number]

// Desktop: the side panel covers the left DESKTOP_PANEL_WIDTH px. Mobile: keep clear of the top edge and the bottom sheet.
function selectionPadding(isDesktop: boolean, panelCollapsed: boolean, sheetState: SheetState = 'peek'): Padding {
  if (isDesktop) return desktopSelectionPadding(panelCollapsed)
  return [120, 24, sheetHeightPx(sheetState) + 24, 24]
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Space the zoom buttons and map credits leave at the bottom: the mobile sheet's height, else none.
function bottomInsetPx(isDesktop: boolean, sheetState: SheetState): number {
  return isDesktop || sheetState === 'full' ? 0 : sheetHeightPx(sheetState)
}

// Animate so `coords` lands in the middle of the part of the map not covered by the panel or sheet.
function flyToPlace(map: OLMap, coords: Coordinate, padding: Padding) {
  const view = map.getView()
  const zoom = Math.max(view.getZoom() ?? 12, MIN_SELECTED_ZOOM)

  let center = coords
  const size = map.getSize()
  if (size) {
    const [top, right, bottom, left] = padding
    const [width, height] = size
    // Pixel where the place should sit: centre of the uncovered area.
    const targetX = (left + (width - right)) / 2
    const targetY = (top + (height - bottom)) / 2
    // Shift the view centre so the place projects onto that pixel at the target zoom.
    const resolution = view.getResolutionForZoom(zoom)
    center = [
      coords[0] + (width / 2 - targetX) * resolution,
      coords[1] + (targetY - height / 2) * resolution,
    ]
  }

  if (prefersReducedMotion()) {
    view.setCenter(center)
    view.setZoom(zoom)
  } else {
    view.animate({ center, zoom, duration: SELECT_ANIMATION_MS })
  }
}

// Fit `extent` into the part of the map the panel or sheet leaves visible.
function fitToExtent(map: OLMap, extent: Extent, padding: Padding) {
  map.getView().fit(extent, {
    padding,
    maxZoom: FRAME_MAX_ZOOM,
    duration: prefersReducedMotion() ? 0 : SELECT_ANIMATION_MS,
  })
}

const zoomButtonClass =
  'pointer-events-auto inline-flex size-11 items-center justify-center bg-white text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link'

function ZoomButtons({ onZoom }: { onZoom: (delta: number) => void }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-md"
      role="group"
      aria-label="Zoom"
    >
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(1)} className={zoomButtonClass}>
        <svg width={ICON_SIZE.md} height={ICON_SIZE.md} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <div className="h-px bg-line" aria-hidden="true" />
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(-1)} className={zoomButtonClass}>
        <svg width={ICON_SIZE.md} height={ICON_SIZE.md} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

function useWindowHeightTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OLMap | null>(null)
  const clusterLayerRef = useRef<VectorLayer<Cluster> | null>(null)
  const baseSourceRef = useRef<VectorSource | null>(null)
  const selectedLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const lineSourceRef = useRef<VectorSource | null>(null)
  const areaSourceRef = useRef<VectorSource | null>(null)
  const selectedGeomSourceRef = useRef<VectorSource | null>(null)
  const youSourceRef = useRef<VectorSource | null>(null)
  const pinSourceRef = useRef<VectorSource | null>(null)
  // What the camera last did for the selected place, and whether the user has panned or zoomed since.
  const framedRef = useRef<FramedState | null>(null)
  const movedRef = useRef(false)
  // Inputs seen by the last framing pass, to tell what changed.
  const prevFrameRef = useRef<{ sheetState: SheetState; panelCollapsed: boolean; isDesktop: boolean; index: unknown } | null>(null)
  const hoveredIdRef = useRef<string | null>(null)
  // Latest framing inputs for map event handlers created once in the init effect.
  const framingRef = useRef({ isDesktop: true, sheetState: 'peek' as SheetState })
  // Last selection the view flew to, so the fly-to runs only when the selection changes.
  const flownIdRef = useRef<string | null>(null)

  const { places: allPlaces, status: placesStatus } = usePlaces()
  const { places: visiblePlaces, layers: layerSelection } = useFilteredPlaces()
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId)
  const sheetState = useAppStore((s) => s.sheetState)
  const isDesktop = useIsDesktop()
  const panelCollapsed = useAppStore((s) => s.panelCollapsed)
  const geometry = useGeometryLayers()
  useWindowHeightTick()

  useEffect(() => {
    framingRef.current = { isDesktop, sheetState }
  }, [isDesktop, sheetState])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const baseSource = new VectorSource()
    const clusterSource = new Cluster({
      source: baseSource,
      distance: CLUSTER_DISTANCE_PX,
      minDistance: CLUSTER_MIN_DISTANCE_PX,
    })
    const selectedSource = new VectorSource()
    const lineSource = new VectorSource()
    const areaSource = new VectorSource()
    const selectedGeomSource = new VectorSource()
    // "You are here" dot: only while Near me is on. Not pickable, never moves the camera.
    const youSource = new VectorSource()
    const youLayer = new VectorLayer({
      source: youSource,
      zIndex: LAYER_Z.selectedPin + 1,
      style: new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: '#1a73e8' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
      }),
    })
    youSourceRef.current = youSource
    // Temporary pin from coordinate search: a separate layer, never a place and never pickable.
    const pinSource = new VectorSource()
    const pinLayer = new VectorLayer({
      source: pinSource,
      zIndex: LAYER_Z.selectedPin + 2,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: '#c0392b' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
      }),
    })
    pinSourceRef.current = pinSource

    const themeOf = (f: FeatureLike) => getTheme((f.get('theme') as ThemeId | undefined) ?? 'parks-trails').id
    const geometryStyle = (selected: boolean) => (f: FeatureLike) =>
      geometryStyleFor(f.get('kind') as GeometryKind, f.get('status') as GeometryStatus, themeOf(f), selected)
    const areaLayer = new VectorLayer({
      source: areaSource,
      zIndex: LAYER_Z.areas,
      minZoom: AREA_LAYER_MIN_ZOOM,
      style: geometryStyle(false),
    })
    const lineLayer = new VectorLayer({ source: lineSource, zIndex: LAYER_Z.lines, style: geometryStyle(false) })
    // The selected place's geometry: its own top layer, above lines and points, and never picked.
    const selectedGeomLayer = new VectorLayer({
      source: selectedGeomSource,
      zIndex: LAYER_Z.selectedGeometry,
      style: geometryStyle(true),
    })

    const pinStyleFor = (f: Feature) => {
      const id = f.getId()
      const state = id !== undefined && id === hoveredIdRef.current ? 'hover' : 'default'
      return getPinStyle(f.get('category') as CategoryId, f.get('theme') as ThemeId, state)
    }

    const clusterLayer = new VectorLayer({
      source: clusterSource,
      zIndex: LAYER_Z.clusters,
      style: (feature: FeatureLike) => {
        const members = (feature.get('features') as Feature[] | undefined) ?? []
        return members.length === 1 ? pinStyleFor(members[0]) : getClusterStyle(members.length)
      },
    })

    // The selected place is drawn here, on top, and kept out of the cluster source.
    const selectedLayer = new VectorLayer({
      source: selectedSource,
      zIndex: LAYER_Z.selectedPin,
      style: (feature: FeatureLike) => {
        const name = feature.get('name') as string
        return [
          getPinStyle(feature.get('category') as CategoryId, feature.get('theme') as ThemeId, 'selected', name),
          getLabelBorderStyle(name),
        ]
      },
    })

    resetMapStatus()
    let map: OLMap
    try {
      map = new OLMap({
        target: container,
        // Zoom is a React control. Attribution stays uncollapsed so the OSM credit is always visible.
        controls: defaultControls({
          zoom: false,
          rotate: false,
          attributionOptions: { collapsible: false },
        }).extend([new ScaleLine({ units: 'imperial' })]),
        // OpenLayers' default is onFocusOnly: true, which (because the map has a tabindex for keyboard users)
        // ignores wheel and trackpad-pinch input until the map itself has focus. Selecting a place moves focus
        // to the card, so a pinch then zoomed the whole page. The app is full-screen and never scrolls, so the
        // map always takes wheel and pinch input under the pointer. Keyboard pan/zoom still need map focus.
        interactions: defaultInteractions({ onFocusOnly: false }),
        layers: [createBasemapLayer(reportTileEvent), areaLayer, lineLayer, clusterLayer, selectedGeomLayer, selectedLayer, youLayer, pinLayer],
        view: new View({
          center: fromLonLat(CARY_CENTER),
          zoom: 12,
        }),
      })
    } catch (err) {
      // The map is optional: search, list and card keep working without it.
      console.error('Map failed to initialise', err)
      reportMapInitFailed()
      return
    }

    // Selectable layers only: pins and clusters, lines and areas. Never the basemap or the selected geometry.
    const kindOf = new Map<BaseLayer, PickKind>([
      [clusterLayer, 'pin'],
      [selectedLayer, 'pin'],
      [lineLayer, 'line'],
      [areaLayer, 'area'],
    ])
    const pickOptions = {
      hitTolerance: HIT_TOLERANCE_PX,
      layerFilter: (l: BaseLayer) => kindOf.has(l),
    }
    // Every feature under the pixel; pins beat lines, lines beat areas.
    const pickAt = (pixel: number[]) => {
      const hits: { kind: PickKind; feature: FeatureLike }[] = []
      map.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => {
          const kind = layer ? kindOf.get(layer) : undefined
          if (kind) hits.push({ kind, feature })
        },
        pickOptions,
      )
      return pickBest(hits)
    }

    // singleclick (not click) so a double-click to zoom does not also select.
    map.on('singleclick', (e) => {
      const best = pickAt(e.pixel)
      if (!best) return
      const hit = best.feature
      if (best.kind !== 'pin') {
        const id = hit.get('placeId') as unknown
        if (typeof id === 'string') useAppStore.getState().setSelectedPlaceId(id)
        return
      }
      const members = hit.get('features') as Feature[] | undefined
      if (!members) {
        // Selected pin (plain feature).
        const id = (hit as Feature).getId()
        if (typeof id === 'string') useAppStore.getState().setSelectedPlaceId(id)
        return
      }
      if (members.length === 1) {
        const id = members[0].getId()
        if (typeof id === 'string') useAppStore.getState().setSelectedPlaceId(id)
        return
      }
      const extent = createEmpty()
      for (const m of members) {
        const g = m.getGeometry()
        if (g) extendExtent(extent, g.getExtent())
      }
      movedRef.current = true
      const { isDesktop: desktop, sheetState: sheet } = framingRef.current
      map.getView().fit(extent, {
        padding: selectionPadding(desktop, useAppStore.getState().panelCollapsed, sheet),
        maxZoom: CLUSTER_MAX_ZOOM,
        duration: prefersReducedMotion() ? 0 : SELECT_ANIMATION_MS,
      })
    })

    const setHovered = (id: string | null) => {
      if (hoveredIdRef.current === id) return
      hoveredIdRef.current = id
      clusterLayer.changed()
    }

    map.on('pointermove', (e) => {
      if (e.dragging) return
      const best = pickAt(e.pixel)
      const target = map.getTargetElement()
      if (target) target.style.cursor = best ? 'pointer' : ''
      const members = best?.kind === 'pin' ? (best.feature.get('features') as Feature[] | undefined) : undefined
      const id = members?.length === 1 ? members[0].getId() : undefined
      setHovered(typeof id === 'string' ? id : null)
    })

    const viewport = map.getViewport()
    const onLeave = () => {
      const target = map.getTargetElement()
      if (target) target.style.cursor = ''
      setHovered(null)
    }
    viewport?.addEventListener('pointerleave', onLeave)

    // The user moving the map (drag, pinch, wheel, keys) stops the one-off refit when layers arrive late.
    const markMoved = () => {
      movedRef.current = true
    }
    map.on('pointerdrag', markMoved)
    viewport?.addEventListener('wheel', markMoved, { passive: true })
    viewport?.addEventListener('keydown', markMoved)

    // Report the camera once a move ends (also after animations) so the URL layer can record it.
    map.on('moveend', () => {
      const view = map.getView()
      const center = view.getCenter()
      const zoom = view.getZoom()
      if (!center || zoom === undefined) return
      const [lon, lat] = toLonLat(center)
      reportCamera({ zoom, lat, lon })
    })

    const resizeObserver = new ResizeObserver(() => map.updateSize())
    resizeObserver.observe(container)

    mapRef.current = map
    clusterLayerRef.current = clusterLayer
    baseSourceRef.current = baseSource
    selectedLayerRef.current = selectedLayer
    lineSourceRef.current = lineSource
    areaSourceRef.current = areaSource
    selectedGeomSourceRef.current = selectedGeomSource

    return () => {
      resizeObserver.disconnect()
      viewport?.removeEventListener('pointerleave', onLeave)
      viewport?.removeEventListener('wheel', markMoved)
      viewport?.removeEventListener('keydown', markMoved)
      mapRef.current = null
      clusterLayerRef.current = null
      baseSourceRef.current = null
      selectedLayerRef.current = null
      lineSourceRef.current = null
      areaSourceRef.current = null
      selectedGeomSourceRef.current = null
      flownIdRef.current = null
      framedRef.current = null
      prevFrameRef.current = null
      hoveredIdRef.current = null
      map.setTarget(undefined)
      map.dispose()
      resetMapStatus()
    }
  }, [])

  // Show or clear the "you are here" dot as location turns on or off.
  const userCoords = useLocationStore((s) => s.coords)
  useEffect(() => {
    const source = youSourceRef.current
    if (!source) return
    source.clear()
    if (userCoords) source.addFeature(new Feature({ geometry: new Point(fromLonLat(userCoords)) }))
  }, [userCoords])

  // Show or clear the temporary coordinate pin.
  const droppedPin = useAppStore((s) => s.droppedPin)
  useEffect(() => {
    const source = pinSourceRef.current
    if (!source) return
    source.clear()
    if (droppedPin) source.addFeature(new Feature({ geometry: new Point(fromLonLat([droppedPin.lon, droppedPin.lat])) }))
  }, [droppedPin])

  // Rebuild the point features when places, theme filters or the selection change (map is not recreated).
  // The selected place leaves the cluster source and is drawn from its own layer.
  useEffect(() => {
    const baseSource = baseSourceRef.current
    const selectedSource = selectedLayerRef.current?.getSource()
    if (!baseSource || !selectedSource) return
    const toFeature = (p: (typeof allPlaces)[number]) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat(p.centroid)),
        theme: p.theme,
        category: p.category,
        name: p.name,
      })
      feature.setId(p.id)
      return feature
    }
    baseSource.clear()
    baseSource.addFeatures(visiblePlaces.filter((p) => p.id !== selectedPlaceId).map(toFeature))
    selectedSource.clear()
    const selected = allPlaces.find((p) => p.id === selectedPlaceId)
    if (selected) selectedSource.addFeature(toFeature(selected))
  }, [visiblePlaces, allPlaces, selectedPlaceId])

  // Trail lines and park areas for the places that pass the theme and town filters (the same set as the pins).
  // Only the layer sources change here; the map is not recreated. The selected place's geometry goes on its own top layer.
  useEffect(() => {
    const lineSource = lineSourceRef.current
    const areaSource = areaSourceRef.current
    const selectedSource = selectedGeomSourceRef.current
    if (!lineSource || !areaSource || !selectedSource) return
    const themeById = new Map<string, ThemeId>()
    for (const p of visiblePlaces) themeById.set(p.id, p.theme)
    // Proposed trails and park outlines also follow their own layer switches; the selected place keeps its geometry.
    const withTheme = (features: typeof geometry.lines) =>
      features.filter((f) => {
        const theme = themeById.get(f.get('placeId') as string)
        if (theme) f.set('theme', theme, true)
        return (
          theme !== undefined &&
          isGeometryShown(f.get('kind') as GeometryKind, f.get('status') as GeometryStatus, layerSelection, theme)
        )
      })
    lineSource.clear()
    areaSource.clear()
    lineSource.addFeatures(withTheme(geometry.lines))
    areaSource.addFeatures(withTheme(geometry.areas))
    selectedSource.clear()
    const selected = allPlaces.find((p) => p.id === selectedPlaceId)
    // Clones, so the same Feature is never held by two sources (the base layers keep the originals).
    selectedSource.addFeatures(selected ? selectedGeometryFeatures(geometry.index.get(selected.id), selected.theme) : [])
  }, [visiblePlaces, layerSelection, allPlaces, selectedPlaceId, geometry.lines, geometry.areas, geometry.index])

  // Frame the selected place: on a new selection, when the sheet or panel changes, and once when layers arrive late.
  useEffect(() => {
    const prev = prevFrameRef.current
    prevFrameRef.current = { sheetState, panelCollapsed, isDesktop, index: geometry.index }
    if (selectedPlaceId === null) {
      flownIdRef.current = null
      framedRef.current = null
      return
    }
    const map = mapRef.current
    const place = allPlaces.find((p) => p.id === selectedPlaceId)
    // Places may not have loaded yet. Leave the id unflown so this runs again when they arrive.
    if (!map || !place) return

    const features = geometry.index.get(place.id)
    const frame = () => {
      const padding = selectionPadding(isDesktop, panelCollapsed, sheetState)
      const plan = planFrame(place, features)
      if (plan.kind === 'centroid') flyToPlace(map, fromLonLat(place.centroid), padding)
      else fitToExtent(map, plan.extent, padding)
      framedRef.current = { placeId: place.id, kind: plan.kind, moved: false }
      movedRef.current = false
    }
    const origin = useAppStore.getState().selectionOrigin
    const lastFrame = framedRef.current?.placeId === place.id ? framedRef.current : null
    const framed = lastFrame ? { ...lastFrame, moved: movedRef.current } : null

    if (selectedPlaceId !== flownIdRef.current) {
      flownIdRef.current = selectedPlaceId
      // A selection restored from a shared link that also has a camera keeps that camera.
      if (!shouldFrame('selection', { origin, framed: null, hasGeometry: false })) {
        framedRef.current = { placeId: place.id, kind: 'shared', moved: false }
        movedRef.current = false
        return
      }
      frame()
      return
    }
    const layoutChanged =
      prev !== null && (prev.sheetState !== sheetState || prev.panelCollapsed !== panelCollapsed || prev.isDesktop !== isDesktop)
    const geometryArrived = prev !== null && prev.index !== geometry.index
    if (layoutChanged && shouldFrame('layout', { origin, framed, hasGeometry: features !== undefined })) frame()
    else if (geometryArrived && shouldFrame('geometry', { origin, framed, hasGeometry: features !== undefined })) frame()
  }, [selectedPlaceId, allPlaces, isDesktop, sheetState, panelCollapsed, geometry.index])

  // Apply camera requests (from the URL) once each, by sequence number, without animation.
  const cameraRequest = useAppStore((s) => s.cameraRequest)
  const appliedSeqRef = useRef(0)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !cameraRequest || cameraRequest.seq === appliedSeqRef.current) return
    appliedSeqRef.current = cameraRequest.seq
    const view = map.getView()
    view.setCenter(fromLonLat(cameraRequest.center))
    view.setZoom(cameraRequest.zoom)
  }, [cameraRequest])

  // Fit the map to the chosen town's places once per request. Waits for the catalog; skipped when a place is selected.
  const fitRequest = useAppStore((s) => s.fitRequest)
  const appliedFitSeqRef = useRef(0)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitRequest || fitRequest.seq === appliedFitSeqRef.current || placesStatus !== 'ready') return
    appliedFitSeqRef.current = fitRequest.seq
    if (useAppStore.getState().selectedPlaceId !== null || visiblePlaces.length === 0) return
    const extent = createEmpty()
    for (const p of visiblePlaces) extendExtent(extent, new Point(fromLonLat(p.centroid)).getExtent())
    const { isDesktop: desktop, sheetState: sheet } = framingRef.current
    map.getView().fit(extent, {
      padding: selectionPadding(desktop, useAppStore.getState().panelCollapsed, sheet),
      maxZoom: TOWN_FIT_MAX_ZOOM,
      duration: prefersReducedMotion() ? 0 : TOWN_FIT_ANIMATION_MS,
    })
  }, [fitRequest, visiblePlaces, placesStatus])

  const zoomBy = (delta: number) => {
    const view = mapRef.current?.getView()
    if (!view) return
    movedRef.current = true
    const zoom = view.getZoom() ?? 12
    const target = zoom + delta
    if (prefersReducedMotion()) view.setZoom(target)
    else view.animate({ zoom: target, duration: ZOOM_ANIMATION_MS })
  }

  const inset = bottomInsetPx(isDesktop, sheetState)
  const hideZoom = !isDesktop && sheetState === 'full'

  return (
    <div
      className="cary-map absolute inset-0"
      data-panel={isDesktop && panelCollapsed ? 'collapsed' : 'open'}
      style={{ '--map-bottom-inset': `${inset}px` } as React.CSSProperties}
    >
      <div
        ref={containerRef}
        role="region"
        aria-label="Places map; all places are also available in the list view"
        tabIndex={0}
        className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link"
      />
      {!hideZoom && (
        <div
          className="pointer-events-none absolute right-4 z-10"
          style={isDesktop ? { top: 16 } : { bottom: inset + CONTROL_GAP_PX + 28 }}
        >
          <ZoomButtons onZoom={zoomBy} />
        </div>
      )}
      <MapNotes />
    </div>
  )
}
