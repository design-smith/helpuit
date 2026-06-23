/** A real-time activity event streamed to the console over SSE. */
export interface ActivityEvent {
  /** e.g. 'received' (webhook in) | 'outcome' (investigation processed). */
  type: string
  at: number
  data?: Record<string, unknown>
}

/**
 * A tiny in-process pub/sub bus bridging the worker (publishes outcomes) and the
 * SSE endpoint (streams them to connected consoles). No external broker — this is
 * a single-tenant, single-process deployment.
 */
export class ActivityBus {
  private readonly subscribers = new Set<(event: ActivityEvent) => void>()

  publish(event: ActivityEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(event)
      } catch {
        /* a slow/broken subscriber must not break the publisher */
      }
    }
  }

  subscribe(fn: (event: ActivityEvent) => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  get size(): number {
    return this.subscribers.size
  }
}
