import { describe, it, expect } from 'vitest'
import { InMemoryTicketing, TicketNotFoundError } from './ticketing.js'

describe('InMemoryTicketing', () => {
  it('creates a ticket linked to an investigation, initially unlinked to any issue', async () => {
    const t = new InMemoryTicketing()
    const ticket = await t.create({ investigationId: 'inv-1', conversationId: '42' })
    expect(ticket.investigationId).toBe('inv-1')
    expect(ticket.conversationId).toBe('42')
    expect(ticket.issueNumber).toBeNull()
  })

  it('links many tickets to one issue and queries them back', async () => {
    const t = new InMemoryTicketing()
    const a = await t.create({ investigationId: 'inv-1', conversationId: '1' })
    const b = await t.create({ investigationId: 'inv-2', conversationId: '2' })
    await t.linkToIssue(a.id, 99)
    await t.linkToIssue(b.id, 99)

    const linked = await t.ticketsForIssue(99)
    expect(linked.map((x) => x.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('throws when linking an unknown ticket', async () => {
    const t = new InMemoryTicketing()
    await expect(t.linkToIssue('nope', 1)).rejects.toThrow(TicketNotFoundError)
  })
})
