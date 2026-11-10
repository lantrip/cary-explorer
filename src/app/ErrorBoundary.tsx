// Catches render errors anywhere below it and shows a plain card instead of a blank page. Logs to the console only.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ERROR_FALLBACK, logClientError } from './errorFallback'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logClientError(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="flex h-dvh w-screen items-center justify-center bg-panel p-4 text-ink">
        <div role="alert" className="w-full max-w-sm space-y-3 rounded-card border border-line bg-white p-5 shadow-lg">
          <h1 className="font-display text-xl font-semibold">{ERROR_FALLBACK.title}</h1>
          <p className="text-[14px] leading-relaxed text-ink-soft">{ERROR_FALLBACK.body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-white px-4 text-sm font-semibold text-forest hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            {ERROR_FALLBACK.action}
          </button>
        </div>
      </main>
    )
  }
}
