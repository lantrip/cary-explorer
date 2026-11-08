// Catalogue of the five themes that places are grouped under, each with its map/UI colour.
import type { CategoryId, ThemeId } from '../../types/place'

export interface Theme {
  id: ThemeId
  label: string
  color: string
  /** Pale tint of the theme colour, for chips and backgrounds. */
  tint: string
}

export const THEMES: readonly Theme[] = [
  { id: 'parks-trails', label: 'Parks & trails', color: '#2F7A4A', tint: '#E7F1EA' },
  { id: 'history', label: 'History', color: '#A3502E', tint: '#F6E9E3' },
  { id: 'birds-wildlife', label: 'Birds & wildlife', color: '#B0650F', tint: '#F8EEDF' },
  { id: 'water', label: 'Water', color: '#2A6CA6', tint: '#E4EEF6' },
  { id: 'art-community', label: 'Art & community', color: '#85509A', tint: '#F1E8F4' },
]

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export const CATEGORY_THEME: Record<CategoryId, ThemeId> = {
  park: 'parks-trails',
  trail: 'parks-trails',
  history: 'history',
  wildlife: 'birds-wildlife',
  water: 'water',
  art: 'art-community',
  community: 'art-community',
  'fire-station': 'art-community',
}

export const categoryLabel: Record<CategoryId, string> = {
  park: 'Park',
  trail: 'Trail',
  history: 'History',
  wildlife: 'Wildlife',
  water: 'Water',
  art: 'Art',
  community: 'Community',
  'fire-station': 'Fire station',
}
