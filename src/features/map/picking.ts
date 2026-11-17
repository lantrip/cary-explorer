// Click and hover picking: when several layers are hit at one pixel, pins and clusters win, then lines, then areas.
export type PickKind = 'pin' | 'line' | 'area'

const RANK: Record<PickKind, number> = { pin: 0, line: 1, area: 2 }

/** The highest-priority hit (pin, then line, then area); the first of equals. Undefined for no hits. */
export function pickBest<T extends { kind: PickKind }>(hits: readonly T[]): T | undefined {
  let best: T | undefined
  for (const h of hits) if (!best || RANK[h.kind] < RANK[best.kind]) best = h
  return best
}

/**
 * Is a picked spot "on a place"? Pins, lines and park outlines count. Area features of water places
 * (the HUC-12 watershed polygons, which cover the whole map) do not, so a long-press on a blank street still picks a point.
 * `placeId` is the area feature's place; `categoryOf` looks up a place's category.
 */
export function isOnPlace(
  hits: readonly { kind: PickKind; placeId?: string }[],
  categoryOf: (placeId: string) => string | undefined,
): boolean {
  return hits.some((h) => h.kind !== 'area' || h.placeId === undefined || categoryOf(h.placeId) !== 'water')
}
