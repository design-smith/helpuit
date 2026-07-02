import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import {
  investigations,
  auditEntries,
  evidenceArtifacts,
  tickets,
  processedWebhookEvents,
} from './schema.js'
import { RetentionService } from './retention.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const DAY = 86_400_000
const NOW = 1_700_000_000_000

describe('RetentionService', () => {
  it('purges investigations and all their child rows older than the window, keeping recent ones', async () => {
    handle = await createDb(':memory:')
    const db = handle.db

    await db.insert(investigations).values([
      { id: 'old', conversationId: '1', status: 'resolved', level: 'l1', createdAt: NOW - 100 * DAY, updatedAt: NOW - 100 * DAY },
      { id: 'fresh', conversationId: '2', status: 'open', level: 'l1', createdAt: NOW - 1 * DAY, updatedAt: NOW - 1 * DAY },
    ])
    await db.insert(auditEntries).values([
      { investigationId: 'old', type: 'guidance', data: null, at: NOW - 100 * DAY },
      { investigationId: 'fresh', type: 'guidance', data: null, at: NOW - 1 * DAY },
    ])
    await db.insert(evidenceArtifacts).values({
      id: 'e1', investigationId: 'old', type: 'log', redactionStatus: 'raw', content: 'sealed', createdAt: NOW - 100 * DAY,
    })
    await db.insert(tickets).values({ id: 't1', investigationId: 'old', conversationId: '1' })

    const svc = new RetentionService(db, () => NOW)
    const result = await svc.purgeOlderThan(90 * DAY)

    expect(result.investigations).toBe(1)
    expect(result.auditEntries).toBe(1)
    expect(result.evidenceArtifacts).toBe(1)
    expect(result.tickets).toBe(1)

    expect((await db.select().from(investigations)).map((r) => r.id)).toEqual(['fresh'])
    expect(await db.select().from(auditEntries)).toHaveLength(1) // only fresh's audit survives
    expect(await db.select().from(evidenceArtifacts)).toHaveLength(0)
    expect(await db.select().from(tickets)).toHaveLength(0)
  })

  it('purges stale webhook idempotency records by processedAt', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    await db.insert(processedWebhookEvents).values([
      { id: 'a', source: 'chatwoot', processedAt: NOW - 100 * DAY },
      { id: 'b', source: 'chatwoot', processedAt: NOW - 1 * DAY },
    ])

    const svc = new RetentionService(db, () => NOW)
    const result = await svc.purgeOlderThan(90 * DAY)

    expect(result.processedEvents).toBe(1)
    expect((await db.select().from(processedWebhookEvents)).map((r) => r.id)).toEqual(['b'])
  })

  it('does nothing when nothing has expired', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    await db.insert(investigations).values({
      id: 'fresh', conversationId: '1', status: 'open', level: 'l1', createdAt: NOW - 1 * DAY, updatedAt: NOW - 1 * DAY,
    })

    const svc = new RetentionService(db, () => NOW)
    const result = await svc.purgeOlderThan(90 * DAY)

    expect(result.investigations).toBe(0)
    expect(await db.select().from(investigations)).toHaveLength(1)
  })
})
