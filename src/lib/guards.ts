// Small shared type guards for defensive parsers.
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** True for an absolute http(s) URL. */
export function publicUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
