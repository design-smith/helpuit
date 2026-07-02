import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchRequesterExternalId } from './identity.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeFreshdesk(routes: (url: string) => unknown) {
  const seen: string[] = []
  server = createServer((req, res) => {
    seen.push(req.url ?? '')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(routes(req.url ?? '')))
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/v2`
  return { baseUrl, seen }
}

describe('fetchRequesterExternalId', () => {
  it('prefers the contact unique_external_id (the merchant-side user id)', async () => {
    const { baseUrl, seen } = await fakeFreshdesk(() => ({ id: 55, unique_external_id: 'user-1', email: 'a@x.com' }))
    expect(await fetchRequesterExternalId({ baseUrl, apiKey: 'k' }, '55')).toBe('user-1')
    expect(seen[0]).toBe('/api/v2/contacts/55')
  })

  it('falls back to email when no external id is set', async () => {
    const { baseUrl } = await fakeFreshdesk(() => ({ id: 56, email: 'b@x.com' }))
    expect(await fetchRequesterExternalId({ baseUrl, apiKey: 'k' }, '56')).toBe('b@x.com')
  })

  it('returns null when the contact has neither, or requesterId is missing', async () => {
    const { baseUrl } = await fakeFreshdesk(() => ({ id: 57 }))
    expect(await fetchRequesterExternalId({ baseUrl, apiKey: 'k' }, '57')).toBeNull()
    expect(await fetchRequesterExternalId({ baseUrl, apiKey: 'k' }, undefined)).toBeNull()
  })
})
