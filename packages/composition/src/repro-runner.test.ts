import { describe, it, expect, afterEach } from 'vitest'
import { createDb, DrizzleInvestigationRepository, DrizzleEvidenceArtifacts, type DbHandle } from '@helpuit/db'
import { FakeContainerRunner } from '@helpuit/sandbox'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import type { BrowserDriver, BrowserSession, Evidence } from '@helpuit/reproduction'
import { EscalationPipeline, type IssueTracker } from '@helpuit/escalation'
import type { IssueSearch } from '@helpuit/dedup'
import type { HelpuitConfig } from '@helpuit/config'
import { buildReproductionRunner } from './repro-runner.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

// A real in-test browser driver — the Playwright boundary (the production driver
// drives Chromium). It returns whatever evidence the test wants; no mocking.
function driverYielding(evidence: Evidence): BrowserDriver {
  return {
    async open(): Promise<BrowserSession> {
      return { async run() { return evidence } }
    },
    async close() {},
  }
}

function cfg(over: Record<string, unknown> = {}): HelpuitConfig {
  return {
    policy: { playwrightEnabled: true },
    reproduction: {
      targetUrl: 'http://127.0.0.1:1',
      environment: 'production',
      containerImage: 'helpuit/repro:latest',
      sandboxRoles: ['admin'],
      sandboxAccounts: { admin: { user: 'u', pass: 'p' } },
      login: { mode: 'form', url: 'http://127.0.0.1:1/login' },
    },
    budget: { repro: { maxSteps: 25, maxRetries: 2 } },
    security: { encryptionKey: 'k' },
    ...over,
  } as unknown as HelpuitConfig
}

describe('buildReproductionRunner (gating)', () => {
  it('wires a runner only when playwright is enabled, sandbox creds exist, and a driver is provided', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    const containers = new FakeContainerRunner()
    const driver = driverYielding({ consoleErrors: [], networkErrors: [] })

    // Off by toggle → no reproduction.
    expect(buildReproductionRunner(cfg({ policy: { playwrightEnabled: false } }), { db, browserDriver: driver, containers })).toBeUndefined()

    // On, but no sandbox accounts → no reproduction.
    const noCreds = cfg({ reproduction: { ...cfg().reproduction, sandboxAccounts: {} } })
    expect(buildReproductionRunner(noCreds, { db, browserDriver: driver, containers })).toBeUndefined()

    // On with creds, but no browser driver available → no reproduction.
    expect(buildReproductionRunner(cfg(), { db, browserDriver: undefined, containers })).toBeUndefined()

    // Enabled + creds + driver → a runner is wired.
    expect(buildReproductionRunner(cfg(), { db, browserDriver: driver, containers })).toBeDefined()
  })

  it('reproduces via a real DynamicReproducer and persists the evidence to the investigation', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    const investigation = await new DrizzleInvestigationRepository(db).create({ conversationId: '7', customerId: 'u1' })

    // A real reproduction surfacing a 5xx → reproduced true, with captured evidence.
    const driver = driverYielding({
      consoleErrors: [],
      networkErrors: ['POST /api/billing -> 500'],
      screenshot: 'b64png',
    })
    const runner = buildReproductionRunner(cfg(), { db, browserDriver: driver, containers: new FakeContainerRunner() })!

    const result = await runner.reproduce({ feature: 'Billing', investigationId: investigation.id })

    expect(result.reproduced).toBe(true)

    // Evidence is persisted (encrypted) to the investigation — readable by the console.
    const artifacts = await new DrizzleEvidenceArtifacts(db, new SecretBox(deriveKey('k'))).listForInvestigation(
      investigation.id,
    )
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]!.type).toBe('reproduction')
    expect(artifacts[0]!.content).toContain('POST /api/billing -> 500')
  })

  it('does not reproduce an irreversible feature (e.g. payment) even when enabled', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    const investigation = await new DrizzleInvestigationRepository(db).create({ conversationId: '8' })
    const driver = driverYielding({ consoleErrors: ['boom'], networkErrors: [] })
    const runner = buildReproductionRunner(cfg(), { db, browserDriver: driver, containers: new FakeContainerRunner() })!

    const result = await runner.reproduce({ feature: 'refund payment', investigationId: investigation.id })

    expect(result.reproduced).toBe(false)
    const artifacts = await new DrizzleEvidenceArtifacts(db, new SecretBox(deriveKey('k'))).listForInvestigation(
      investigation.id,
    )
    expect(artifacts).toHaveLength(0)
  })

  it('is invoked by the EscalationPipeline with the investigation id, tying evidence to it', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    const investigation = await new DrizzleInvestigationRepository(db).create({ conversationId: '9' })
    const driver = driverYielding({ consoleErrors: ['TypeError: cannot read x'], networkErrors: [] })
    const runner = buildReproductionRunner(cfg(), { db, browserDriver: driver, containers: new FakeContainerRunner() })!

    const tracker: IssueTracker = {
      async create() { return { number: 1, url: 'u' } },
      async comment() {},
    }
    const search: IssueSearch = { async search() { return [] } }
    const pipeline = new EscalationPipeline({ tracker, search, autopublish: true, reproduction: runner })

    const outcome = await pipeline.escalate({
      complaint: 'save broken',
      classification: 'new_bug',
      feature: 'Billing',
      investigationId: investigation.id,
    })

    expect(outcome.reproduced).toBe(true)
    const artifacts = await new DrizzleEvidenceArtifacts(db, new SecretBox(deriveKey('k'))).listForInvestigation(
      investigation.id,
    )
    expect(artifacts).toHaveLength(1)
  })
})
