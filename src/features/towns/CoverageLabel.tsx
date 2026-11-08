// Small label for places outside the core area. Renders nothing for core or unspecified coverage.
import type { Place } from '../../types/place'
import { coverageText } from './coverage'

export function CoverageLabel({ coverage, className = '' }: { coverage: Place['coverage']; className?: string }) {
  const text = coverageText(coverage)
  if (!text) return null
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line bg-subtle px-2 text-xs font-medium whitespace-nowrap text-ink-muted ${className}`}
    >
      {text}
    </span>
  )
}
