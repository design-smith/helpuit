export interface RetryOptions {
  /** Max retries after the first attempt (default 2 → up to 3 calls). */
  retries?: number
  /** Base backoff in ms (default 50). */
  baseMs?: number
  /** Backoff cap in ms (default 2000). */
  maxMs?: number
  /** Exponential growth factor (default 2). */
  factor?: number
  /** Classifies an error as worth retrying (default: everything is retryable). */
  isRetryable?: (error: unknown) => boolean
  /** Observability hook, called before each backoff sleep. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  /** Cancels pending backoff (rejects with the abort reason). */
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Retry `fn` on transient failure with exponential backoff and full jitter.
 * Stops at `retries` (re-throwing the last error) or immediately for an error
 * `isRetryable` rejects. Jitter spreads retries so a recovering dependency isn't
 * hit by a synchronized thundering herd.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2
  const base = options.baseMs ?? 50
  const max = options.maxMs ?? 2000
  const factor = options.factor ?? 2
  const isRetryable = options.isRetryable ?? (() => true)

  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error
      const ceiling = Math.min(max, base * factor ** attempt)
      const delay = Math.random() * ceiling // full jitter in [0, ceiling)
      options.onRetry?.(error, attempt + 1, delay)
      await sleep(delay, options.signal)
      attempt++
    }
  }
}
