// Click and hover picking: when several layers are hit at one pixel, pins and clusters win, then lines, then areas.
export type PickKind = 'pin' | 'line' | 'area'

const RANK: Record<PickKind, number> = { pin: 0, line: 1, area: 2 }

/** The highest-priority hit (pin, then line, then area); the first of equals. Undefined for no hits. */
export function pickBest<T extends { kind: PickKind }>(hits: readonly T[]): T | undefined {
  let best: T | undefined
  for (const h of hits) if (!best || RANK[h.kind] < RANK[best.kind]) best = h
  return best
}
