// Long-press detection for picking a spot on the map. Pure: no DOM, no OpenLayers; the timer is injectable.
// A press counts when one pointer stays down for LONG_PRESS_MS without moving more than LONG_PRESS_TOLERANCE_PX.
// A second pointer (a pinch), a release, or too much movement cancels it.
export const LONG_PRESS_MS = 500
export const LONG_PRESS_TOLERANCE_PX = 6

export interface LongPressOptions {
  onLongPress: (x: number, y: number) => void
  delayMs?: number
  tolerancePx?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface LongPress {
  start: (pointerId: number, x: number, y: number) => void
  move: (pointerId: number, x: number, y: number) => void
  end: (pointerId: number) => void
  cancel: () => void
}

export function exceedsTolerance(x0: number, y0: number, x1: number, y1: number, tolerancePx: number): boolean {
  return Math.hypot(x1 - x0, y1 - y0) > tolerancePx
}

export function createLongPress(opts: LongPressOptions): LongPress {
  const delay = opts.delayMs ?? LONG_PRESS_MS
  const tolerance = opts.tolerancePx ?? LONG_PRESS_TOLERANCE_PX
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let active: { id: number; x: number; y: number; handle: unknown } | null = null
  // Pointers currently down; more than one means a pinch, so no press.
  const down = new Set<number>()

  const cancel = () => {
    if (active) clearTimer(active.handle)
    active = null
  }

  return {
    start(id, x, y) {
      down.add(id)
      cancel()
      if (down.size > 1) return
      const handle = setTimer(() => {
        if (!active || active.id !== id) return
        const { x: ax, y: ay } = active
        active = null
        opts.onLongPress(ax, ay)
      }, delay)
      active = { id, x, y, handle }
    },
    move(id, x, y) {
      if (active && active.id === id && exceedsTolerance(active.x, active.y, x, y, tolerance)) cancel()
    },
    end(id) {
      down.delete(id)
      if (active && active.id === id) cancel()
    },
    cancel() {
      down.clear()
      cancel()
    },
  }
}
