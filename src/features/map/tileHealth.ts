// Pure rule for deciding when the basemap tiles count as failed.
export const TILE_ERROR_LIMIT = 3

export type TileEvent = 'error' | 'success'

export interface TileHealth {
  /** Tile load errors since the last successful tile load. */
  consecutiveErrors: number
  failed: boolean
}

export const INITIAL_TILE_HEALTH: TileHealth = { consecutiveErrors: 0, failed: false }

/** Tiles fail after TILE_ERROR_LIMIT errors with no success in between; any success clears it. */
export function nextTileHealth(state: TileHealth, event: TileEvent): TileHealth {
  if (event === 'success') {
    return state.consecutiveErrors === 0 && !state.failed ? state : INITIAL_TILE_HEALTH
  }
  const consecutiveErrors = state.consecutiveErrors + 1
  return { consecutiveErrors, failed: consecutiveErrors >= TILE_ERROR_LIMIT }
}
