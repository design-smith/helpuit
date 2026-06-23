import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleSpendRepository } from './spend-repository.js'
import { DrizzleDashboardService } from './dashboard.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleSpendRepository', () => {
  it('records and totals spend, and feeds the dashboard total', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleSpendRepository(handle.db)
    await repo.record({ investigationId: 'global', amount: 100, at: 1 })
    await repo.record({ investigationId: 'global', amount: 250, at: 2 })
    await repo.record({ investigationId: 'inv-1', amount: 40, at: 3 })

    expect(await repo.totalForInvestigation('global')).toBe(350)
    expect(await repo.totalForInvestigation('inv-1')).toBe(40)
    expect((await repo.listForInvestigation('global')).map((e) => e.amount)).toEqual([100, 250])

    // the dashboard's spend.totalTokens sums ALL rows — was always 0 before persistence
    const dashboard = new DrizzleDashboardService(handle.db)
    const overview = await dashboard.overview({})
    expect(overview.spend.totalTokens).toBe(390)
  })
})
