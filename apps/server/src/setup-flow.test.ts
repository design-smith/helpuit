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

// A fresh fork: a valid structural baseline (set via the console connectors), but
// no secrets yet — exactly the unconfigured state the Setup checklist guides.
const BASE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}` }
const json = { ...bearer, 'content-type': 'application/json' }
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/
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
  const api = buildAdminApi(config, { db, configController: supervisor })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

interface Readiness {
  ready: boolean
  blockers: Array<{ key: string; message: string }>
  warnings: Array<{ key: string }>
}

describe('onboarding setup flow (readiness → ready)', () => {
  it('a fresh fork is not ready, then becomes ready as each blocking secret is set', async () => {
    const base = await start()

    const before = (await (await fetch(`${base}/admin/readiness`, { headers: bearer })).json()) as Readiness
    expect(before.ready).toBe(false)
    expect(before.blockers.length).toBeGreaterThan(0)
    // The bare-job connectors all show up as blockers.
    for (const key of ['CHATWOOT_API_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'IDENTITY_HMAC_SECRET']) {
      expect(before.blockers.map((b) => b.key)).toContain(key)
    }

    // Set every blocking secret through the real admin API (vaulted, encrypted).
    for (const blocker of before.blockers) {
      if (!ENV_KEY.test(blocker.key)) continue // structural gaps aren't secrets
      const res = await fetch(`${base}/admin/config/secret/${blocker.key}`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ value: 'configured-value' }),
      })
      expect(res.status).toBe(200)
    }

    // Readiness recomputes from the vault (forward-looking, before any restart) → ready.
    const after = (await (await fetch(`${base}/admin/readiness`, { headers: bearer })).json()) as Readiness
    expect(after.blockers).toEqual([])
    expect(after.ready).toBe(true)
  })
})
