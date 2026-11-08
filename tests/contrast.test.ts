import { describe, expect, it } from 'vitest'
import { THEMES } from '../src/features/themes/themes'

// Tailwind v4 palette values (sRGB hex) used by the card, chips, list rows and panel.
const C = {
  white: '#ffffff',
  black: '#000000',
  n100: '#f5f5f5',
  n500: '#737373',
  n600: '#525252',
  n700: '#404040',
  n800: '#262626',
  n900: '#171717',
  blue50: '#eff6ff',
  blue600: '#155dfc',
  blue700: '#1447e6',
  amber100: '#fef3c6',
  amber900: '#7b3306',
}

// Field-guide design tokens (src/index.css @theme).
const T = {
  ink: '#1C2420',
  inkMuted: '#5B655F',
  link: '#1F6F5C',
  forest: '#1F6F5C',
  ground: '#F7F6F2',
  panel: '#FFFFFF',
  warnBg: '#FBEBC4',
  warnInk: '#6B4300',
  edge: '#8A938B',
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('WCAG contrast of panel colours', () => {
  const text: [string, string, string][] = [
    ['card body', C.n800, C.white],
    ['secondary text', C.n600, C.white],
    ['secondary text on hover row', C.n600, C.n100],
    ['unpressed chip / toggle', C.n700, C.white],
    ['pressed chip / toggle', C.white, C.n900],
    ['source link', C.blue700, C.white],
    ['warning badge', C.amber900, C.amber100],
    ['selected row name', C.n900, C.blue50],
    ['selected row secondary', C.n600, C.blue50],
    ['default heading', C.black, C.white],
  ]
  it.each(text)('%s text is at least 4.5:1', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  const ui: [string, string, string][] = [
    ['chip / toggle / button border', C.n500, C.white],
    ['sheet handle bar', C.n500, C.white],
    ['focus ring', C.blue600, C.white],
    ['selected row outline', C.blue700, C.white],
  ]
  it.each(ui)('%s is at least 3:1', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3)
  })

  const tokenText: [string, string, string][] = [
    ['ink text on white', T.ink, C.white],
    ['ink text on panel', T.ink, T.panel],
    ['ink text on ground', T.ink, T.ground],
    ['ink-muted text on white', T.inkMuted, C.white],
    ['ink-muted text on panel', T.inkMuted, T.panel],
    ['ink-muted text on ground', T.inkMuted, T.ground],
    ['link text on white', T.link, C.white],
    ['link text on panel', T.link, T.panel],
    ['link text on ground', T.link, T.ground],
    ['forest text on white', T.forest, C.white],
    ['forest text on panel', T.forest, T.panel],
    ['forest text on ground', T.forest, T.ground],
    ['white text on forest fill', C.white, T.forest],
    ['warn-ink on warn-bg', T.warnInk, T.warnBg],
  ]
  it.each(tokenText)('%s is at least 4.5:1', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('edge token is at least 3:1 on white', () => {
    expect(ratio(T.edge, C.white)).toBeGreaterThanOrEqual(3)
  })

  // Theme colours are used for map pins and colour dots (non-text UI), so each needs 3:1 against white.
  it.each(THEMES.map((t) => [t.label, t.color] as const))(
    'theme colour %s is at least 3:1 against white',
    (_label, color) => {
      expect(ratio(color, C.white)).toBeGreaterThanOrEqual(3)
    },
  )
})
