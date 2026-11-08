// "Near me" toggle and its status message for the list header. Location is requested only when pressed.
import { NEAR_ME_UNAVAILABLE_TEXT, useLocationStore } from './locationStore'

export function NearMeBar() {
  const status = useLocationStore((s) => s.status)
  const request = useLocationStore((s) => s.request)
  const stop = useLocationStore((s) => s.stop)
  const on = status === 'on'
  const requesting = status === 'requesting'
  const failed = status === 'denied' || status === 'unavailable' || status === 'error'

  return (
    <div className="space-y-2 border-b border-line px-6 py-3">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => (on || requesting ? stop() : request())}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control border border-forest px-4 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link ${
          on ? 'bg-forest-tint' : 'bg-white'
        }`}
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
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
        Near me
      </button>
      <div role="status" className="text-[13px] leading-snug text-ink-muted">
        {requesting
          ? 'Finding your location…'
          : failed
            ? NEAR_ME_UNAVAILABLE_TEXT
            : on
              ? 'Sorted by straight-line distance from you.'
              : null}
      </div>
    </div>
  )
}
