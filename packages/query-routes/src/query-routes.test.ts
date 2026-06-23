import { describe, it, expect } from 'vitest'
import {
  QueryRouteCatalog,
  QueryRouteClient,
  findSensitiveColumns,
  UnknownRouteError,
  DisallowedColumnError,
  type RouteExecutor,
} from './query-routes.js'

const catalog = new QueryRouteCatalog([
  { name: 'getPlan', allowedColumns: ['plan', 'status'], param: 'userId' },
])

describe('QueryRouteCatalog', () => {
  it('accepts allowed columns', () => {
    expect(() => catalog.validate('getPlan', ['plan'])).not.toThrow()
  })

  it('rejects a column not on the allowlist', () => {
    expect(() => catalog.validate('getPlan', ['password'])).toThrow(DisallowedColumnError)
  })

  it('rejects an unknown route', () => {
    expect(() => catalog.validate('getSecrets', ['x'])).toThrow(UnknownRouteError)
  })
})

describe('QueryRouteClient', () => {
  it('binds the scoping param to the verified identity, not caller input', async () => {
    let boundValue: string | null = null
    const executor: RouteExecutor = {
      async execute(_route, _columns, bound) {
        boundValue = bound
        return [{ plan: 'basic' }]
      },
    }
    const client = new QueryRouteClient(catalog, executor)

    const rows = await client.query({ route: 'getPlan', columns: ['plan'] }, { userId: 'u-real' })

    expect(boundValue).toBe('u-real')
    expect(rows).toEqual([{ plan: 'basic' }])
  })

  it('refuses to execute a disallowed column', async () => {
    const executor: RouteExecutor = { async execute() { return [] } }
    const client = new QueryRouteClient(catalog, executor)
    await expect(
      client.query({ route: 'getPlan', columns: ['password'] }, { userId: 'u-real' }),
    ).rejects.toThrow(DisallowedColumnError)
  })
})

describe('findSensitiveColumns', () => {
  it('flags plaintext-sensitive column names', () => {
    expect(findSensitiveColumns(['plan', 'password', 'api_key', 'status'])).toEqual([
      'password',
      'api_key',
    ])
  })
})
