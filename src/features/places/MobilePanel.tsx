// Mobile (below md) layout: search and theme chips floating over the map, plus a three-state bottom sheet.
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { CreditsButton } from '../about/CreditsButton'
import { useAppStore, type SheetState } from '../../store/useAppStore'
import { CategoryBadge } from '../themes/CategoryIcon'
import { categoryLabel } from '../themes/themes'
import { SearchBox } from '../search/SearchBox'
import { ThemeFilter } from '../themes/ThemeFilter'
import { TownFilter } from '../towns/TownFilter'
import { useTownNote } from '../towns/useTownNote'
import { sheetHeightPx } from '../../lib/layout'
import { PanelBody } from './PanelBody'
import { ViewToggle } from './ViewToggle'
import { TAP_THRESHOLD_PX, clampSheetHeight, pickSnap, snapAnimationMs, velocityFromSamples, type PointerSample } from './sheetDrag'
import { useSelectedPlace } from './useSelectedPlace'

// The content wrapper is always in the DOM (hidden at peek) so aria-controls always points at a real element.
const CONTENT_ID = 'place-sheet-content'
const NEXT_STATE: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' }
// The peek height adds the bottom safe-area inset so the 112 px content area is not squeezed on notched phones.
const HEIGHT: Record<SheetState, string> = {
  peek: 'h-[calc(112px+env(safe-area-inset-bottom))]',
  half: 'h-[50dvh]',
  full: 'h-[90dvh]',
}
const HANDLE_LABEL: Record<SheetState, string> = {
  peek: 'Expand details to half height',
  half: 'Expand details to full height',
  full: 'Collapse details',
}

export function MobilePanel() {
  const sheetState = useAppStore((s) => s.sheetState)
  const setSheetState = useAppStore((s) => s.setSheetState)
  const selected = useSelectedPlace()
  const note = useTownNote()
  const sectionRef = useRef<HTMLElement>(null)
  const drag = useRef<{ id: number; startY: number; startHeight: number; startState: SheetState; inset: number; samples: PointerSample[]; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const cleanupTimer = useRef<number | undefined>(undefined)

  // Hand the height back to the CSS classes once the snap has finished.
  const release = (target: SheetState, inset: number) => {
    const el = sectionRef.current
    if (!el) return
    window.clearTimeout(cleanupTimer.current)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.style.transition = reduced ? 'none' : ''
    el.style.height = `${sheetHeightPx(target) + (target === 'peek' ? inset : 0)}px`
    cleanupTimer.current = window.setTimeout(() => {
      el.style.height = ''
      el.style.transition = ''
    }, snapAnimationMs(reduced) + 50)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = sectionRef.current
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return
    window.clearTimeout(cleanupTimer.current)
    const startHeight = el.getBoundingClientRect().height
    const inset = parseFloat(getComputedStyle(el).paddingBottom) || 0
    drag.current = { id: e.pointerId, startY: e.clientY, startHeight, startState: sheetState, inset, samples: [{ y: e.clientY, t: e.timeStamp }], moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    const el = sectionRef.current
    if (!d || !el || d.id !== e.pointerId) return
    const delta = d.startY - e.clientY
    if (!d.moved && Math.abs(delta) < TAP_THRESHOLD_PX) return
    d.moved = true
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    if (d.samples.length > 8) d.samples.shift()
    // Written straight to the DOM so a drag causes no React re-renders.
    el.style.transition = 'none'
    el.style.height = `${clampSheetHeight(d.startHeight + delta, window.innerHeight, d.inset)}px`
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    const el = sectionRef.current
    if (!d || !el || d.id !== e.pointerId) return
    drag.current = null
    if (!d.moved) return
    suppressClick.current = true
    window.setTimeout(() => (suppressClick.current = false), 0)
    const target = pickSnap({
      startState: d.startState,
      startHeight: d.startHeight,
      currentHeight: el.getBoundingClientRect().height,
      velocityPxPerMs: velocityFromSamples(d.samples),
      windowHeight: window.innerHeight,
    })
    const next = target ?? d.startState
    release(next, d.inset)
    if (next !== sheetState) setSheetState(next)
  }

  const onPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    release(d.startState, d.inset)
  }

  return (
    <>
      <h1 className="sr-only">Cary Explorer</h1>

      {/* The sheet covers this bar when full, so hide it from sight and the tab order. */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex flex-col gap-2.5 px-4 pt-4 ${sheetState === 'full' ? 'invisible' : ''}`}
      >
        <div className="rounded-control shadow-[0_2px_8px_rgba(31,42,36,0.12)]">
          <SearchBox />
        </div>
        <div className="rounded-control shadow-[0_2px_8px_rgba(31,42,36,0.12)]">
          <TownFilter compact />
        </div>
        {/* Single horizontally scrolling row; the bottom padding keeps focus rings from being clipped. */}
        <div className="overflow-x-auto pb-1">
          <ThemeFilter />
        </div>
      </div>

      <section
        ref={sectionRef}
        aria-label="Explore places"
        className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-sheet bg-panel pb-[env(safe-area-inset-bottom)] text-ink shadow-[0_-8px_24px_rgba(28,36,32,0.14)] transition-[height] duration-200 ease-out motion-reduce:transition-none ${HEIGHT[sheetState]}`}
      >
        {/* 44px hit area, centred grab bar. The header sits fully below it (no negative margin). */}
        <button
          type="button"
          aria-label={HANDLE_LABEL[sheetState]}
          aria-expanded={sheetState !== 'peek'}
          aria-controls={CONTENT_ID}
          onClick={() => {
            if (suppressClick.current) return
            setSheetState(NEXT_STATE[sheetState])
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="touch-none flex h-11 w-full shrink-0 items-center justify-center rounded-t-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-[#C9C5BC]" />
        </button>

        {/* No badge column without a selection, so the title lines up with the px-5 content below. */}
        <div
          className={`relative grid shrink-0 items-center gap-3 px-5 pt-0 ${selected ? 'grid-cols-[36px_minmax(0,1fr)_auto_auto]' : 'grid-cols-[minmax(0,1fr)_auto_auto]'}`}
        >
          {selected && <CategoryBadge category={selected.category} size="md" />}
          <div className="min-w-0">
            <p className="truncate font-display text-[20px] leading-tight font-semibold text-ink">
              {selected?.name ?? 'Explore Cary'}
            </p>
            <p className="truncate text-[13px] text-ink-muted">
              {selected ? categoryLabel[selected.category] : (note ?? 'Parks, trails, birds, water and history')}
            </p>
          </div>
          {/* Compact override of ViewToggle's default sizing, applied from this wrapper only. */}
          <div className="shrink-0 [&_button]:min-h-11 [&_button]:min-w-16 [&_button]:px-3">
            <ViewToggle />
          </div>
          <CreditsButton variant="icon" className="-mr-2" />
        </div>

        <div
          id={CONTENT_ID}
          hidden={sheetState === 'peek'}
          className="flex-1 overflow-y-auto px-5 pb-6"
        >
          {sheetState !== 'peek' && <PanelBody />}
        </div>
      </section>
    </>
  )
}
