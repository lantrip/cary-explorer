// Detail card for one place: name, category and theme, location, description, address, sources and a close button.
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { Place } from '../../types/place'
import { CategoryBadge } from '../themes/CategoryIcon'
import { categoryLabel, getTheme } from '../themes/themes'
import { formatUtcLongDate } from '../../lib/dates'
import { publicUrl } from '../../lib/guards'
import {
  MAP_SELECTOR,
  SEARCH_SELECTOR,
  captureFocusOrigin,
  chooseFocusTarget,
} from './focusReturn'
import { FavoriteButton } from '../favorites/FavoriteButton'
import { distanceMeters, formatMilesShort } from '../location/distance'
import { useLocationStore } from '../location/locationStore'
import { CoverageLabel } from '../towns/CoverageLabel'
import { ConnectedPlaces } from './ConnectedPlaces'
import { ReleaseLine } from './ReleaseLine'
import { useRelease } from './release'
import { anySourceStale } from './freshness'
import { hasProposedPart, useGeometryLayers } from '../map/layers'
import { usePlaces } from './usePlaces'
import { VisitInfo } from './VisitInfo'

interface PlaceCardProps {
  place: Place
  onClose: () => void
}

export function PlaceCard({ place, onClose }: PlaceCardProps) {
  const theme = getTheme(place.theme)
  const { sources } = usePlaces()
  const release = useRelease()
  const [viewTime] = useState(() => new Date())
  const proposedPart = hasProposedPart(useGeometryLayers().index.get(place.id))
  const userCoords = useLocationStore((s) => s.coords)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const isEbird = place.sourceIds.includes('ebird')
  const officialLinkLabel = isEbird ? 'eBird page' : 'Website'
  const showOfficialLink = Boolean(place.url) && publicUrl(place.url)
  const location = [place.municipality, place.county].filter(Boolean).join(', ')
  // Hide the category label when it repeats the theme chip (e.g. "History" / "History").
  const categoryName = categoryLabel[place.category]
  const showCategory = categoryName.toLowerCase() !== theme.label.toLowerCase()
  const meta = [showCategory ? categoryName : null, location].filter(Boolean).join(' · ')

  // Remember what had focus when this place became selected (before the heading takes it).
  // PanelBody keys the card by place id, so this runs once per selection, before the heading takes focus.
  const [origin] = useState(captureFocusOrigin)

  // Move focus to the name whenever a place is selected so keyboard and screen reader users land on the card.
  useEffect(() => {
    // preventScroll: on phones the sheet is still growing, so a scrolling focus would leave the card cut off.
    // Instead the card's scroll area starts at the top, so the band and name are visible.
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 })
  }, [place.id])

  function handleClose() {
    const { element, rowPlaceId, fromMap } = origin
    const target = chooseFocusTarget({
      rememberedConnected: element?.isConnected ?? false,
      rememberedWasListRow: rowPlaceId !== null,
      fromMap,
    })
    onClose()
    // The card unmounts once the selection clears, so move focus explicitly.
    if (target === 'remembered') element?.focus()
    else if (target === 'row' && rowPlaceId !== null) {
      // The row is not rendered in map view: go back to the list, then focus the row after it renders.
      useAppStore.getState().setView('list')
      requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(
          `[data-place-id="${CSS.escape(rowPlaceId)}"]`,
        )
        ;(row ?? document.querySelector<HTMLElement>(SEARCH_SELECTOR))?.focus()
      })
    } else if (target === 'map') document.querySelector<HTMLElement>(MAP_SELECTOR)?.focus()
    else document.querySelector<HTMLElement>(SEARCH_SELECTOR)?.focus()
  }

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>('idle')
  const [fallbackUrl, setFallbackUrl] = useState('')
  const copyTimer = useRef<number | undefined>(undefined)
  const fallbackInput = useRef<HTMLInputElement>(null)

  // Stop the "Link copied" timer if the card unmounts first.
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  // When the clipboard is unavailable, the URL field opens with its text selected for manual copying.
  useEffect(() => {
    if (copyState !== 'fallback') return
    fallbackInput.current?.focus()
    fallbackInput.current?.select()
  }, [copyState])

  async function handleCopyLink() {
    const url = window.location.href
    window.clearTimeout(copyTimer.current)
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        setCopyState('copied')
        copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2000)
        return
      } catch {
        // Rejected (for example, no permission): fall through to the manual copy field.
      }
    }
    setFallbackUrl(url)
    setCopyState('fallback')
  }

  return (
    <article
      aria-labelledby={`place-${place.id}-name`}
      className="overflow-hidden rounded-card border border-line bg-white shadow-sm"
    >
      <div className="relative h-24" style={{ backgroundColor: theme.tint }}>
        <div aria-hidden="true" className="flex h-full items-center justify-center">
          <CategoryBadge category={place.category} color={theme.color} size="md" />
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="absolute top-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-sm">
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="inline-flex h-7 items-center gap-2 rounded-full px-3 font-semibold text-ink" style={{ backgroundColor: theme.tint }}>
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: theme.color }}
              />
              {theme.label}
            </span>
            {place.localOnly && (
              <span className="rounded-lg bg-subtle px-2 py-1 text-xs font-semibold text-ink-muted">
                Local preview
              </span>
            )}
          </div>
          <h2
            id={`place-${place.id}-name`}
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[26px] leading-tight font-semibold text-ink"
          >
            {place.name}
          </h2>
          {(meta || place.coverage === 'nearby' || place.coverage === 'outside') && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-ink-muted">
              {meta}
              <CoverageLabel coverage={place.coverage} />
            </p>
          )}
          {proposedPart && (
            <p className="text-[13px] leading-snug text-ink-muted">Dashed sections are proposed and not built yet.</p>
          )}
        </div>

        {userCoords && (
          <p className="text-[13px] leading-snug text-ink-muted">
            About {formatMilesShort(distanceMeters(userCoords, place.centroid))} from you (straight-line)
          </p>
        )}

        <p className="text-[15px] leading-relaxed text-ink-soft">
          {place.description || 'A description has not been added yet.'}
        </p>

        <ConnectedPlaces place={place} />

        <VisitInfo place={place} sources={sources} />

        <div className="space-y-2">
          <FavoriteButton placeId={place.id} />
          <div className={showOfficialLink ? 'grid grid-cols-2 gap-2' : undefined}>
            {showOfficialLink && (
              <a
                href={place.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-line bg-white px-4 font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
              >
                {officialLinkLabel}
                <span className="sr-only"> (opens in a new tab)</span>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-line bg-white px-4 font-semibold text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                width={16}
                height={16}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Copy link
            </button>
          </div>
          <div role="status" className="min-h-5 text-[13px] font-semibold text-forest">
            {copyState === 'copied' ? 'Link copied' : null}
          </div>
          {copyState === 'fallback' && (
            <div className="space-y-1">
              <label htmlFor={`place-${place.id}-link`} className="text-[13px] text-ink-muted">
                Copy this link
              </label>
              <input
                id={`place-${place.id}-link`}
                ref={fallbackInput}
                type="text"
                readOnly
                value={fallbackUrl}
                className="h-11 w-full rounded-control border border-line bg-white px-3 text-[14px] text-ink"
              />
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-line pt-4 text-[13px] text-ink-muted">
          <section aria-labelledby={`place-${place.id}-sources`} className="space-y-2">
            <h3
              id={`place-${place.id}-sources`}
              className="text-xs font-semibold tracking-wide uppercase"
            >
              Sources
            </h3>
            <ul className="space-y-3">
              {place.sourceIds.map((id) => {
                const source = sources.find((s) => s.id === id)
                if (!source) return <li key={id}>{id}</li>
                return (
                  <li key={id}>
                    {publicUrl(source.url) ? (
                      <a
                        href={source.url}
                        className="font-medium text-link underline underline-offset-2 hover:text-ink"
                      >
                        {id === 'ebird' ? 'Data: eBird.org' : source.name}
                      </a>
                    ) : (
                      <span className="font-medium text-ink">{source.name}</span>
                    )}
                    {source.retrievedAt && (
                      <p>
                        {id === 'ebird' ? 'Snapshot ' : 'Retrieved '}
                        <time dateTime={source.retrievedAt}>{formatUtcLongDate(source.retrievedAt)}</time>
                      </p>
                    )}
                    {source.license && <p>Licence: {source.license}</p>}
                  </li>
                )
              })}
            </ul>
            {release && anySourceStale(release.sources, place.sourceIds, viewTime) && (
              <p className="text-xs text-ink-muted">Some source data is older than expected.</p>
            )}
            <ReleaseLine release={release} />
          </section>
        </div>
      </div>
    </article>
  )
}
