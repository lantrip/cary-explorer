// Shared layout sizes: the desktop side panel width, used by the panel itself and by the map's padding and offsets.
export const DESKTOP_PANEL_WIDTH = 400
// DOM id of the desktop side panel, referenced by the collapse / show buttons via aria-controls.
export const DESKTOP_PANEL_ID = 'desktop-panel'

// Desktop map padding [top, right, bottom, left] for fitting a selection: clear of the panel only while it is open.
export function desktopSelectionPadding(panelCollapsed: boolean): [number, number, number, number] {
  return [40, 40, 40, panelCollapsed ? 40 : DESKTOP_PANEL_WIDTH + 40]
}

// Mobile bottom sheet heights. Shared by the sheet (drag snapping) and the map (padding and control offsets).
export type SheetSnap = 'peek' | 'half' | 'full'
export const PEEK_SHEET_PX = 112
export const HALF_SHEET_RATIO = 0.5
export const FULL_SHEET_RATIO = 0.9

// Sheet height in px for a snap state (peek 112px, half ~50%, full ~90% of the window).
export function sheetHeightPx(state: SheetSnap, windowHeight: number = window.innerHeight): number {
  switch (state) {
    case 'peek':
      return PEEK_SHEET_PX
    case 'half':
      return windowHeight * HALF_SHEET_RATIO
    case 'full':
      return windowHeight * FULL_SHEET_RATIO
  }
}
