import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
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

async function llmServer(): Promise<string> {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

const BASE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [basic]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: openai-compatible
  tiers: { guidance: { model: local }, reasoning: { model: local }, vision: { model: local } }
`

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

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

describe('POST /admin/test/llm (FCW-09)', () => {
  it('reports ok after a real completion against the configured provider', async () => {
    const llm = await llmServer()
    const base = await start({ OPENAI_COMPATIBLE_BASE_URL: `${llm}/v1` })

    expect((await fetch(`${base}/admin/test/llm`, { method: 'POST' })).status).toBe(401)

    const res = await fetch(`${base}/admin/test/llm`, { method: 'POST', headers: bearer })
    expect(res.status).toBe(200)
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true, provider: 'openai-compatible' })
  })

  it('reports a clear failure when the provider endpoint/key is unset', async () => {
    const base = await start({}) // no OPENAI_COMPATIBLE_BASE_URL → unconfigured

    const res = await fetch(`${base}/admin/test/llm`, { method: 'POST', headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; detail: string }
    expect(body.ok).toBe(false)
    expect(body.detail).toMatch(/no api key/i)
  })
})
