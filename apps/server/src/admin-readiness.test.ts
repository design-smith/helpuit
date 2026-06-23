import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
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
import { resolveEffectiveConfig, type HelpuitConfig } from '@helpuit/config'
import { Holder, ConfigSupervisor } from '@helpuit/runtime-config'
import { buildAdminApi } from '@helpuit/composition'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
})

const BASE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [basic]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m1 }, reasoning: { model: m2 }, vision: { model: m3 } }
budget: { perDay: 1000 }
`

// All required secrets EXCEPT GITHUB_TOKEN → readiness should block on it.
const ENV = {
  CHATWOOT_API_TOKEN: 'cw',
  IDENTITY_HMAC_SECRET: 'hmac',
  ANTHROPIC_API_KEY: 'sk',
  SANDBOX_BASIC_USER: 'u',
  SANDBOX_BASIC_PASS: 'p',
}

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start() {
  handle = await createDb(':memory:')
  const db = handle.db
  const supervisor = new ConfigSupervisor({
    holder: new Holder({}),
    rebuild: () => ({}),
    initialConfig: resolveEffectiveConfig({ baselineYaml: BASE_YAML, env: ENV }).config,
    baselineYaml: BASE_YAML,
    env: ENV,
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

describe('GET /admin/readiness (FCW-07)', () => {
  it('401s without auth and reports blockers + ready:false when a required secret is missing', async () => {
    const base = await start()

    expect((await fetch(`${base}/admin/readiness`)).status).toBe(401)

    const res = await fetch(`${base}/admin/readiness`, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ready: boolean; blockers: Array<{ key: string }>; warnings: Array<{ key: string }> }
    expect(body.ready).toBe(false)
    expect(body.blockers.map((b) => b.key)).toContain('GITHUB_TOKEN')
    expect(Array.isArray(body.warnings)).toBe(true)
  })
})
