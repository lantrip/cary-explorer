// Class strings shared by more than one component (kept whole so Tailwind can see them).
export const ACTION_BUTTON =
  'min-h-11 rounded-control border border-forest px-4 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link'

/** Dashed placeholder card for empty states; add spacing or background classes at the call site. */
export const EMPTY_CARD = 'rounded-card border border-dashed border-placeholder-line p-5'

/** Pill-shaped toggle button in the theme filter row. */
export const CHIP =
  'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-medium whitespace-nowrap text-ink-muted hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-1'
