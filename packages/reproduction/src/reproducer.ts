import type { ContainerRunner, SandboxAccount, SandboxPool } from '@helpuit/sandbox'

export interface ReproductionStep {
  action: 'goto' | 'click' | 'fill'
  selector?: string
  url?: string
  value?: string
}

export interface ReproductionPlan {
  route: string
  sandboxRole: string
  steps: ReproductionStep[]
  /** Customer's safe state (plan/flags) to recreate in the sandbox before driving (issue 65). */
  state?: Record<string, unknown>
}

export interface Evidence {
  consoleErrors: string[]
  networkErrors: string[]
  screenshot?: string
}

export interface ReproductionResult {
  reproduced: boolean
  evidence: Evidence
}

/** A driven browser session (Playwright page) inside a container. */
export interface BrowserSession {
  run(plan: ReproductionPlan): Promise<Evidence>
}

/** Launches/closes a browser logged in as a sandbox account (real impl drives Playwright). */
export interface BrowserDriver {
  open(account: SandboxAccount, containerId: string): Promise<BrowserSession>
  close(session: BrowserSession): Promise<void>
}

export interface ReproducerOptions {
  image?: string
}

/**
 * L3b dynamic reproduction (issues 64–67). Leases a sandbox account, spins an
 * ephemeral container, drives the browser through the plan, and captures
 * evidence. The lease and container are **always** released/killed (finally) —
 * the abortability invariant: never leave a process you can't stop.
 *
 * `reproduced` is true when the run surfaced console or network errors.
 */
export class DynamicReproducer {
  private readonly image: string

  constructor(
    private readonly pool: SandboxPool,
    private readonly containers: ContainerRunner,
    private readonly driver: BrowserDriver,
    options: ReproducerOptions = {},
  ) {
    this.image = options.image ?? 'helpuit/repro'
  }

  async reproduce(plan: ReproductionPlan): Promise<ReproductionResult> {
    const lease = await this.pool.acquire(plan.sandboxRole)
    const container = await this.containers.run({ image: this.image })
    let session: BrowserSession | undefined
    try {
      session = await this.driver.open(lease.account, container.id)
      const evidence = await session.run(plan)
      const reproduced = evidence.consoleErrors.length > 0 || evidence.networkErrors.length > 0
      return { reproduced, evidence }
    } finally {
      if (session !== undefined) await this.driver.close(session)
      await container.kill()
      lease.release()
    }
  }
}
