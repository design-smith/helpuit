import { describe, it, expect } from 'vitest'
import { QueryRouteCatalog, QueryRouteClient, type RouteExecutor } from '@helpuit/query-routes'
import { AccountInvestigator, type AccountModel } from './investigator.js'

const catalog = new QueryRouteCatalog([
  { name: 'getPlan', allowedColumns: ['plan'], param: 'userId' },
  { name: 'getFlags', allowedColumns: ['exports'], param: 'userId' },
])

const queries = [
  { route: 'getPlan', columns: ['plan'] },
  { route: 'getFlags', columns: ['exports'] },
]

function planSummarizingModel(): AccountModel {
  return {
    async summarize({ findings }) {
      const plan = (findings.getPlan?.[0] as { plan?: string } | undefined)?.plan
      return { summary: `plan=${plan}`, classificationHint: 'account_data_issue' }
    },
  }
}

describe('AccountInvestigator', () => {
  it('runs the configured context queries and returns the model summary', async () => {
    const executor: RouteExecutor = {
      async execute(route) {
        return route === 'getPlan' ? [{ plan: 'basic' }] : [{ exports: false }]
      },
    }
    const investigator = new AccountInvestigator(
      new QueryRouteClient(catalog, executor),
      queries,
      planSummarizingModel(),
    )

    const findings = await investigator.investigate({ userId: 'u1' })

    expect(findings.summary).toBe('plan=basic')
    expect(findings.classificationHint).toBe('account_data_issue')
  })

  it('binds every query to the verified identity (scoping), aggregating raw rows by route', async () => {
    const seen: string[] = []
    const executor: RouteExecutor = {
      async execute(route, _columns, bound) {
        seen.push(bound)
        return [{ route }]
      },
    }
    const investigator = new AccountInvestigator(
      new QueryRouteClient(catalog, executor),
      queries,
      { async summarize() { return { summary: 'ok' } } },
    )

    const findings = await investigator.investigate({ userId: 'u-real' })

    expect(seen).toEqual(['u-real', 'u-real'])
    expect(Object.keys(findings.raw)).toEqual(['getPlan', 'getFlags'])
  })

  it('still summarizes when there are no configured queries', async () => {
    const executor: RouteExecutor = { async execute() { return [] } }
    const investigator = new AccountInvestigator(new QueryRouteClient(catalog, executor), [], {
      async summarize({ findings }) {
        return { summary: `queries=${Object.keys(findings).length}` }
      },
    })
    const findings = await investigator.investigate({ userId: 'u1' })
    expect(findings.summary).toBe('queries=0')
  })
})
