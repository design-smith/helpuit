import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import {
  investigations,
  reproductionAttempts,
  spendEntries,
  githubLinks,
  jobs,
  conversationControls,
} from './schema.js'
import { DrizzleDashboardService } from './dashboard.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const T = 1_700_000_000_000

describe('DrizzleDashboardService', () => {
  it('aggregates investigations, repro success, spend, escalations, and queue health', async () => {
    handle = await createDb(':memory:')
    const db = handle.db

    await db.insert(investigations).values([
      { id: 'i1', conversationId: '1', status: 'resolved', level: 'l1', classification: 'how_to', createdAt: T - 3, updatedAt: T - 3 },
      { id: 'i2', conversationId: '2', status: 'escalated', level: 'static_repro', classification: 'new_bug', createdAt: T - 2, updatedAt: T - 2 },
      { id: 'i3', conversationId: '3', status: 'escalated', level: 'static_repro', classification: 'new_bug', createdAt: T - 1, updatedAt: T - 1 },
    ])
    await db.insert(reproductionAttempts).values([
      { id: 'r1', investigationId: 'i2', sandboxRole: 'admin', reproduced: 1, evidence: null, createdAt: T },
      { id: 'r2', investigationId: 'i3', sandboxRole: 'admin', reproduced: 0, evidence: null, createdAt: T },
    ])
    await db.insert(spendEntries).values([
      { investigationId: 'i1', amount: 100, at: T },
      { investigationId: 'i2', amount: 250, at: T },
    ])
    await db.insert(githubLinks).values({
      id: 'g1', investigationId: 'i2', issueNumber: 555, issueUrl: 'u', status: 'open', lastSyncedAt: T, createdAt: T,
    })
    await db.insert(jobs).values([
      { id: 'j1', type: 'investigation', payload: '{}', status: 'done', attempts: 1, maxAttempts: 3, runAfter: T, lastError: null, createdAt: T, updatedAt: T },
      { id: 'j2', type: 'investigation', payload: '{}', status: 'pending', attempts: 0, maxAttempts: 3, runAfter: T, lastError: null, createdAt: T, updatedAt: T },
    ])
    await db.insert(conversationControls).values({ conversationId: '2', paused: 1, note: null, updatedAt: T })

    const view = await new DrizzleDashboardService(db).overview()

    expect(view.investigations.total).toBe(3)
    expect(view.investigations.byStatus).toEqual({ resolved: 1, escalated: 2 })
    expect(view.investigations.byClassification).toEqual({ how_to: 1, new_bug: 2 })
    expect(view.investigations.recent.map((r) => r.id)).toEqual(['i3', 'i2', 'i1']) // newest first

    expect(view.reproduction).toEqual({ attempts: 2, reproduced: 1, successRate: 0.5 })
    expect(view.spend.totalTokens).toBe(350)
    expect(view.escalations.issuesLinked).toBe(1)
    expect(view.queue).toMatchObject({ pending: 1, done: 1 })
    expect(view.control.pausedConversations).toBe(1)
  })

  it('reports zeros (and a 0 success rate) for an empty database', async () => {
    handle = await createDb(':memory:')
    const view = await new DrizzleDashboardService(handle.db).overview()
    expect(view.investigations.total).toBe(0)
    expect(view.reproduction.successRate).toBe(0)
    expect(view.spend.totalTokens).toBe(0)
  })

  it('alertSnapshot windows spend, repro failures, and escalations since a cutoff', async () => {
    handle = await createDb(':memory:')
    const db = handle.db
    const since = T - 1000

    await db.insert(spendEntries).values([
      { investigationId: 'i1', amount: 40, at: since - 5 }, // before the window — excluded
      { investigationId: 'i2', amount: 60, at: since + 5 },
      { investigationId: 'i3', amount: 30, at: T },
    ])
    await db.insert(reproductionAttempts).values([
      { id: 'r1', investigationId: 'i2', sandboxRole: 'admin', reproduced: 0, evidence: null, createdAt: since + 1 },
      { id: 'r2', investigationId: 'i3', sandboxRole: 'admin', reproduced: 0, evidence: null, createdAt: since + 2 },
      { id: 'r3', investigationId: 'i3', sandboxRole: 'admin', reproduced: 1, evidence: null, createdAt: since + 3 },
    ])
    await db.insert(investigations).values([
      { id: 'i2', conversationId: '1', status: 'escalated', level: 'static_repro', classification: 'new_bug', createdAt: since, updatedAt: since + 10 },
      { id: 'i9', conversationId: '9', status: 'resolved', level: 'l1', classification: 'how_to', createdAt: since, updatedAt: T },
    ])

    const snap = await new DrizzleDashboardService(db).alertSnapshot({ since, dayCap: 1000 })

    expect(snap.spendToday).toBe(90) // 60 + 30, the pre-window 40 excluded
    expect(snap.reproAttempts).toBe(3)
    expect(snap.reproFailures).toBe(2)
    expect(snap.escalations).toBe(1)
    expect(snap.dayCap).toBe(1000)
  })
})
