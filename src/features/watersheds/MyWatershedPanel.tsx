// Answer to "which watershed am I in": the Near me location (memory only) and the watershed line, with Close.
import { NEAR_ME_UNAVAILABLE_TEXT, useLocationStore } from '../location/locationStore'
import { WatershedLine } from './WatershedLine'

export function MyWatershedPanel({ onClose }: { onClose: () => void }) {
  const status = useLocationStore((s) => s.status)
  const coords = useLocationStore((s) => s.coords)
  const failed = status === 'denied' || status === 'unavailable' || status === 'error'
  return (
    <section aria-label="Your watershed" className="mt-2 rounded-control bg-forest-tint pl-3 text-sm text-ink">
      <div className="flex items-center justify-between gap-2">
        <div role="status">
          {status === 'requesting' ? 'Finding your location…' : failed ? NEAR_ME_UNAVAILABLE_TEXT : status === 'idle' ? 'Location is off.' : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-forest hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          Close
        </button>
      </div>
      {status === 'on' && (
        <div className="pb-1.5 pr-1.5">
          <WatershedLine point={coords} />
        </div>
      )}
    </section>
  )
}
