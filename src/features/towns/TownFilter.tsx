// Town dropdown plus the one-line coverage note for the chosen town.
import { useId } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { TOWNS, isTownSlug } from './coverage'
import { useTownNote } from './useTownNote'

export function TownFilter({ compact = false }: { compact?: boolean }) {
  const town = useAppStore((s) => s.town)
  const setTown = useAppStore((s) => s.setTown)
  const id = useId()
  const townNoteText = useTownNote()
  const note = compact ? null : townNoteText

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={compact ? 'sr-only' : 'text-[13px] font-medium text-ink-muted'}>
        Town
      </label>
      <div className="relative">
        {compact && (
          <svg
            aria-hidden="true"
            focusable="false"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          >
            <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        )}
        <select
          id={id}
          value={town ?? ''}
          onChange={(e) => setTown(isTownSlug(e.target.value) ? e.target.value : null)}
          className={`h-11 w-full appearance-none rounded-control border border-line bg-white pr-10 ${compact ? 'pl-9' : 'pl-3'} text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-1`}
        >
          <option value="">All towns</option>
          {TOWNS.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          focusable="false"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {note && <p className="text-[13px] leading-snug text-ink-muted">{note}</p>}
    </div>
  )
}
