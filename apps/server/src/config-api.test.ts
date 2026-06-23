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
import { resolveEffectiveConfig } from '@helpuit/config'
import { Holder, ConfigSupervisor } from '@helpuit/runtime-config'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
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
policy: { allowAnonymous: false }
budget: { perDay: 1000 }
`
const ENV = {
  HELPUIT_PUBLIC_URL: 'https://helpuit.example.com',
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 'h',
  ANTHROPIC_API_KEY: 'sk',
  SANDBOX_BASIC_USER: 'u',
  SANDBOX_BASIC_PASS: 'p',
}
const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

async function start() {
  handle = await createDb(':memory:')
  const db = handle.db
  const initialConfig = resolveEffectiveConfig({ baselineYaml: BASE_YAML, env: ENV }).config
  const holder = new Holder<Record<string, never>>({})
  const supervisor = new ConfigSupervisor({
    holder,
    rebuild: (_cfg: HelpuitConfig) => ({}),
    initialConfig,
    baselineYaml: BASE_YAML,
    env: ENV,
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, new SecretBox(deriveKey('master'))),
    audit: new DrizzleConfigAudit(db),
    restartFlag: new DrizzleRestartFlag(db),
  })
  const api = buildAdminApi(initialConfig, { db, configController: supervisor })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('config + secrets API', () => {
  it('returns the effective config with secrets masked', async () => {
    const base = await start()
    const res = await fetch(`${base}/admin/config/effective`, { headers: bearer })
    expect(res.status).toBe(200)
    const view = (await res.json()) as any
    expect(view.config.github.token).toBe('••••')
    expect(JSON.stringify(view)).not.toContain('"gh"')
    expect(Array.isArray(view.secrets)).toBe(true)
    expect(view.editableSections).toContain('policy')
  })

  it('applies a live structural change (200) and rejects an invalid one (422)', async () => {
    const base = await start()
    const ok = await fetch(`${base}/admin/config/section/policy`, {
      method: 'PUT',
      headers: bearer,
      body: JSON.stringify({ allowAnonymous: true }),
    })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { mode: string }).mode).toBe('live')

    const bad = await fetch(`${base}/admin/config/section/budget`, {
      method: 'PUT',
      headers: bearer,
      body: JSON.stringify({ perDay: -1 }),
    })
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('applies a restart-class section (github) as restart-required (200)', async () => {
    const base = await start()
    const res = await fetch(`${base}/admin/config/section/github`, {
      method: 'PUT',
      headers: bearer,
      body: JSON.stringify({ owner: 'newowner', repo: 'newrepo', productionBranch: 'main', auth: 'pat' }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { mode: string }).mode).toBe('restart')

    const status = (await (await fetch(`${base}/admin/config/restart-status`, { headers: bearer })).json()) as {
      pending: boolean
    }
    expect(status.pending).toBe(true)
  })

  it('sets a secret (restart-required) and reflects it in restart-status', async () => {
    const base = await start()
    const set = await fetch(`${base}/admin/config/secret/GITHUB_TOKEN`, {
      method: 'PUT',
      headers: bearer,
      body: JSON.stringify({ value: 'ghp-new' }),
    })
    expect(set.status).toBe(200)
    expect(((await set.json()) as { mode: string }).mode).toBe('restart')

    const status = await fetch(`${base}/admin/config/restart-status`, { headers: bearer })
    const body = (await status.json()) as any
    expect(body.pending).toBe(true)
    expect(body.reasons).toContain('secret:GITHUB_TOKEN')
  })

  it('rejects an empty secret value with 400', async () => {
    const base = await start()
    const res = await fetch(`${base}/admin/config/secret/GITHUB_TOKEN`, {
      method: 'PUT',
      headers: bearer,
      body: JSON.stringify({ value: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('serves a GitHub App manifest + state, and state-gates the callback', async () => {
    const base = await start()
    const res = await fetch(`${base}/admin/connect/github/manifest`, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; manifest: { redirect_url: string }; state: string }
    expect(body.url).toContain('github.com/settings/apps/new')
    expect(body.manifest.redirect_url).toBe('https://helpuit.example.com/admin/connect/github/callback')
    expect(typeof body.state).toBe('string')

    // the GitHub redirect-back callback rejects a forged state (no cookie needed)
    const cb = await fetch(`${base}/admin/connect/github/callback?code=x&state=forged`, { redirect: 'manual' })
    expect(cb.status).toBe(401)
  })
})
