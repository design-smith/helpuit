import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { createDb, DrizzleRestartFlag, type DbHandle } from '@helpuit/db'
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
const bearer = { authorization: `Bearer ${TOKEN}` }
const json = { ...bearer, 'content-type': 'application/json' }
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start() {
  handle = await createDb(':memory:')
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('admin manifest API (FCW-18)', () => {
  it('round-trips: empty → PUT a valid manifest persists (and flags a restart) → GET reflects it', async () => {
    const base = await start()

    expect((await fetch(`${base}/admin/manifest`, { method: 'PUT' })).status).toBe(401)

    // Nothing yet.
    expect(await (await fetch(`${base}/admin/manifest`, { headers: bearer })).json()).toBeNull()

    const manifest = {
      ref: 'main',
      features: [{ key: 'billing', name: 'Billing', routes: ['/settings/billing'], keywords: ['invoice'] }],
    }
    const put = await fetch(`${base}/admin/manifest`, { method: 'PUT', headers: json, body: JSON.stringify(manifest) })
    expect(put.status).toBe(200)
    expect(((await put.json()) as { ok: boolean }).ok).toBe(true)

    const loaded = (await (await fetch(`${base}/admin/manifest`, { headers: bearer })).json()) as {
      ref: string
      features: Array<{ key: string; components: string[] }>
    }
    expect(loaded.ref).toBe('main')
    expect(loaded.features[0]!.key).toBe('billing')
    expect(loaded.features[0]!.components).toEqual([]) // normalized

    // Saving flags a restart so the apply-banner appears.
    expect((await new DrizzleRestartFlag(handle!.db).get()).reasons).toContain('manifest')
  })

  it('rejects an invalid manifest with 422 + errors, and does not persist it', async () => {
    const base = await start()

    const bad = await fetch(`${base}/admin/manifest`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ ref: '', features: [{ key: '', name: '' }] }),
    })
    expect(bad.status).toBe(422)
    const body = (await bad.json()) as { ok: boolean; errors: string[] }
    expect(body.ok).toBe(false)
    expect(body.errors.length).toBeGreaterThan(0)

    // Nothing was stored.
    expect(await (await fetch(`${base}/admin/manifest`, { headers: bearer })).json()).toBeNull()
  })
})
