// Shared fetch + bounded streaming read + JSON parse; decoded bytes are capped even without Content-Length.
export interface BoundedJsonOptions {
  signal: AbortSignal
  maxBytes: number
  /** Added to the fetch init only when given. */
  cache?: RequestCache
  /** Used in the status and no-body errors: "<label> request failed (404)." */
  label: string
  /** Full message for an exceeded budget. */
  budgetMessage: string
  /** Aborts the request and body read after this long (default 20 s). */
  timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 20_000

/** A non-2xx response; `status` lets callers tell a genuine 404 from a transient failure. */
export class HttpError extends Error {
  readonly status: number
  constructor(label: string, status: number) {
    super(`${label} request failed (${status}).`)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function fetchBoundedJson(url: string, opts: BoundedJsonOptions): Promise<unknown> {
  const { signal: callerSignal, label, timeoutMs = DEFAULT_TIMEOUT_MS } = opts
  const controller = new AbortController()
  const onCallerAbort = () => controller.abort(callerSignal.reason)
  if (callerSignal.aborted) onCallerAbort()
  else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`${label} request timed out.`))
  }, timeoutMs)
  try {
    return await readBoundedJson(url, { ...opts, signal: controller.signal })
  } catch (err) {
    // A timeout wins over whatever the aborted fetch or read reported.
    if (timedOut && !callerSignal.aborted) throw new Error(`${label} request timed out.`)
    throw err
  } finally {
    clearTimeout(timer)
    callerSignal.removeEventListener('abort', onCallerAbort)
  }
}

async function readBoundedJson(url: string, opts: BoundedJsonOptions): Promise<unknown> {
  const { signal, maxBytes, cache, label, budgetMessage } = opts
  const response = await fetch(url, cache === undefined ? { signal } : { signal, cache })
  if (!response.ok) throw new HttpError(label, response.status)
  if (!response.body) throw new Error(`${label} response has no body.`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new Error(budgetMessage)
      }
      text += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    reader.releaseLock()
  }
}
