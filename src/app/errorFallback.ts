// Pure pieces of the app error boundary, so the fallback copy and logging are testable without a DOM.
export const ERROR_FALLBACK = {
  title: 'Something went wrong',
  body: 'The map hit an unexpected problem. Reloading usually fixes it.',
  action: 'Reload',
} as const

/** Console only. Nothing is sent anywhere; remote reporting waits on the backend (#16) and a privacy text update. */
export function logClientError(error: unknown, componentStack?: string | null, log: (...a: unknown[]) => void = console.error) {
  log('Unhandled app error:', error, componentStack ?? '')
}
