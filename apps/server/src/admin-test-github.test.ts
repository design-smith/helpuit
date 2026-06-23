import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import {
  createDb,
  DrizzleConfigStore,
  DrizzleSecretVault,
  DrizzleConfigAudit,
  DrizzleRestartFlag,
  type DbHandle,
} from '@helpuit/db'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import { resolveEffectiveConfig, type HelpuitConfig, type Env } from '@helpuit/config'
import { Holder, ConfigSupervisor } from '@helpuit/runtime-config'
import { buildAdminApi } from '@helpuit/composition'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
const servers: Server[] = []
afterEach(async () => {
  await app?.close()
  handle?.close()
  for (const s of servers) s.close()
  servers.length = 0
})

async function githubServer(status = 200): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('content-type', 'application/json')
    if (/\/repos\/[^/]+\/[^/]+$/.test(req.url ?? '')) {
      res.statusCode = status
      res.end(JSON.stringify(status >= 400 ? { message: 'Not Found' } : { full_name: 'acme/product' }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  }
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

const BASE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: acme, repo: product }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [basic]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const config = { github: { owner: 'acme', repo: 'product' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start(env: Env) {
  handle = await createDb(':memory:')
  const db = handle.db
  const supervisor = new ConfigSupervisor({
    holder: new Holder({}),
    rebuild: () => ({}),
    initialConfig: resolveEffectiveConfig({ baselineYaml: BASE_YAML, env }).config,
    baselineYaml: BASE_YAML,
    env,
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, new SecretBox(deriveKey('master'))),
    audit: new DrizzleConfigAudit(db),
    restartFlag: new DrizzleRestartFlag(db),
  })
  const api = buildAdminApi(config, { db, configController: supervisor })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('POST /admin/test/github (FCW-14)', () => {
  it('reports reachable for a repo the API serves', async () => {
    const gh = await githubServer(200)
    const base = await start({ GITHUB_TOKEN: 'ghp_x', GITHUB_API_URL: gh })

    expect((await fetch(`${base}/admin/test/github`, { method: 'POST' })).status).toBe(401)

    const res = await fetch(`${base}/admin/test/github`, { method: 'POST', headers: bearer })
    expect(res.status).toBe(200)
    expect((await res.json()) as { ok: boolean; repo: string }).toMatchObject({ ok: true, repo: 'acme/product' })
  })

  it('reports not-reachable when the API rejects', async () => {
    const gh = await githubServer(404)
    const base = await start({ GITHUB_TOKEN: 'ghp_x', GITHUB_API_URL: gh })

    const res = await fetch(`${base}/admin/test/github`, { method: 'POST', headers: bearer })
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false)
  })
})
