// Pure helpers for dragging the mobile bottom sheet between its three snap states.
import { sheetHeightPx } from '../../lib/layout'
import type { SheetState } from '../../store/useAppStore'

// Movement below this many px is a tap, not a drag.
export const TAP_THRESHOLD_PX = 6
// A release faster than this (px per ms) is a flick: move one state in that direction.
export const FLICK_VELOCITY_PX_PER_MS = 0.5
export const SNAP_ANIMATION_MS = 200
// Only samples this recent count towards the release velocity.
const VELOCITY_WINDOW_MS = 100

const ORDER: SheetState[] = ['peek', 'half', 'full']

export interface PickSnapInput {
  startState: SheetState
  startHeight: number
  currentHeight: number
  // Positive = the sheet was moving up (growing) at release.
  velocityPxPerMs: number
  windowHeight: number
}

// The state to snap to after a drag, or null when the movement was a tap (let the button click handle it).
export function pickSnap(input: PickSnapInput): SheetState | null {
  const { startState, startHeight, currentHeight, velocityPxPerMs, windowHeight } = input
  if (Math.abs(currentHeight - startHeight) < TAP_THRESHOLD_PX) return null
  const index = ORDER.indexOf(startState)
  if (Math.abs(velocityPxPerMs) > FLICK_VELOCITY_PX_PER_MS) {
    const step = velocityPxPerMs > 0 ? 1 : -1
    return ORDER[Math.min(ORDER.length - 1, Math.max(0, index + step))]
  }
  let best = ORDER[0]
  let bestDistance = Infinity
  for (const state of ORDER) {
    const distance = Math.abs(sheetHeightPx(state, windowHeight) - currentHeight)
    if (distance < bestDistance) {
      best = state
      bestDistance = distance
    }
  }
  return best
}

// Keep the dragged height between the peek and full heights (insetPx is the bottom safe-area inset added to peek).
export function clampSheetHeight(height: number, windowHeight: number, insetPx = 0): number {
  return Math.min(sheetHeightPx('full', windowHeight), Math.max(sheetHeightPx('peek', windowHeight) + insetPx, height))
}

export interface PointerSample {
  y: number
  t: number
}

// Vertical velocity in px/ms (positive = moving up) from the recent pointer samples, oldest first.
export function velocityFromSamples(samples: PointerSample[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const recent = samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW_MS)
  const first = recent[0]
  const dt = last.t - first.t
  return dt > 0 ? (first.y - last.y) / dt : 0
}

// How long the snap animation runs: none when the user prefers reduced motion.
export function snapAnimationMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : SNAP_ANIMATION_MS
}
