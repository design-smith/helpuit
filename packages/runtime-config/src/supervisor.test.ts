import { describe, it, expect, afterEach } from 'vitest'
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
import { Holder } from './holder.js'
import { ConfigSupervisor } from './supervisor.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

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

const FULL_ENV: Env = {
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 'hmac',
  ANTHROPIC_API_KEY: 'sk',
  SANDBOX_BASIC_USER: 'u',
  SANDBOX_BASIC_PASS: 'p',
}

// The "live unit" rebuilt on each apply — a sentinel reflecting the config.
interface Unit {
  allowAnonymous: boolean
  perDay: number
}

async function makeSupervisor(env: Env) {
  handle = await createDb(':memory:')
  const db = handle.db
  const holder = new Holder<Unit>({ allowAnonymous: false, perDay: 1000 })
  const initialConfig = resolveEffectiveConfig({ baselineYaml: BASE_YAML, env }).config
  let builds = 0
  const supervisor = new ConfigSupervisor<Unit>({
    holder,
    rebuild: (cfg: HelpuitConfig) => {
      builds++
      if (cfg.budget.perDay > 9_000_000) throw new Error('perDay too high for this fake build')
      return { allowAnonymous: cfg.policy.allowAnonymous, perDay: cfg.budget.perDay }
    },
    initialConfig,
    baselineYaml: BASE_YAML,
    env,
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, new SecretBox(deriveKey('master'))),
    audit: new DrizzleConfigAudit(db),
    restartFlag: new DrizzleRestartFlag(db),
  })
  return { supervisor, holder, getBuilds: () => builds }
}

describe('ConfigSupervisor', () => {
  it('applies a live structural change: rebuilds, swaps the holder, persists', async () => {
    const { supervisor, holder } = await makeSupervisor(FULL_ENV)
    const result = await supervisor.applyStructural('policy', { allowAnonymous: true })
    expect(result).toEqual({ ok: true, mode: 'live' })
    expect(holder.get().allowAnonymous).toBe(true) // new orchestrator is live
    // persisted: a fresh effective view reflects it
    const view = await supervisor.effective()
    expect((view.config as any).policy.allowAnonymous).toBe(true)
  })

  it('rejects an invalid section without persisting or swapping (rollback)', async () => {
    const { supervisor, holder } = await makeSupervisor(FULL_ENV)
    const before = holder.get()
    const result = await supervisor.applyStructural('budget', { perDay: -5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid')
    expect(holder.get()).toBe(before) // unchanged
  })

  it('rolls back when the trial rebuild throws (never swaps a broken unit)', async () => {
    const { supervisor, holder } = await makeSupervisor(FULL_ENV)
    const before = holder.get()
    const result = await supervisor.applyStructural('budget', { perDay: 9_000_001 })
    expect(result.ok).toBe(false)
    expect(holder.get()).toBe(before)
  })

  it('persists a restart-class section (github) and flags a restart, without swapping', async () => {
    const { supervisor, holder } = await makeSupervisor(FULL_ENV)
    const before = holder.get()
    const result = await supervisor.applyStructural('github', {
      owner: 'newowner',
      repo: 'newrepo',
      productionBranch: 'main',
      auth: 'pat',
    })
    expect(result).toEqual({ ok: true, mode: 'restart' })
    expect(holder.get()).toBe(before) // NOT swapped — applies on restart
    const status = await supervisor.restartStatus()
    expect(status.pending).toBe(true)
    expect(status.reasons).toContain('config:github')
  })

  it('still rejects an invalid restart-class section without flagging a restart', async () => {
    const { supervisor } = await makeSupervisor(FULL_ENV)
    // chatwoot.accountId must be a positive int — a bad value must not persist/flag
    const result = await supervisor.applyStructural('chatwoot', { baseUrl: 'not-a-url', accountId: 1, inboxId: 2 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid')
    expect((await supervisor.restartStatus()).pending).toBe(false)
  })

  it('rejects an unknown section', async () => {
    const { supervisor } = await makeSupervisor(FULL_ENV)
    const result = await supervisor.applyStructural('bogus', { x: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('unknown_section')
  })

  it('stores a secret and flags a restart (no live swap)', async () => {
    const { supervisor, holder } = await makeSupervisor(FULL_ENV)
    const before = holder.get()
    const result = await supervisor.setSecret('GITHUB_TOKEN', 'ghp-new')
    expect(result).toEqual({ ok: true, mode: 'restart' })
    expect(holder.get()).toBe(before) // unchanged until restart
    const status = await supervisor.restartStatus()
    expect(status.pending).toBe(true)
    expect(status.reasons).toContain('secret:GITHUB_TOKEN')
    // presence shows it set, masked
    const view = await supervisor.effective()
    expect(view.secrets.find((s) => s.key === 'GITHUB_TOKEN')?.set).toBe(true)
  })

  it('lists env-satisfied required secrets in the catalog with source "env"', async () => {
    const { supervisor } = await makeSupervisor(FULL_ENV)
    const view = await supervisor.effective()
    // GITHUB_TOKEN is required and provided via env (not the vault) — it must still
    // appear so the operator can rotate it in the console.
    expect(view.secrets.find((s) => s.key === 'GITHUB_TOKEN')).toEqual({
      key: 'GITHUB_TOKEN',
      set: true,
      required: true,
      source: 'env',
    })
  })

  describe('identity config in the console (FCW-10)', () => {
    it('persists a console identity override that wins over the yaml baseline (restart-applied)', async () => {
      const { supervisor } = await makeSupervisor(FULL_ENV) // baseline identity = hmac
      const res = await supervisor.applyStructural('identity', {
        mode: 'jwt',
        jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
        useridClaim: 'sub',
      })
      expect(res).toEqual({ ok: true, mode: 'restart' })

      const cfg = await supervisor.resolveEffective()
      expect(cfg.identity.mode).toBe('jwt')
      expect(cfg.identity.jwksUrl).toBe('https://issuer.example.com/.well-known/jwks.json')
      expect((await supervisor.restartStatus()).reasons).toContain('config:identity')
    })

    it('keeps the yaml/env identity when nothing is set in the console (precedence)', async () => {
      const { supervisor } = await makeSupervisor(FULL_ENV) // hmac yaml + IDENTITY_HMAC_SECRET env
      const cfg = await supervisor.resolveEffective()
      expect(cfg.identity.mode).toBe('hmac')
      expect(cfg.identity.secret).toBe('hmac') // from env, no console override
    })

    it('applies an identity secret set in the console (vault) over the env value', async () => {
      const { supervisor } = await makeSupervisor(FULL_ENV)
      await supervisor.setSecret('IDENTITY_HMAC_SECRET', 'rotated-secret')
      const cfg = await supervisor.resolveEffective()
      expect(cfg.identity.secret).toBe('rotated-secret') // vault wins over env
    })

    it('rejects an invalid identity (jwt without a jwks url) without persisting or flagging a restart', async () => {
      const { supervisor } = await makeSupervisor(FULL_ENV)
      const res = await supervisor.applyStructural('identity', { mode: 'jwt', useridClaim: 'sub' })
      expect(res.ok).toBe(false)
      expect((await supervisor.restartStatus()).pending).toBe(false)
      expect((await supervisor.resolveEffective()).identity.mode).toBe('hmac') // unchanged
    })
  })

  it('boots with unset secrets: catalog marks required-missing, config masked', async () => {
    const { supervisor } = await makeSupervisor({})
    const view = await supervisor.effective()
    const anthropic = view.secrets.find((s) => s.key === 'ANTHROPIC_API_KEY')
    expect(anthropic).toEqual({ key: 'ANTHROPIC_API_KEY', set: false, required: true, source: 'unset' })
    // optional secrets are offered even though unset and not required
    expect(view.secrets.find((s) => s.key === 'GITHUB_WEBHOOK_SECRET')).toEqual({
      key: 'GITHUB_WEBHOOK_SECRET',
      set: false,
      required: false,
      source: 'unset',
    })
  })
})
