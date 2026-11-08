// Category icon and round badge: stroke icons drawn from CATEGORY_ICON, decorative only (aria-hidden).
import type { CSSProperties } from 'react'
import type { CategoryId } from '../../types/place'
import { CATEGORY_THEME, getTheme } from './themes'
import { BADGE_SIZE, CATEGORY_ICON, ICON_SIZE, ICON_SVG_ATTRS, type IconSize } from './icons'

export function CategoryIcon({
  category,
  size = 'sm',
  color = '#FFFFFF',
  strokeWidth = 2,
  className,
}: {
  category: CategoryId
  size?: IconSize | number
  color?: string
  strokeWidth?: number
  className?: string
}) {
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  return (
    <svg
      {...ICON_SVG_ATTRS}
      width={px}
      height={px}
      stroke={color}
      strokeWidth={strokeWidth}
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={CATEGORY_ICON[category]} />
    </svg>
  )
}

/**
 * Round badge filled with the theme colour, white 2px border, white icon centred.
 * `color` defaults to the colour of the category's theme. `ring` adds a halo in the same colour.
 */
export function CategoryBadge({
  category,
  color,
  size = 'md',
  ring,
}: {
  category: CategoryId
  color?: string
  size?: 'sm' | 'md' | number
  ring?: boolean
}) {
  const px = typeof size === 'number' ? size : BADGE_SIZE[size]
  const iconPx = typeof size === 'number' ? Math.round(size * 0.5) : size === 'sm' ? 14 : 18
  const fill = color ?? getTheme(CATEGORY_THEME[category]).color
  const style: CSSProperties = {
    width: px,
    height: px,
    borderRadius: '9999px',
    backgroundColor: fill,
    border: '2px solid #FFFFFF',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: ring ? `0 0 0 2px ${fill}` : undefined,
  }
  return (
    <span style={style} aria-hidden="true">
      <CategoryIcon category={category} size={iconPx} color="#FFFFFF" />
    </span>
  )
}
