// The town sentence for the chosen town, memoised on the loaded catalog.
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { usePlaces } from '../places/usePlaces'
import { coverageFor, townNote } from './coverage'

export function useTownNote(): string | null {
  const town = useAppStore((s) => s.town)
  const { places, status } = usePlaces()
  return useMemo(() => townNote(town, status === 'ready' ? coverageFor(places, town) : null), [town, places, status])
}
