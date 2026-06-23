import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createDb, type DbHandle } from '@helpuit/db'
import { buildServer } from './server.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
})

async function listen(instance: FastifyInstance): Promise<string> {
  app = instance
  await instance.listen({ port: 0, host: '127.0.0.1' })
  const address = instance.server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

describe('server', () => {
  it('responds 200 on /healthz over a real HTTP listener', async () => {
    const base = await listen(buildServer())
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('serves an actionable page at / when the operator console is not built', async () => {
    const base = await listen(buildServer())
    const res = await fetch(`${base}/`, { headers: { accept: 'text/html' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('pnpm --filter @helpuit/web build')
  })

  it('keeps API 404s as JSON even when the console is not built', async () => {
    const base = await listen(buildServer())
    const res = await fetch(`${base}/admin/nope`, { headers: { accept: 'text/html' } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('reports ready (200) when a real database ping succeeds', async () => {
    handle = await createDb(':memory:')
    const base = await listen(
      buildServer({
        readiness: [
          {
            name: 'database',
            check: async () => {
              await handle!.client.execute('SELECT 1')
              return true
            },
          },
        ],
      }),
    )
    const res = await fetch(`${base}/readyz`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; checks: Array<{ name: string; ok: boolean }> }
    expect(body.status).toBe('ok')
    expect(body.checks).toEqual([{ name: 'database', ok: true }])
  })

  it('reports unavailable (503) when a dependency check fails', async () => {
    const base = await listen(
      buildServer({
        readiness: [
          { name: 'database', check: async () => true },
          { name: 'queue', check: async () => false },
        ],
      }),
    )
    const res = await fetch(`${base}/readyz`)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: Array<{ name: string; ok: boolean }> }
    expect(body.status).toBe('unavailable')
    expect(body.checks).toContainEqual({ name: 'queue', ok: false })
  })

  it('treats a throwing check as not-ready rather than crashing', async () => {
    const base = await listen(
      buildServer({
        readiness: [{ name: 'flaky', check: async () => { throw new Error('boom') } }],
      }),
    )
    const res = await fetch(`${base}/readyz`)
    expect(res.status).toBe(503)
  })
})
