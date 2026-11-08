// Pure-ish helpers for returning focus when the place card closes.

export type FocusTarget = 'remembered' | 'row' | 'map' | 'search'

interface FocusReturnInput {
  /** The element focused just before the card took focus is still in the document. */
  rememberedConnected: boolean
  /** The remembered element was a list row (carried a data-place-id) that is no longer rendered. */
  rememberedWasListRow: boolean
  /** The selection came from a map tap (nothing, or the map itself, had focus). */
  fromMap: boolean
}

// Where focus goes when the card closes: the remembered element, else its list row, else the map, else search.
export function chooseFocusTarget(input: FocusReturnInput): FocusTarget {
  if (input.rememberedConnected) return 'remembered'
  if (input.rememberedWasListRow) return 'row'
  return input.fromMap ? 'map' : 'search'
}

export interface Remembered {
  element: HTMLElement | null
  rowPlaceId: string | null
  fromMap: boolean
}

export const MAP_SELECTOR = '[role="region"]'
export const SEARCH_SELECTOR = '[role="combobox"]'

// Read during render, before the commit removes a clicked list row (which would drop focus to the body).
export function captureFocusOrigin(): Remembered {
  const active = document.activeElement
  const element = active instanceof HTMLElement && active !== document.body ? active : null
  return {
    element,
    rowPlaceId: element?.dataset.placeId ?? null,
    fromMap: element === null || element.matches(MAP_SELECTOR),
  }
}

