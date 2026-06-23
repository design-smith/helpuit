import { describe, it, expect, afterEach } from 'vitest'
import { investigationId } from '@helpuit/contracts'
import { InvestigationNotFoundError } from '@helpuit/investigation-store'
import { createDb, type DbHandle } from './client.js'
import { DrizzleInvestigationRepository } from './investigation-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

async function repoWithClock(now: () => number) {
  handle = await createDb(':memory:')
  return new DrizzleInvestigationRepository(handle.db, now)
}

describe('DrizzleInvestigationRepository', () => {
  it('creates and reads back an investigation from a real SQLite database', async () => {
    const repo = await repoWithClock(() => 1000)
    const created = await repo.create({ conversationId: 42, customerId: 'u1' })
    const fetched = await repo.get(created.id)

    expect(fetched).toEqual(created)
    expect(fetched?.status).toBe('open')
    expect(fetched?.level).toBe('guidance')
    expect(fetched?.createdAt).toBe(1000)
  })

  it('returns null for an unknown id and assigns distinct ids', async () => {
    const repo = await repoWithClock(() => 1)
    const a = await repo.create({ conversationId: 1 })
    const b = await repo.create({ conversationId: 2 })
    expect(a.id).not.toBe(b.id)
    expect(await repo.get(investigationId('nope'))).toBeNull()
    expect((await repo.get(a.id))?.customerId).toBeNull()
  })

  it('persists level/status transitions and a classification, bumping updatedAt', async () => {
    let clock = 1000
    const repo = await repoWithClock(() => clock)
    const inv = await repo.create({ conversationId: 1 })
    clock = 2000
    const moved = await repo.setLevel(inv.id, 'account')
    expect(moved.level).toBe('account')
    expect(moved.updatedAt).toBe(2000)
    expect(moved.createdAt).toBe(1000)

    await repo.setStatus(inv.id, 'escalated')
    const classified = await repo.classify(inv.id, 'new_bug', 0.8)
    expect(classified.status).toBe('escalated')
    expect(classified.classification).toBe('new_bug')
    expect(classified.confidence).toBe(0.8)

    // durably persisted (re-read)
    expect((await repo.get(inv.id))?.classification).toBe('new_bug')
  })

  it('throws when updating a non-existent investigation', async () => {
    const repo = await repoWithClock(() => 1)
    await expect(repo.setStatus(investigationId('missing'), 'resolved')).rejects.toThrow(
      InvestigationNotFoundError,
    )
  })

  describe('list', () => {
    it('paginates newest-first by default and reports the unpaged total', async () => {
      let clock = 1000
      const repo = await repoWithClock(() => clock)
      for (let i = 0; i < 5; i++) {
        clock = 1000 + i
        await repo.create({ conversationId: i })
      }
      const page = await repo.list({}, { limit: 2 })
      expect(page.total).toBe(5)
      expect(page.items).toHaveLength(2)
      expect(page.items[0]!.conversationId).toBe(4) // newest first
      expect(page.items[1]!.conversationId).toBe(3)

      const oldest = await repo.list({}, { order: 'oldest', limit: 1 })
      expect(oldest.items[0]!.conversationId).toBe(0)
    })

    it('filters by status and classification', async () => {
      const repo = await repoWithClock(() => 1)
      const a = await repo.create({ conversationId: 1 })
      const b = await repo.create({ conversationId: 2 })
      await repo.setStatus(a.id, 'escalated')
      await repo.classify(a.id, 'new_bug', 0.9)
      await repo.setStatus(b.id, 'resolved')

      const escalated = await repo.list({ status: 'escalated' })
      expect(escalated.total).toBe(1)
      expect(escalated.items[0]!.id).toBe(a.id)

      const bugs = await repo.list({ classification: 'new_bug' })
      expect(bugs.items.map((i) => i.id)).toEqual([a.id])
    })
  })
})
