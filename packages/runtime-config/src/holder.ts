/**
 * A swappable single-slot holder. The queue worker reads the live orchestrator
 * through `get()` INSIDE each job (never capturing it), so a `swap()` from the
 * config supervisor is picked up by the next job while in-flight jobs finish on
 * the instance they captured. Reference assignment is atomic — no lock needed.
 */
export class Holder<T> {
  constructor(private current: T) {}

  get(): T {
    return this.current
  }

  swap(next: T): void {
    this.current = next
  }
}
