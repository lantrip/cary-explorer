import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  CLUSTER_SIZE,
  PIN_SIZE,
  buildPinSvg,
  getClusterStyle,
  getLabelBorderStyle,
  getPinStyle,
  pinGeometry,
  pinKey,
} from '../src/features/map/pinStyles'
import { CATEGORY_ICON } from '../src/features/themes/icons'

describe('pin styles', () => {
  // OpenLayers' Icon creates an Image; Node has none, so give it an inert stand-in.
  beforeAll(() => {
    vi.stubGlobal(
      'Image',
      class {
        addEventListener() {}
        removeEventListener() {}
        decode() {
          return new Promise(() => {})
        }
      },
    )
  })

  it('returns the same style object for the same key', () => {
    expect(getPinStyle('park', 'parks-trails', 'default')).toBe(getPinStyle('park', 'parks-trails', 'default'))
    expect(getClusterStyle(7)).toBe(getClusterStyle(7))
  })

  it('keys differ by category, theme and state', () => {
    const keys = [
      pinKey('park', 'parks-trails', 'default'),
      pinKey('trail', 'parks-trails', 'default'),
      pinKey('park', 'water', 'default'),
      pinKey('park', 'parks-trails', 'hover'),
      pinKey('park', 'parks-trails', 'selected', 'A'),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('selected differs from default: larger, on top, and labelled with the name', () => {
    const base = getPinStyle('history', 'history', 'default')
    const sel = getPinStyle('history', 'history', 'selected', 'Page-Walker Hotel')
    expect(sel).not.toBe(base)
    expect(sel.getZIndex()).toBeGreaterThan(base.getZIndex() ?? 0)
    expect(sel.getText()?.getText()).toBe('Page-Walker Hotel')
    expect(base.getText()).toBeNull()
    expect(PIN_SIZE).toEqual({ default: 28, hover: 28, selected: 36 })
    expect(buildPinSvg('history', '#9A4A2E', 'selected')).toContain('width="60"')
    expect(buildPinSvg('history', '#9A4A2E', 'default')).toContain('width="52"')
  })

  it('selected label is an ink-on-white pill above the pin with a 6px gap', () => {
    const text = getPinStyle('history', 'history', 'selected', 'Page-Walker Hotel').getText()!
    expect(text.getFont()).toContain('600 12px')
    expect(String(text.getFill()?.getColor()).toLowerCase()).toBe('#1c2420')
    expect(text.getBackgroundFill()?.getColor()).toBe('#ffffff')
    // Centre is above the tip by pin height + 6px gap + half the 26px pill.
    expect(text.getOffsetY()).toBeCloseTo(-(pinGeometry('selected').heightAboveTip + 6 + 13))
    expect(text.getOffsetY()).toBeLessThan(0)
    const border = getLabelBorderStyle('Page-Walker Hotel')
    expect(border).toBe(getLabelBorderStyle('Page-Walker Hotel'))
    expect(border.getText()?.getBackgroundStroke()?.getColor()).toBe('#E6E3DC')
    expect(border.getZIndex()).toBeLessThan(getPinStyle('history', 'history', 'selected', 'x').getZIndex() ?? 0)
  })

  it('geometry: head centre is at width/2 and the tip is the anchor', () => {
    for (const state of ['default', 'hover', 'selected'] as const) {
      const g = pinGeometry(state)
      const w = PIN_SIZE[state]
      expect(g.head.cy - 12).toBeCloseTo(w / 2)
      expect(g.head.cx).toBe(12 + w / 2)
      expect(g.tip.x).toBe(g.head.cx)
      expect(g.box.h).toBeCloseTo(w * 1.25 + 24)
    }
  })

  it('svg carries the theme colour, white ring and the category icon path', () => {
    const svg = buildPinSvg('water', '#2C6E9E', 'default')
    expect(svg).toContain('#2C6E9E')
    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toContain(CATEGORY_ICON.water)
    expect(buildPinSvg('water', '#2C6E9E', 'hover')).toContain('fill-opacity')
    expect(buildPinSvg('water', '#2C6E9E', 'selected')).toContain('#1F6F5C')
    expect(buildPinSvg('water', '#2C6E9E', 'default')).toContain('M20 1.5C9.8 1.5')
  })

  it('cluster style shows the count', () => {
    const styles = getClusterStyle(12)
    expect(styles.map((s) => s.getText()?.getText())).toContain('12')
    expect(getClusterStyle(13)).not.toBe(styles)
    expect(CLUSTER_SIZE).toBe(36)
  })
})
