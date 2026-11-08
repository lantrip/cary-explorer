// Muted "Data release 4188bdab · updated Nov 7, 2026" line for the Sources section.
import { releaseSummary, type Release } from './release'

export function ReleaseLine({ release }: { release: Release | null }) {
  if (!release) return null
  const { shortId, date } = releaseSummary(release)
  return (
    <p className="text-xs text-ink-muted">
      Data release {shortId}
      {date && (
        <>
          {' · updated '}
          <time dateTime={release.generatedFrom}>{date}</time>
        </>
      )}
    </p>
  )
}
