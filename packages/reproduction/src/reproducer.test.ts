import { describe, it, expect } from 'vitest'
import { SandboxPool, FakeContainerRunner } from '@helpuit/sandbox'
import {
  DynamicReproducer,
  type BrowserDriver,
  type BrowserSession,
  type Evidence,
  type ReproductionPlan,
} from './reproducer.js'

const account = { id: 'a1', role: 'admin', usernameSecret: 'U', passwordSecret: 'P' }
const plan: ReproductionPlan = {
  route: '/settings/billing',
  sandboxRole: 'admin',
  steps: [{ action: 'click', selector: '#save' }],
}

function makeDriver(evidence: Evidence) {
  const state = {
    opened: 0,
    closed: 0,
    async open(): Promise<BrowserSession> {
      state.opened += 1
      return { async run() { return evidence } }
    },
    async close(): Promise<void> {
      state.closed += 1
    },
  }
  return state
}

describe('DynamicReproducer', () => {
  it('reports reproduced=true when the run surfaces errors, and cleans up afterward', async () => {
    const pool = new SandboxPool([account])
    const containers = new FakeContainerRunner()
    const driver = makeDriver({
      consoleErrors: [],
      networkErrors: ['POST /api/billing/update -> 500'],
      screenshot: 'b64',
    })

    const result = await new DynamicReproducer(pool, containers, driver).reproduce(plan)

    expect(result.reproduced).toBe(true)
    expect(result.evidence.networkErrors).toHaveLength(1)
    expect(pool.availableCount('admin')).toBe(1)
    expect(containers.running.size).toBe(0)
    expect(driver.closed).toBe(1)
  })

  it('reports reproduced=false when the run is clean', async () => {
    const pool = new SandboxPool([account])
    const driver = makeDriver({ consoleErrors: [], networkErrors: [] })
    const result = await new DynamicReproducer(pool, new FakeContainerRunner(), driver).reproduce(
      plan,
    )
    expect(result.reproduced).toBe(false)
  })

  it('releases the lease and kills the container even when the run throws (abortability)', async () => {
    const pool = new SandboxPool([account])
    const containers = new FakeContainerRunner()
    const driver: BrowserDriver = {
      async open(): Promise<BrowserSession> {
        return {
          async run(): Promise<Evidence> {
            throw new Error('browser crashed')
          },
        }
      },
      async close() {},
    }

    await expect(new DynamicReproducer(pool, containers, driver).reproduce(plan)).rejects.toThrow(
      'browser crashed',
    )
    expect(pool.availableCount('admin')).toBe(1)
    expect(containers.running.size).toBe(0)
  })
})
