// "Credits & privacy" modal. Opened by the URL param `about=1` (see useUrlSync). A native modal <dialog> provides the
// focus trap, inert background and Escape; this component adds the Close button, backdrop click and focus return.
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { publicUrl } from '../../lib/guards'
import { ReleaseLine } from '../places/ReleaseLine'
import { useRelease } from '../places/release'
import { usePlaces } from '../places/usePlaces'
import { BASEMAP_CREDIT, buildCreditsRows, formatCreditDate, showEbirdSection, type CreditsRow } from './credits'
import { CREDITS_BUTTON_ID } from './CreditsButton'
import { PrivacyNotice } from './PrivacyNotice'

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'
const linkClass = `font-medium text-link underline underline-offset-2 hover:text-ink ${focusRing}`
const h3Class = 'font-display text-lg font-semibold text-ink'

function SourceRow({ row }: { row: CreditsRow }) {
  return (
    <li className="space-y-1 rounded-control border border-line bg-white p-3 text-[13px] text-ink-muted">
      <p className="flex flex-wrap items-baseline gap-x-2">
        {row.url && publicUrl(row.url) ? (
          <a href={row.url} target="_blank" rel="noopener noreferrer" className={`text-[15px] ${linkClass}`}>
            {row.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-[15px] font-medium text-ink">{row.title}</span>
        )}
        {row.name !== row.title && <span className="text-xs">{row.name}</span>}
        {!row.ok && (
          <span className="rounded-lg bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">
            Last refresh failed: showing older data
          </span>
        )}
      </p>
      <p>Licence: {row.licence}</p>
      {row.credit && <p className="font-medium text-ink-soft">{row.credit}</p>}
      {(row.updatedText || row.staleText) && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          {row.updatedText && <span>{row.updatedText}</span>}
          {row.staleText && (
            <span className="rounded-lg bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">{row.staleText}</span>
          )}
        </p>
      )}
      <p>
        {row.retrievedAt && (
          <>
            Retrieved <time dateTime={row.retrievedAt}>{formatCreditDate(row.retrievedAt)}</time>
          </>
        )}
        {row.retrievedAt && row.lastSuccess && ' · '}
        {row.lastSuccess && (
          <>
            Last successful refresh <time dateTime={row.lastSuccess}>{formatCreditDate(row.lastSuccess)}</time>
          </>
        )}
      </p>
      {row.recordCount !== undefined && <p>{row.recordCount.toLocaleString('en-US')} places</p>}
    </li>
  )
}

export function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen)
  return open ? <OpenDialog /> : null
}

function OpenDialog() {
  const closeAbout = useAppStore((s) => s.closeAbout)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { sources: catalogSources } = usePlaces()
  const release = useRelease()
  const rows = release ? buildCreditsRows(release.sources, catalogSources) : []

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // What had focus before the dialog opened; Safari does not focus buttons on click, so fall back to the entry point.
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      if (dialog.open) dialog.close()
      const target = opener?.isConnected ? opener : document.getElementById(CREDITS_BUTTON_ID)
      target?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="about-title"
      // Escape: keep the store (and so the URL) as the source of truth rather than letting the dialog close itself.
      onCancel={(e) => {
        e.preventDefault()
        closeAbout()
      }}
      // A click on the backdrop lands on the dialog element itself, not on its content.
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAbout()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-panel p-0 text-ink shadow-lg backdrop:bg-black/40"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="about-title" className="font-display text-[22px] leading-tight font-semibold text-ink">
            Credits &amp; privacy
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={closeAbout}
            className={`inline-flex h-11 shrink-0 items-center justify-center rounded-control border border-line bg-white px-4 text-sm font-semibold text-forest hover:bg-subtle ${focusRing}`}
          >
            Close
          </button>
        </div>

        <div className="space-y-7 overflow-y-auto px-5 py-5">
          <section aria-labelledby="about-sources" className="space-y-3">
            <h3 id="about-sources" className={h3Class}>
              Data sources
            </h3>
            <p className="text-[14px] leading-relaxed text-ink-soft">
              Every place comes from one or more of these sources. This list is generated from the published data release.
            </p>
            {release ? (
              <>
                {rows.length > 0 ? (
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <SourceRow key={row.id} row={row} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-ink-muted">This release does not list any sources.</p>
                )}
                <ReleaseLine release={release} />
              </>
            ) : (
              <p role="status" className="text-[14px] text-ink-muted">
                Source details are not available right now.
              </p>
            )}
          </section>

          <section aria-labelledby="about-map" className="space-y-2">
            <h3 id="about-map" className={h3Class}>
              Map
            </h3>
            <p className="text-[14px] leading-relaxed text-ink-soft">
              The basemap is {BASEMAP_CREDIT.provider} map data,{' '}
              <a href={BASEMAP_CREDIT.copyrightUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {BASEMAP_CREDIT.text}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              , under the Open Database Licence. The credit stays visible in the corner of the map. The map is drawn with{' '}
              <a href={BASEMAP_CREDIT.libraryUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {BASEMAP_CREDIT.library}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              , an open-source library (BSD 2-Clause licence).
            </p>
          </section>

          {showEbirdSection(catalogSources) && (
            <section aria-labelledby="about-ebird" className="space-y-2">
              <h3 id="about-ebird" className={h3Class}>
                eBird
              </h3>
              <p className="text-[14px] leading-relaxed text-ink-soft">
                Bird hotspot data is © Cornell Lab of Ornithology / eBird, used under{' '}
                <a href="https://www.birds.cornell.edu/home/ebird-api-terms-of-use/" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  eBird&apos;s terms
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                . Photos and audio from eBird and the Macaulay Library are not included here; they belong to their
                contributors and need separate rights.
              </p>
            </section>
          )}

          <PrivacyNotice headingId="about-privacy" />
        </div>
      </div>
    </dialog>
  )
}
