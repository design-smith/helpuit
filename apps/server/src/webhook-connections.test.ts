import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer, type WebhookConnection } from './server.js'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

function recording() {
  const calls: Array<{ payload: unknown; context: unknown }> = []
  const conn: WebhookConnection = {
    intake: async (payload, context) => {
      calls.push({ payload, context })
      return { outcome: 'guided' }
    },
    extractContext: (p) => ({ customAttributes: { tok: (p as { tok?: unknown }).tok } }),
  }
  return { conn, calls }
}

const post = (a: FastifyInstance, url: string, body: unknown) =>
  a.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) })

describe('POST /webhooks/:connectionId — generic platform dispatch', () => {
  it('routes to the matching connection and passes its extracted context', async () => {
    const { conn, calls } = recording()
    app = buildServer({ connections: { 'intercom-1': conn } })

    const res = await post(app, '/webhooks/intercom-1', { tok: 'abc' })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.context).toEqual({ customAttributes: { tok: 'abc' } })
  })

  it('404s an unknown connection', async () => {
    const { conn } = recording()
    app = buildServer({ connections: { 'intercom-1': conn } })

    const res = await post(app, '/webhooks/nope', {})

    expect(res.statusCode).toBe(404)
  })

  it('acknowledges but skips a disabled connection', async () => {
    const { conn, calls } = recording()
    app = buildServer({ connections: { x: { ...conn, enabled: () => false } } })

    const res = await post(app, '/webhooks/x', {})

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'skipped' })
    expect(calls).toHaveLength(0)
  })

  it('rejects a bad signature with 401 (and never calls intake), accepts a good one', async () => {
    const { conn, calls } = recording()
    const verifying: WebhookConnection = { ...conn, verify: (raw) => raw.includes('good') }
    app = buildServer({ connections: { 'intercom-1': verifying } })

    const bad = await post(app, '/webhooks/intercom-1', { sig: 'bad' })
    expect(bad.statusCode).toBe(401)
    expect(calls).toHaveLength(0)

    const ok = await post(app, '/webhooks/intercom-1', { sig: 'good' })
    expect(ok.statusCode).toBe(200)
    expect(calls).toHaveLength(1)
  })

  it('keeps two connections independent (dispatches to the right one)', async () => {
    const a = recording()
    const b = recording()
    app = buildServer({ connections: { 'cw-1': a.conn, 'cw-2': b.conn } })

    await post(app, '/webhooks/cw-2', { tok: 'z' })

    expect(a.calls).toHaveLength(0)
    expect(b.calls).toHaveLength(1)
  })
})
