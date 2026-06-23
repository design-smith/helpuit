import { describe, it, expect } from 'vitest'
import { InMemoryInvestigationRepository, InvestigationNotFoundError } from './repository.js'
import { investigationId } from '@helpuit/contracts'

describe('InvestigationRepository', () => {
  it('creates an investigation that starts open at the guidance level', async () => {
    const repo = new InMemoryInvestigationRepository({ now: () => 1000 })
    const inv = await repo.create({ conversationId: 42 })

    expect(inv.id).toBeTruthy()
    expect(inv.conversationId).toBe(42)
    expect(inv.status).toBe('open')
    expect(inv.level).toBe('guidance')
    expect(inv.classification).toBeNull()
    expect(inv.createdAt).toBe(1000)
  })

  it('gets a created investigation and returns null for an unknown id', async () => {
    const repo = new InMemoryInvestigationRepository()
    const inv = await repo.create({ conversationId: 1, customerId: 'cust-9' })
    expect(await repo.get(inv.id)).toEqual(inv)
    expect(await repo.get(investigationId('missing'))).toBeNull()
  })

  it('assigns distinct ids to successive investigations', async () => {
    const repo = new InMemoryInvestigationRepository()
    const a = await repo.create({ conversationId: 1 })
    const b = await repo.create({ conversationId: 2 })
    expect(a.id).not.toBe(b.id)
  })

  it('transitions level and bumps updatedAt', async () => {
    let clock = 1000
    const repo = new InMemoryInvestigationRepository({ now: () => clock })
    const inv = await repo.create({ conversationId: 1 })
    clock = 2000
    const moved = await repo.setLevel(inv.id, 'account')
    expect(moved.level).toBe('account')
    expect(moved.updatedAt).toBe(2000)
    expect(moved.createdAt).toBe(1000)
  })

  it('updates status', async () => {
    const repo = new InMemoryInvestigationRepository()
    const inv = await repo.create({ conversationId: 1 })
    const escalated = await repo.setStatus(inv.id, 'escalated')
    expect(escalated.status).toBe('escalated')
  })

  it('records a classification with confidence', async () => {
    const repo = new InMemoryInvestigationRepository()
    const inv = await repo.create({ conversationId: 1 })
    const classified = await repo.classify(inv.id, 'new_bug', 0.8)
    expect(classified.classification).toBe('new_bug')
    expect(classified.confidence).toBe(0.8)
  })

  it('throws when updating a non-existent investigation', async () => {
    const repo = new InMemoryInvestigationRepository()
    await expect(repo.setStatus(investigationId('nope'), 'resolved')).rejects.toThrow(
      InvestigationNotFoundError,
    )
  })
})
