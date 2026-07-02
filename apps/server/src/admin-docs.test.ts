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
    // answers immediately, with no restart. (The full consult→compose grounding path
    // is covered in the composition tests; here we assert the retrieval contract.)
    const hits = await docs.index.retrieve('how do I enable single sign-on?')
    expect(hits.map((h) => h.id)).toContain(created.id)

    // It can be removed.
    const del = await fetch(`${base}/admin/docs/${created.id}`, { method: 'DELETE', headers: bearer })
    expect(del.status).toBe(200)
    const after = await fetch(`${base}/admin/docs`, { headers: bearer })
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it('imports a source-tagged doc and re-import refreshes it in place (no duplicate)', async () => {
    const { base, docs } = await start()
    const post = (body: unknown) => fetch(`${base}/admin/docs`, { method: 'POST', headers: json, body: JSON.stringify(body) })

    const a = await post({ title: 'Handbook', text: 'Vacation is 20 days.', source: 'gdrive', externalId: 'file-1' })
    expect(a.status).toBe(200)
    const created = (await a.json()) as { id: string; source: string; externalId: string }
    expect(created).toMatchObject({ source: 'gdrive', externalId: 'file-1' })

    const list1 = (await (await fetch(`${base}/admin/docs`, { headers: bearer })).json()) as {
      items: Array<{ id: string; source: string; externalId: string }>
    }
    expect(list1.items).toHaveLength(1)
    expect(list1.items[0]).toMatchObject({ source: 'gdrive', externalId: 'file-1' })

    // Re-import the same file with new text → same id, replaced, no duplicate, live.
    const b = await post({ text: 'Vacation is now 25 days.', source: 'gdrive', externalId: 'file-1' })
    expect(((await b.json()) as { id: string }).id).toBe(created.id)
    const list2 = (await (await fetch(`${base}/admin/docs`, { headers: bearer })).json()) as { items: unknown[] }
    expect(list2.items).toHaveLength(1)
    expect((await docs.index.retrieve('vacation days'))[0]!.text).toContain('25 days')
  })

  it('defaults source to "upload" when omitted (legacy paste path)', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/admin/docs`, { method: 'POST', headers: json, body: JSON.stringify({ text: 'a plain note' }) })
    expect(((await res.json()) as { source: string }).source).toBe('upload')
  })

  it('scrapes a posted URL server-side (source "link") and re-posting refreshes in place', async () => {
    const { createServer } = await import('node:http')
    let html = '<html><head><title>Pricing</title></head><body><p>Pro costs $20 per month.</p></body></html>'
    const site = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end(html)
    })
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(site.address() as import('node:net').AddressInfo).port}/pricing`

    try {
      const { base, docs } = await start()
      const post = () =>
        fetch(`${base}/admin/docs`, { method: 'POST', headers: json, body: JSON.stringify({ source: 'link', externalId: url }) })

      const res = await post()
      expect(res.status).toBe(200)
      const created = (await res.json()) as { id: string; source: string; externalId: string; text: string }
      expect(created).toMatchObject({ source: 'link', externalId: url })
      expect(created.text).toContain('Pro costs $20 per month.')
      expect((await docs.index.retrieve('how much does pro cost per month?')).map((h) => h.id)).toContain(created.id)

      // The page changes; re-posting the same URL refreshes the SAME doc (no dupe).
      html = '<html><body><p>Pro costs $25 per month.</p></body></html>'
      const again = (await (await post()).json()) as { id: string }
      expect(again.id).toBe(created.id)
      const list = (await (await fetch(`${base}/admin/docs`, { headers: bearer })).json()) as { items: unknown[] }
      expect(list.items).toHaveLength(1)
    } finally {
      site.close()
    }
  })
})
