// "Visit" block of the place card: sourced visit facts, a compact not-verified line and an access caution.
import type { ReactNode } from 'react'
import type { Place, Source } from '../../types/place'
import type { VisitFieldKey } from '../../types/data-model'
import { ACTION_BUTTON } from '../../lib/styles'
import { formatVerifiedDate, splitFields, usePlaceDetails } from './placeDetails'

const ICON_PROPS = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0 text-ink-muted',
} as const

const ICONS: Partial<Record<VisitFieldKey, string>> = {
  address: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
}

const ROW = 'grid grid-cols-[16px_96px_1fr] items-start gap-3 border-b border-line py-3'

function Row({ icon, label, children }: { icon?: string; label: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      {icon ? (
        <svg {...ICON_PROPS} className="mt-0.5 shrink-0 text-ink-muted">
          <path d={icon} />
        </svg>
      ) : (
        <span aria-hidden="true" className="h-4 w-4" />
      )}
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[14px] text-ink">{children}</dd>
    </div>
  )
}

interface VisitInfoProps {
  place: Place
  sources: Source[]
}

export function VisitInfo({ place, sources }: VisitInfoProps) {
  const { status, details, retry } = usePlaceDetails(place.id)
  const split = details ? splitFields(details.fields) : null
  const hasKnownAddress = split?.known.some((f) => f.key === 'address') ?? false
  const headingId = `place-${place.id}-visit`

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Visit
      </h3>

      {status === 'loading' && (
        <div aria-busy="true" className="border-t border-line py-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-subtle" />
          <span className="sr-only">Loading visit details</span>
        </div>
      )}

      {status === 'error' && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-t border-line py-3">
          <p className="text-[14px] text-ink-muted">Couldn&apos;t load visit details.</p>
          <button type="button" onClick={retry} className={ACTION_BUTTON}>
            Try again
          </button>
        </div>
      )}

      {status !== 'loading' && (
        <dl className="border-t border-line">
          {!hasKnownAddress && place.address && (
            <Row icon={ICONS.address} label="Address">
              {place.address}
            </Row>
          )}
          {split?.known.map((field) => {
            const source = sources.find((s) => s.id === field.sourceId)
            return (
              <Row key={field.key} icon={ICONS[field.key]} label={field.label}>
                {field.value}
                <span className="mt-1 block text-[13px] text-ink-muted">
                  Source: {source?.name ?? field.sourceId} ·{' '}
                  <time dateTime={field.verifiedAt}>{formatVerifiedDate(field.verifiedAt ?? '')}</time>
                </span>
              </Row>
            )
          })}
        </dl>
      )}

      {status === 'missing' && (
        <p className="text-[14px] text-ink-muted">Visit details aren&apos;t available for this place.</p>
      )}

      {/* Park visit fields (parking, restrooms, wheelchair...) do not apply to a fire station: only its address shows. */}
      {split && place.category !== 'fire-station' && (
        <div className="space-y-1 text-[13px] text-ink-muted">
          {split.known.length === 0 && <p className="text-[14px] text-ink">No visit details verified yet.</p>}
          {split.unknown.length > 0 && (
            <p>Not verified: {split.unknown.map((f) => f.label).join(', ')}</p>
          )}
          {split.wheelchairUnknown && <p>Wheelchair access: Not verified</p>}
        </div>
      )}

      {place.category === 'fire-station' && (
        <p className="text-[13px] font-medium text-ink">Not for emergencies. In an emergency, call 911.</p>
      )}

      <p className="text-[13px] text-ink-muted">
        A map pin is not permission to visit. Check the official page for access and hours.
      </p>
    </section>
  )
}
