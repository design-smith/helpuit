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
import { Holder, ConfigSupervisor } from '@helpuit/runtime-config'
import { ReadinessService } from './readiness.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const yaml = (identity = 'identity: { mode: hmac }') => `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
${identity}
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [basic]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m1 }, reasoning: { model: m2 }, vision: { model: m3 } }
budget: { perDay: 1000 }
`

// Every required secret EXCEPT GITHUB_TOKEN.
const ENV_MINUS_GITHUB: Env = {
  CHATWOOT_API_TOKEN: 'cw',
  IDENTITY_HMAC_SECRET: 'hmac',
  ANTHROPIC_API_KEY: 'sk',
  SANDBOX_BASIC_USER: 'u',
  SANDBOX_BASIC_PASS: 'p',
}

async function makeSupervisor(baselineYaml: string, env: Env) {
  handle = await createDb(':memory:')
  const db = handle.db
  const supervisor = new ConfigSupervisor({
    holder: new Holder({}),
    rebuild: () => ({}),
    initialConfig: resolveEffectiveConfig({ baselineYaml, env }).config as HelpuitConfig,
    baselineYaml,
    env,
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, new SecretBox(deriveKey('master'))),
    audit: new DrizzleConfigAudit(db),
    restartFlag: new DrizzleRestartFlag(db),
  })
  return supervisor
}

describe('ReadinessService', () => {
  it('reports not-ready with the missing required secret as a blocker, and optional gaps as warnings', async () => {
    const supervisor = await makeSupervisor(yaml(), ENV_MINUS_GITHUB)

    const readiness = await new ReadinessService(supervisor).evaluate()

    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.map((b) => b.key)).toContain('GITHUB_TOKEN')
    // optional secrets (offered but unset) are warnings, never blockers
    expect(readiness.warnings.map((w) => w.key)).toContain('GITHUB_WEBHOOK_SECRET')
    expect(readiness.blockers.map((b) => b.key)).not.toContain('GITHUB_WEBHOOK_SECRET')
  })

  it('becomes ready once the missing required secret is set in the vault', async () => {
    const supervisor = await makeSupervisor(yaml(), ENV_MINUS_GITHUB)
    expect((await new ReadinessService(supervisor).evaluate()).ready).toBe(false)

    // The operator sets the missing secret — a real vault write through the supervisor.
    await supervisor.setSecret('GITHUB_TOKEN', 'ghp-xyz')

    const readiness = await new ReadinessService(supervisor).evaluate()
    expect(readiness.ready).toBe(true)
    expect(readiness.blockers).toEqual([])
  })

  it('treats a non-secret structural gap (jwt without jwksUrl) as a blocker', async () => {
    // All required secrets present; identity=jwt with no jwksUrl leaves only a structural gap.
    const env: Env = { ...ENV_MINUS_GITHUB, GITHUB_TOKEN: 'gh' }
    const supervisor = await makeSupervisor(yaml('identity: { mode: jwt }'), env)

    const readiness = await new ReadinessService(supervisor).evaluate()

    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.some((b) => b.message.includes('jwksUrl'))).toBe(true)
  })
})
