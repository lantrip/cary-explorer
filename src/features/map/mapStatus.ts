// Tiny shared store for whether the map is usable, so search, list and card can read it later.
import { useSyncExternalStore } from 'react'
import { INITIAL_TILE_HEALTH, nextTileHealth, type TileEvent, type TileHealth } from './tileHealth'

export type MapStatus =
  | { state: 'ok' }
  | { state: 'unavailable'; reason: 'init' | 'tiles' }

const OK: MapStatus = { state: 'ok' }
const INIT_FAILED: MapStatus = { state: 'unavailable', reason: 'init' }
const TILES_FAILED: MapStatus = { state: 'unavailable', reason: 'tiles' }

let initFailed = false
let tileHealth: TileHealth = INITIAL_TILE_HEALTH
let status: MapStatus = OK
const listeners = new Set<() => void>()

function recompute() {
  const next = initFailed ? INIT_FAILED : tileHealth.failed ? TILES_FAILED : OK
  if (next === status) return
  status = next
  listeners.forEach((l) => l())
}

export function getMapStatus(): MapStatus {
  return status
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportMapInitFailed() {
  initFailed = true
  recompute()
}

export function reportTileEvent(event: TileEvent) {
  tileHealth = nextTileHealth(tileHealth, event)
  recompute()
}

/** Called when a map starts up or is torn down. */
export function resetMapStatus() {
  initFailed = false
  tileHealth = INITIAL_TILE_HEALTH
  recompute()
}

export function useMapStatus(): MapStatus {
  return useSyncExternalStore(subscribe, getMapStatus)
}
