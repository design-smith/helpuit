/** Thrown when a call is rejected because the breaker is open. */
export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit is open')
    this.name = 'CircuitOpenError'
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker open. */
  threshold: number
  /** How long to stay open before allowing a half-open trial (ms). */
  cooldownMs: number
  /** Clock source; injected for deterministic tests (default Date.now). */
  now?: () => number
}

/**
 * A per-dependency circuit breaker. `closed` → calls flow; after `threshold`
 * consecutive failures it goes `open` and fails fast (sparing a dead dependency
 * and the caller); after `cooldownMs` the next call is a `half-open` trial —
 * success closes the circuit, failure re-opens it.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0
  private _state: CircuitState = 'closed'
  private readonly now: () => number

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now
  }

  get state(): CircuitState {
    return this._state
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this._state === 'open') {
      if (this.now() - this.openedAt >= this.options.cooldownMs) {
        this._state = 'half-open'
      } else {
        throw new CircuitOpenError()
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    this._state = 'closed'
  }

  private onFailure(): void {
    this.failures++
    if (this._state === 'half-open' || this.failures >= this.options.threshold) {
      this._state = 'open'
      this.openedAt = this.now()
    }
  }
}
