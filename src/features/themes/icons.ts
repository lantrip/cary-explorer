// Stroke icons for each place category, as SVG path data on a 24x24 viewBox.
import type { CategoryId } from '../../types/place'

export const CATEGORY_ICON: Record<CategoryId, string> = {
  park: 'M12 3l5 7h-3l4 6H6l4-6H7z M12 16v5',
  trail: 'M7 21c0-4 3-5 3-9S7 7 7 3 M17 21c0-4-3-5-3-9s3-5 3-9',
  history: 'M3 21h18 M5 21V10 M9.5 21V10 M14.5 21V10 M19 21V10 M2 10l10-6 10 6z',
  wildlife:
    'M3 12c3-1 5-4 9-4 3 0 5 2 6 4l3 1-3 1c-1 3-4 5-8 5-2 0-4-1-5-2 M7 17l-2 3 M15 10h.01',
  water: 'M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2 M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2',
  art: 'M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01',
  community:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 11a2.5 2.5 0 1 0 0-5 M3 20c0-3 3-5 6-5s6 2 6 5 M15 15c3 0 6 1.5 6 5',
  'fire-station': 'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z M5 21h14',
}

/** Shared SVG root attributes for category icons (React prop names). */
export const ICON_SVG_ATTRS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Icon pixel sizes. sm: inside buttons, chips, rows, inline text; md: map controls and card header actions. */
export const ICON_SIZE = { sm: 16, md: 20 } as const

/** Round category badge diameters in pixels. */
export const BADGE_SIZE = { sm: 28, md: 36 } as const

export type IconSize = keyof typeof ICON_SIZE
