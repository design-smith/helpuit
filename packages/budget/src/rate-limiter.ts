export interface RateLimitConfig {
  limit: number
  windowMs: number
}

interface FixedWindow {
  start: number
  count: number
}

/**
 * Per-key fixed-window rate limiter (issue 85). Used to blunt complaint spam
 * from a single user. `allow` counts the action when permitted.
 */
export class RateLimiter {
  private readonly windows = new Map<string, FixedWindow>()

  constructor(private readonly config: RateLimitConfig) {}

  allow(key: string, at: number): boolean {
    const w = this.windows.get(key)
    if (w === undefined || at - w.start >= this.config.windowMs) {
      this.windows.set(key, { start: at, count: 1 })
      return true
    }
    if (w.count >= this.config.limit) return false
    w.count += 1
    return true
  }
}
