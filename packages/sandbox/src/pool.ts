import type { SandboxAccount } from './types.js'

/** A held sandbox account. Always `release()` when done so a waiter can proceed. */
export interface SandboxLease {
  readonly account: SandboxAccount
  release(): void
}

/**
 * Lockable pool of sandbox accounts per role (issues 61, 63).
 *
 * - Default 1 account per role → reproductions serialize per role.
 * - Provision N accounts for a role → up to N concurrent reproductions.
 * - `acquire` resolves immediately if an account is free, otherwise queues
 *   FIFO and resolves when one is released.
 */
export class SandboxPool {
  private readonly knownRoles = new Set<string>()
  private readonly available = new Map<string, SandboxAccount[]>()
  private readonly waiters = new Map<string, Array<(lease: SandboxLease) => void>>()

  constructor(accounts: SandboxAccount[]) {
    for (const account of accounts) {
      this.knownRoles.add(account.role)
      const free = this.available.get(account.role) ?? []
      free.push(account)
      this.available.set(account.role, free)
    }
  }

  acquire(role: string): Promise<SandboxLease> {
    if (!this.knownRoles.has(role)) {
      return Promise.reject(new Error(`No sandbox account configured for role "${role}"`))
    }
    const free = this.available.get(role) ?? []
    const account = free.shift()
    if (account !== undefined) {
      return Promise.resolve(this.makeLease(account))
    }
    return new Promise<SandboxLease>((resolve) => {
      const queue = this.waiters.get(role) ?? []
      queue.push(resolve)
      this.waiters.set(role, queue)
    })
  }

  /** Number of currently-free accounts for a role (for tests/metrics). */
  availableCount(role: string): number {
    return (this.available.get(role) ?? []).length
  }

  private makeLease(account: SandboxAccount): SandboxLease {
    let released = false
    return {
      account,
      release: () => {
        if (released) return
        released = true
        const next = this.waiters.get(account.role)?.shift()
        if (next !== undefined) {
          next(this.makeLease(account))
          return
        }
        const free = this.available.get(account.role) ?? []
        free.push(account)
        this.available.set(account.role, free)
      },
    }
  }
}
