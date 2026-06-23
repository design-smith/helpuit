import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { createDb, type DbHandle } from '@helpuit/db'
import { buildAdminApi, DocsService } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
})

const config = {
  github: { owner: 'o', repo: 'r', token: 't', productionBranch: 'main' },
  security: { encryptionKey: 'test-key' },
  budget: { perDay: 1000 },
} as unknown as HelpuitConfig

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const json = { ...bearer, 'content-type': 'application/json' }

async function start() {
  handle = await createDb(':memory:')
  const docs = await DocsService.create(handle.db)
  const api = buildAdminApi(config, { db: handle.db, docs })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  return { base, docs }
}

describe('admin docs API (FCW-04)', () => {
  it('adds a doc, lists it, grounds L1 on it live, then removes it', async () => {
    const { base, docs } = await start()

    // 401 without auth.
    expect((await fetch(`${base}/admin/docs`, { method: 'POST' })).status).toBe(401)

    // Operator pastes a doc.
    const add = await fetch(`${base}/admin/docs`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: 'SSO', text: 'Enable single sign-on under Settings, Security, then SSO.' }),
    })
    expect(add.status).toBe(200)
    const created = (await add.json()) as { id: string; title: string }
    expect(created.id).toBeTruthy()
    expect(created.title).toBe('SSO')

    // It is listed.
    const list = await fetch(`${base}/admin/docs`, { headers: bearer })
    expect(list.status).toBe(200)
    const items = ((await list.json()) as { items: Array<{ id: string }> }).items
    expect(items.map((d) => d.id)).toContain(created.id)

    // It is ingested into the SAME live index L1 retrieves from — so it grounds
    // answers immediately, with no restart. (The full GuidanceAgent → sources path
    // is covered in the composition tests; here we assert the retrieval contract.)
    const hits = docs.index.retrieve('how do I enable single sign-on?')
    expect(hits.map((h) => h.id)).toContain(created.id)

    // It can be removed.
    const del = await fetch(`${base}/admin/docs/${created.id}`, { method: 'DELETE', headers: bearer })
    expect(del.status).toBe(200)
    const after = await fetch(`${base}/admin/docs`, { headers: bearer })
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0)
  })
})
