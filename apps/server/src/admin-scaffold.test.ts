import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { createDb, type DbHandle } from '@helpuit/db'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
})

const TOKEN = 'admin-secret'
const json = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start() {
  handle = await createDb(':memory:')
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

const post = (base: string, body: unknown) =>
  fetch(`${base}/admin/scaffold/supabase-query-route`, { method: 'POST', headers: json, body: JSON.stringify(body) })

describe('POST /admin/scaffold/supabase-query-route (FCW-19)', () => {
  it('401s without auth', async () => {
    const base = await start()
    expect((await fetch(`${base}/admin/scaffold/supabase-query-route`, { method: 'POST' })).status).toBe(401)
  })

  it('returns a function + config scaffold for valid input', async () => {
    const base = await start()
    const res = await post(base, { table: 'profiles', userColumn: 'id', allowedColumns: ['plan', 'status'] })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { functionTs: string; configYaml: string }
    expect(body.functionTs).toContain('Deno.serve')
    expect(body.configYaml).toContain('getAccount')
  })

  it('400s when required fields are missing', async () => {
    const base = await start()
    expect((await post(base, { table: '', userColumn: '', allowedColumns: [] })).status).toBe(400)
  })
})
