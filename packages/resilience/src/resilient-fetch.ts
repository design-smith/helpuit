import { withTimeout, TimeoutError } from './timeout.js'
import { withRetry, type RetryOptions } from './retry.js'

export interface ResilientFetchOptions {
  /** Per-attempt deadline in ms (default 30000). */
  timeoutMs?: number
  /** Retry policy (defaults: 2 retries, 100ms base backoff). */
  retry?: RetryOptions
}

/** HTTP statuses worth retrying — transient server/overload signals. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/** Internal sentinel: a response whose status we want the retry loop to re-attempt. */
class RetryableResponseError extends Error {
  constructor(readonly response: Response) {
    super(`Retryable HTTP status ${response.status}`)
    this.name = 'RetryableResponseError'
  }
}

/**
 * `fetch` hardened for talking to flaky third parties: a per-attempt timeout
 * (cancels the in-flight request via AbortSignal) plus retry-with-backoff on
 * network errors, timeouts, and transient HTTP statuses (408/429/5xx). A
 * non-retryable response (e.g. 4xx) is returned immediately; if retries are
 * exhausted on a transient status the final Response is returned so the caller
 * still decides what to do with it.
 */
export async function resilientFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000

  const attempt = async (): Promise<Response> => {
    const res = await withTimeout(
      (signal) => fetch(input, { ...init, signal }),
      timeoutMs,
    )
    if (isRetryableStatus(res.status)) throw new RetryableResponseError(res)
    return res
  }

  try {
    return await withRetry(attempt, {
      retries: options.retry?.retries ?? 2,
      baseMs: options.retry?.baseMs ?? 100,
      ...options.retry,
      isRetryable: (error) =>
        error instanceof RetryableResponseError ||
        error instanceof TimeoutError ||
        // fetch surfaces network-layer failures as TypeError
        error instanceof TypeError,
    })
  } catch (error) {
    // Retries exhausted on a transient status → hand the caller the final response.
    if (error instanceof RetryableResponseError) return error.response
    throw error
  }
}
