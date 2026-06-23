import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

async function adminServer() {
  app = buildServer({
    admin: {
      token: 'admin-secret',
      overview: async () => ({ investigations: { total: 3 }, queue: { pending: 1 } }),
    },
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('GET /admin/overview', () => {
  it('serves the dashboard view-model with a valid bearer token', async () => {
    const base = await adminServer()
    const res = await fetch(`${base}/admin/overview`, { headers: { authorization: 'Bearer admin-secret' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ investigations: { total: 3 }, queue: { pending: 1 } })
  })

  it('rejects a missing or wrong token with 401', async () => {
    const base = await adminServer()

    const none = await fetch(`${base}/admin/overview`)
    expect(none.status).toBe(401)

    const wrong = await fetch(`${base}/admin/overview`, { headers: { authorization: 'Bearer nope' } })
    expect(wrong.status).toBe(401)
  })

  it('is not registered at all when no admin token is configured', async () => {
    app = buildServer({})
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    const res = await fetch(`${base}/admin/overview`)
    expect(res.status).toBe(404)
  })
})

describe('founder takeover endpoints', () => {
  it('pauses and resumes a conversation through the control store', async () => {
    const calls: Array<{ op: string; id: number; note?: string }> = []
    app = buildServer({
      admin: {
        token: 'admin-secret',
        overview: async () => ({}),
        control: {
          pause: async (id, note) => void calls.push({ op: 'pause', id, note }),
          resume: async (id) => void calls.push({ op: 'resume', id }),
        },
      },
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    const auth = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }

    const paused = await fetch(`${base}/admin/conversations/7/pause`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ note: 'handling manually' }),
    })
    expect(paused.status).toBe(200)
    expect(await paused.json()).toEqual({ status: 'paused', conversationId: 7 })

    const resumed = await fetch(`${base}/admin/conversations/7/resume`, { method: 'POST', headers: auth })
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toEqual({ status: 'resumed', conversationId: 7 })

    expect(calls).toEqual([
      { op: 'pause', id: 7, note: 'handling manually' },
      { op: 'resume', id: 7 },
    ])
  })

  it('rejects pause without a valid token', async () => {
    app = buildServer({
      admin: { token: 'admin-secret', overview: async () => ({}), control: { pause: async () => {}, resume: async () => {} } },
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    const res = await fetch(`${base}/admin/conversations/7/pause`, { method: 'POST' })
    expect(res.status).toBe(401)
  })
})
