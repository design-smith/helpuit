/** Thrown by {@link withTimeout} when an operation exceeds its deadline. */
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * Run `fn` with a deadline. `fn` receives an AbortSignal that fires when the
 * deadline elapses, so a well-behaved operation (e.g. `fetch`) can cancel its
 * in-flight work instead of leaking it. Rejects with {@link TimeoutError} on
 * overrun; the timer is always cleared.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(ms))
    }, ms)
  })
  try {
    return await Promise.race([fn(controller.signal), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
