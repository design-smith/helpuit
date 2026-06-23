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
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start() {
  handle = await createDb(':memory:')
  const db = handle.db
  const supervisor = new ConfigSupervisor({
    holder: new Holder({}),
    rebuild: () => ({}),
    initialConfig: resolveEffectiveConfig({ baselineYaml: BASE_YAML, env: {} }).config,
    baselineYaml: BASE_YAML,
    env: {},
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, new SecretBox(deriveKey('master'))),
    audit: new DrizzleConfigAudit(db),
    restartFlag: new DrizzleRestartFlag(db),
  })
  // A pending change so there's a reason to restart.
  await supervisor.setSecret('GITHUB_TOKEN', 'ghp-new')

  let restartCalls = 0
  const onRestart = () => {
    restartCalls += 1
  }
  const api = buildAdminApi(config, { db, configController: supervisor })
  app = buildServer({ admin: { token: TOKEN, api, onRestart } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  return { base, calls: () => restartCalls }
}

const restart = (base: string, init: RequestInit = {}) => fetch(`${base}/admin/config/restart`, { method: 'POST', ...init })
const tick = () => new Promise((r) => setTimeout(r, 25))

describe('POST /admin/config/restart (FCW-15)', () => {
  it('401s without auth', async () => {
    const { base } = await start()
    expect((await restart(base)).status).toBe(401)
  })

  it('reports the pending reasons and triggers exactly one clean exit signal', async () => {
    const { base, calls } = await start()

    const res = await restart(base, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; reasons: string[] }
    expect(body.status).toBe('restarting')
    expect(body.reasons).toContain('secret:GITHUB_TOKEN')

    await tick()
    expect(calls()).toBe(1)
  })

  it('triggers only a single exit signal even if pressed twice', async () => {
    const { base, calls } = await start()
    await restart(base, { headers: bearer })
    await restart(base, { headers: bearer })
    await tick()
    expect(calls()).toBe(1)
  })
})
