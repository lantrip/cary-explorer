const longDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

/** "November 7, 2026" in UTC (day-only dates would otherwise shift by a day), or the raw text if unparseable. */
export function formatUtcLongDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : longDate.format(date)
}
