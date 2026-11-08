import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getMapStatus,
  reportMapInitFailed,
  reportTileEvent,
  resetMapStatus,
  subscribe,
} from '../src/features/map/mapStatus'
import {
  INITIAL_TILE_HEALTH,
  TILE_ERROR_LIMIT,
  nextTileHealth,
  type TileEvent,
} from '../src/features/map/tileHealth'

const run = (events: TileEvent[]) => events.reduce(nextTileHealth, INITIAL_TILE_HEALTH)

describe('nextTileHealth', () => {
  it('stays healthy below the error limit', () => {
    expect(run(['error', 'error']).failed).toBe(false)
  })

  it('fails after 3 errors with no success in between', () => {
    expect(TILE_ERROR_LIMIT).toBe(3)
    expect(run(['error', 'error', 'error']).failed).toBe(true)
    expect(run(['error', 'error', 'error', 'error']).failed).toBe(true)
  })

  it('a success resets the count', () => {
    expect(run(['error', 'error', 'success', 'error', 'error']).failed).toBe(false)
    expect(run(['error', 'error', 'success', 'error', 'error', 'error']).failed).toBe(true)
  })

  it('a successful tile load clears a failed state', () => {
    expect(run(['error', 'error', 'error', 'success'])).toEqual(INITIAL_TILE_HEALTH)
  })

  it('does not mutate its input and returns the same object for a no-op success', () => {
    const state = { consecutiveErrors: 1, failed: false }
    nextTileHealth(state, 'error')
    expect(state).toEqual({ consecutiveErrors: 1, failed: false })
    expect(nextTileHealth(INITIAL_TILE_HEALTH, 'success')).toBe(INITIAL_TILE_HEALTH)
  })
})

describe('map status store', () => {
  afterEach(() => resetMapStatus())

  it('starts ok with a stable snapshot', () => {
    expect(getMapStatus()).toEqual({ state: 'ok' })
    expect(getMapStatus()).toBe(getMapStatus())
  })

  it('reports tiles unavailable after repeated errors, notifies once, and clears on success', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    reportTileEvent('error')
    reportTileEvent('error')
    expect(getMapStatus().state).toBe('ok')
    expect(listener).not.toHaveBeenCalled()
    reportTileEvent('error')
    expect(getMapStatus()).toEqual({ state: 'unavailable', reason: 'tiles' })
    expect(listener).toHaveBeenCalledTimes(1)
    reportTileEvent('success')
    expect(getMapStatus().state).toBe('ok')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('init failure stays unavailable despite tile successes until reset', () => {
    reportMapInitFailed()
    reportTileEvent('success')
    expect(getMapStatus()).toEqual({ state: 'unavailable', reason: 'init' })
    resetMapStatus()
    expect(getMapStatus().state).toBe('ok')
  })
})
