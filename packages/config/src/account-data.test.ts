import { describe, it, expect } from 'vitest'
import { parseConfig, maskConfig } from './load.js'

const BASE = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 1 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { url: https://app.example.com/login }
models:
  provider: anthropic
  tiers:
    guidance: { model: m }
    reasoning: { model: m }
    vision: { model: m }
`
const ENV = {
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 'h',
  ANTHROPIC_API_KEY: 'an',
  SANDBOX_ADMIN_USER: 'a@x.com',
  SANDBOX_ADMIN_PASS: 'pw',
}

describe('accountData config', () => {
  it('defaults to source "none" with no creds (back-compat)', () => {
    const cfg = parseConfig(BASE, ENV)
    expect(cfg.accountData.source).toBe('none')
    expect(cfg.accountData.columns).toEqual([])
    expect(cfg.accountData.serviceKey).toBeUndefined()
  })

  it('binds SUPABASE_SERVICE_KEY for a supabase source and masks it', () => {
    const yaml = `${BASE}
accountData:
  source: supabase
  table: profiles
  userColumn: id
  columns: [plan, status]
  supabase: { projectRef: abcd, restUrl: https://abcd.supabase.co/rest/v1 }
`
    const cfg = parseConfig(yaml, { ...ENV, SUPABASE_SERVICE_KEY: 'svc-key' })
    expect(cfg.accountData.source).toBe('supabase')
    expect(cfg.accountData.table).toBe('profiles')
    expect(cfg.accountData.columns).toEqual(['plan', 'status'])
    expect(cfg.accountData.serviceKey).toBe('svc-key')
    expect(cfg.accountData.supabase?.restUrl).toBe('https://abcd.supabase.co/rest/v1')

    const masked = maskConfig(cfg) as { accountData: { serviceKey: string | null } }
    expect(masked.accountData.serviceKey).toBe('••••')
    expect(JSON.stringify(masked)).not.toContain('svc-key')
  })

  it('binds ACCOUNT_DB_URL for a postgres source', () => {
    const yaml = `${BASE}
accountData:
  source: postgres
  table: accounts
  userColumn: user_id
  columns: [tier]
`
    const cfg = parseConfig(yaml, { ...ENV, ACCOUNT_DB_URL: 'postgresql://u:p@h:5432/db' })
    expect(cfg.accountData.source).toBe('postgres')
    expect(cfg.accountData.dbUrl).toBe('postgresql://u:p@h:5432/db')
  })
})
