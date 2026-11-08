// Entry point to the Credits & privacy dialog. "text" is the desktop footer link; "icon" is the compact mobile header button.
import { useAppStore } from '../../store/useAppStore'

export const CREDITS_BUTTON_ID = 'credits-button'
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'

export function CreditsButton({ variant, className = '' }: { variant: 'text' | 'icon'; className?: string }) {
  const open = useAppStore((s) => s.openAbout)
  if (variant === 'icon') {
    return (
      <button
        id={CREDITS_BUTTON_ID}
        type="button"
        aria-label="Credits and privacy"
        aria-haspopup="dialog"
        onClick={open}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-forest hover:bg-subtle ${focusRing} ${className}`}
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
    )
  }
  return (
    <button
      id={CREDITS_BUTTON_ID}
      type="button"
      aria-haspopup="dialog"
      onClick={open}
      className={`inline-flex h-11 items-center rounded-control px-3 text-[13px] font-semibold text-forest underline underline-offset-2 hover:bg-subtle ${focusRing} ${className}`}
    >
      Credits &amp; privacy
    </button>
  )
}
