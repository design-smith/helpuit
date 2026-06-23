import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import {
  createDb,
  DrizzleJobQueue,
  DrizzleAlertHistory,
  type DbHandle,
} from '@helpuit/db'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'
import { ActivityBus } from './activity.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
})

const config = {
  github: { owner: 'o', repo: 'r', token: 't', productionBranch: 'main' },
  security: { encryptionKey: 'k' },
  budget: { perDay: 1000 },
} as unknown as HelpuitConfig
const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }

async function start(activity?: ActivityBus) {
  handle = await createDb(':memory:')
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api, activity } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('operations API', () => {
  it('lists jobs, retries a failed one, and purges', async () => {
    const base = await start()
    const q = new DrizzleJobQueue(handle!.db)
    const id = await q.enqueue({ type: 'investigation', payload: { x: 1 }, maxAttempts: 1 }, 1)
    await q.claim(1)
    await q.fail(id, 'boom', { now: 1, retryDelayMs: 0 })

    const list = (await (await fetch(`${base}/admin/jobs?status=failed`, { headers: bearer })).json()) as {
      items: Array<{ id: string }>
    }
    expect(list.items[0]!.id).toBe(id)
    // payload is omitted from the list (can hold raw webhook content)
    expect(JSON.stringify(list)).not.toContain('"x":1')

    const retry = await fetch(`${base}/admin/jobs/${id}/retry`, { method: 'POST', headers: bearer })
    expect(((await retry.json()) as { retried: boolean }).retried).toBe(true)

    const purge = await fetch(`${base}/admin/jobs/purge?status=done`, { method: 'POST', headers: bearer })
    expect(purge.status).toBe(200)
    const badPurge = await fetch(`${base}/admin/jobs/purge?status=bogus`, { method: 'POST', headers: bearer })
    expect(badPurge.status).toBe(400)
  })

  it('returns alert history', async () => {
    const base = await start()
    await new DrizzleAlertHistory(handle!.db).record({ kind: 'budget', severity: 'warn', message: 'spend 90%' })
    const res = await fetch(`${base}/admin/alerts/history`, { headers: bearer })
    const body = (await res.json()) as { items: Array<{ message: string }> }
    expect(body.items[0]!.message).toBe('spend 90%')
  })

  it('streams live activity events over SSE', async () => {
    const activity = new ActivityBus()
    const base = await start(activity)
    const res = await fetch(`${base}/admin/stream`, { headers: bearer })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    // publish once a subscriber is attached
    await new Promise((r) => setTimeout(r, 50))
    activity.publish({ type: 'outcome', at: 123, data: { outcome: 'guided', conversationId: 7 } })

    let buf = ''
    while (!buf.includes('"outcome":"guided"')) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value)
    }
    expect(buf).toContain('"outcome":"guided"')
    expect(buf).toContain('"conversationId":7')
    await reader.cancel()
  })

  it('rejects an unauthenticated SSE connection', async () => {
    const base = await start(new ActivityBus())
    const res = await fetch(`${base}/admin/stream`)
    expect(res.status).toBe(401)
  })
})
