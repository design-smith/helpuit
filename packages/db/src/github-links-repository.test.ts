import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleGithubLinks } from './github-links-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleGithubLinks', () => {
  it('links, lists, syncs open/closed status, and reports the sync worklist', async () => {
    handle = await createDb(':memory:')
    let clock = 0
    const repo = new DrizzleGithubLinks(handle.db, () => clock)

    clock = 1
    await repo.link({ investigationId: 'a', issueNumber: 10, issueUrl: 'https://gh/issues/10' })
    clock = 2
    await repo.link({ investigationId: 'b', issueNumber: 20, issueUrl: 'https://gh/issues/20' })
    clock = 3
    await repo.link({ investigationId: 'c', issueNumber: 10, issueUrl: 'https://gh/issues/10' }) // same issue, fanned out

    expect((await repo.listAll()).total).toBe(3)
    // freshly linked → status unknown (null) → counts as still-needing-solving
    expect((await repo.issueNumbersNeedingSync()).sort((x, y) => x - y)).toEqual([10, 20])

    // close issue 10 → both of its links flip
    await repo.updateStatus(10, 'closed', 5000)

    const closed = await repo.listAll({}, { status: 'closed' })
    expect(closed.total).toBe(2)
    expect(closed.items.every((r) => r.status === 'closed' && r.lastSyncedAt === 5000)).toBe(true)

    const open = await repo.listAll({}, { status: 'open' })
    expect(open.items.map((r) => r.issueNumber)).toEqual([20]) // null status counts as open/unsolved

    expect(await repo.issueNumbersNeedingSync()).toEqual([20]) // 10 is closed, drops off the worklist
  })
})
