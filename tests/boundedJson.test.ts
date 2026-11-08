import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBoundedJson } from '../src/lib/boundedJson'

const opts = { maxBytes: 1024, label: 'Thing', budgetMessage: 'too big' }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A fetch that never resolves but rejects when its signal aborts.
const hangingFetch = () =>
  vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      }),
  )

describe('fetchBoundedJson timeout', () => {
  it('aborts a hung request with a clear error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const result = fetchBoundedJson('/x.json', { ...opts, signal: new AbortController().signal, timeoutMs: 5000 })
    const assertion = expect(result).rejects.toThrow('Thing request timed out.')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('defaults to about 20 seconds', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const result = fetchBoundedJson('/x.json', { ...opts, signal: new AbortController().signal })
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(19_999)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })

  it('still honours the caller signal and reports no timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const caller = new AbortController()
    const result = fetchBoundedJson('/x.json', { ...opts, signal: caller.signal })
    const assertion = expect(result).rejects.toThrow('stop')
    caller.abort(new Error('stop'))
    await assertion
  })

  it('does not time out a fast response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"a":1}')))
    const data = await fetchBoundedJson('/x.json', { ...opts, signal: new AbortController().signal, timeoutMs: 100 })
    expect(data).toEqual({ a: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
