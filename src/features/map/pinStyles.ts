// Pure, cached OpenLayers styles for map pins and clusters. Pins are SVG data-URL icons so they
// can carry a ring, a soft shadow and the category's white stroke icon.
import { Fill, Icon, Stroke, Style, Text } from 'ol/style'
import CircleStyle from 'ol/style/Circle'
import type { CategoryId, ThemeId } from '../../types/place'
import { CATEGORY_ICON } from '../themes/icons'
import { getTheme } from '../themes/themes'

export type PinState = 'default' | 'hover' | 'selected'

const INK = '#1C2420'
const PINE = '#1F6F5C'
const LINE = '#E6E3DC'
const FONT = '600 13px "Inter Variable", Inter, system-ui, sans-serif'
const LABEL_FONT = '600 12px "Inter Variable", Inter, system-ui, sans-serif'

// Teardrop outline on a 40x50 box; scaled uniformly so the pin width is the only size input.
const PIN_PATH = 'M20 1.5C9.8 1.5 1.5 9.8 1.5 20c0 13.6 18.5 28 18.5 28s18.5-14.4 18.5-28C38.5 9.8 30.2 1.5 20 1.5z'
const PATH_W = 40
const PATH_H = 50
const PATH_TOP = 1.5
const PATH_TIP_Y = 48
const HEAD_CY = 20
const HEAD_R = 18.5

// Pin widths in px (height is 1.25x). The head circle's centre sits at y = width / 2.
export const PIN_SIZE = { default: 28, hover: 28, selected: 36 } as const
const PIN_ICON_PX = { default: 14, hover: 14, selected: 18 } as const
// Transparent margin around the teardrop for the shadow, hover halo and selected ring.
const PAD = 12
const STROKE = 2
const SELECTED_RING = 3
const LABEL_GAP = 6
// Label pill: 12px text + 1px vertical padding + 8px round-join stroke, plus the 1px border.
const LABEL_HEIGHT = 26

export const CLUSTER_SIZE = 36
export const SELECTED_Z_INDEX = 1000

interface PinGeometry {
  scale: number
  box: { w: number; h: number }
  head: { cx: number; cy: number; r: number }
  tip: { x: number; y: number }
  /** Distance from the tip up to the pin's outermost top edge (incl. stroke / selected ring). */
  heightAboveTip: number
}

/** Exact geometry of a pin in its SVG: everything derives from the width, nothing is hand-tuned. */
export function pinGeometry(state: PinState): PinGeometry {
  const width = PIN_SIZE[state]
  const scale = width / PATH_W
  const height = PATH_H * scale
  const outset = STROKE / 2 + (state === 'selected' ? SELECTED_RING : 0)
  return {
    scale,
    box: { w: width + PAD * 2, h: height + PAD * 2 },
    head: { cx: PAD + width / 2, cy: PAD + HEAD_CY * scale, r: HEAD_R * scale },
    tip: { x: PAD + width / 2, y: PAD + PATH_TIP_Y * scale },
    heightAboveTip: (PATH_TIP_Y - PATH_TOP) * scale + outset,
  }
}

/** SVG markup for one pin. Exported for tests; the icon path comes from CATEGORY_ICON. */
export function buildPinSvg(category: CategoryId, color: string, state: PinState): string {
  const g = pinGeometry(state)
  const t = `translate(${PAD} ${PAD}) scale(${g.scale})`
  // Strokes are authored in screen px, so divide by the shape scale.
  const px = (n: number) => +(n / g.scale).toFixed(4)
  const iconPx = PIN_ICON_PX[state]
  const iconScale = iconPx / 24
  const iconX = g.head.cx - iconPx / 2
  const iconY = g.head.cy - iconPx / 2
  const halo =
    state === 'hover'
      ? `<circle cx="${g.head.cx}" cy="${g.head.cy}" r="${g.head.r + 5}" fill="${color}" fill-opacity="0.22"/>`
      : ''
  const ring =
    state === 'selected'
      ? `<path transform="${t}" d="${PIN_PATH}" fill="${PINE}" stroke="${PINE}" ` +
        `stroke-width="${px(STROKE + SELECTED_RING * 2)}" stroke-linejoin="round"/>`
      : ''
  const body =
    `<path transform="${t}" d="${PIN_PATH}" fill="${color}" stroke="#ffffff" ` +
    `stroke-width="${px(STROKE)}" stroke-linejoin="round"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.box.w}" height="${g.box.h}" viewBox="0 0 ${g.box.w} ${g.box.h}">` +
    `<defs><filter id="s" x="-40%" y="-30%" width="180%" height="170%">` +
    `<feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="${INK}" flood-opacity="0.28"/></filter></defs>` +
    halo +
    `<g filter="url(#s)">${ring}${body}</g>` +
    `<g transform="translate(${iconX} ${iconY}) scale(${iconScale})" fill="none" stroke="#ffffff" ` +
    `stroke-width="${+(1.5 / iconScale).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${CATEGORY_ICON[category]}"/></g>` +
    `</svg>`
  )
}

export function pinDataUrl(category: CategoryId, color: string, state: PinState): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPinSvg(category, color, state))}`
}

/** Cache key. The name only matters for the selected pin, whose label shows it. */
export function pinKey(category: CategoryId, theme: ThemeId, state: PinState, name = ''): string {
  return state === 'selected' ? `${category}|${theme}|${state}|${name}` : `${category}|${theme}|${state}`
}

const pinCache = new Map<string, Style>()
const borderCache = new Map<string, Style>()
const clusterCache = new Map<number, Style[]>()

/** Label centre, relative to the anchor (the tip): pill bottom sits LABEL_GAP above the pin's top edge. */
const labelOffsetY = () => -(pinGeometry('selected').heightAboveTip + LABEL_GAP + LABEL_HEIGHT / 2)

function labelText(name: string, bgFill: string, bgStroke: string, strokeWidth: number): Text {
  return new Text({
    text: name,
    font: LABEL_FONT,
    fill: new Fill({ color: INK }),
    backgroundFill: new Fill({ color: bgFill }),
    // A round-joined stroke rounds the pill's corners; padding is reduced to compensate.
    backgroundStroke: new Stroke({ color: bgStroke, width: strokeWidth, lineJoin: 'round' }),
    padding: [1, 6, 1, 6],
    offsetY: labelOffsetY(),
    textAlign: 'center',
    textBaseline: 'middle',
  })
}

/** Style for one pin. Same arguments return the same Style object. */
export function getPinStyle(category: CategoryId, theme: ThemeId, state: PinState, name = ''): Style {
  const key = pinKey(category, theme, state, name)
  const hit = pinCache.get(key)
  if (hit) return hit

  if (state === 'selected') {
    // Only one pin is selected at a time, so drop older labelled styles.
    for (const k of pinCache.keys()) if (k.includes('|selected|')) pinCache.delete(k)
  }

  const { tip } = pinGeometry(state)
  const style = new Style({
    image: new Icon({
      src: pinDataUrl(category, getTheme(theme).color, state),
      // The tip of the teardrop sits exactly on the coordinate.
      anchor: [tip.x, tip.y],
      anchorXUnits: 'pixels',
      anchorYUnits: 'pixels',
    }),
    // White pill; its 1px border is drawn by getLabelBorderStyle just underneath.
    text: state === 'selected' && name ? labelText(name, '#ffffff', '#ffffff', 8) : undefined,
    zIndex: state === 'selected' ? SELECTED_Z_INDEX : state === 'hover' ? 2 : 1,
  })
  pinCache.set(key, style)
  return style
}

/** 1px #E6E3DC border for the selected label: the same pill, 2px larger, drawn just below it. */
export function getLabelBorderStyle(name: string): Style {
  const hit = borderCache.get(name)
  if (hit) return hit
  borderCache.clear()
  const style = new Style({
    text: labelText(name, LINE, LINE, 10),
    zIndex: SELECTED_Z_INDEX - 1,
  })
  borderCache.set(name, style)
  return style
}

/** Styles for a cluster of `count` places (count > 1): pine halo, white-ringed disc and the count. */
export function getClusterStyle(count: number): Style[] {
  const hit = clusterCache.get(count)
  if (hit) return hit
  const styles = [
    new Style({
      image: new CircleStyle({ radius: CLUSTER_SIZE / 2 + 5, fill: new Fill({ color: 'rgba(31,111,92,0.18)' }) }),
      zIndex: 3,
    }),
    new Style({
      image: new CircleStyle({
        radius: CLUSTER_SIZE / 2 - 1,
        fill: new Fill({ color: PINE }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
      text: new Text({
        text: String(count),
        font: FONT,
        fill: new Fill({ color: '#ffffff' }),
        textAlign: 'center',
        textBaseline: 'middle',
      }),
      zIndex: 4,
    }),
  ]
  clusterCache.set(count, styles)
  return styles
}
