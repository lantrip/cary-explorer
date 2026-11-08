import { describe, expect, it } from 'vitest'
import { DESKTOP_PANEL_WIDTH, desktopSelectionPadding } from '../src/lib/layout'

describe('desktopSelectionPadding', () => {
  it('keeps clear of the open panel', () => {
    expect(desktopSelectionPadding(false)[3]).toBe(DESKTOP_PANEL_WIDTH + 40)
  })
  it('uses 40px on the left when collapsed', () => {
    expect(desktopSelectionPadding(true)).toEqual([40, 40, 40, 40])
  })
})
