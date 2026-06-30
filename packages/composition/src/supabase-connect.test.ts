import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createDb,
  DrizzleConfigStore,
  DrizzleSecretVault,
  DrizzleConfigAudit,
  DrizzleRestartFlag,
  type DbHandle,
} from '@helpuit/db'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import {
  SupabaseConnection,
  SUPABASE_OAUTH_CLIENT_ID,
  SUPABASE_OAUTH_CLIENT_SECRET,
  SUPABASE_OAUTH_ACCESS_TOKEN,
  SUPABASE_SERVICE_KEY,
} from './supabase-connect.js'

let server: Server | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  server?.close()
  handle?.close()
})

/** A fake Supabase API (OAuth token + Management API). */
async function fakeSupabase(): Promise<string> {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (req.method === 'POST' && url === '/v1/oauth/token') {
      res.end(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1' }))
    } else if (req.method === 'GET' && url === '/v1/projects') {
      res.end(JSON.stringify([{ ref: 'abcd', name: 'My Project', organization_id: 'org-1', region: 'us-east-1' }]))
    } else if (req.method === 'GET' && url === '/v1/projects/abcd/api-keys') {
      res.end(JSON.stringify([{ name: 'anon', api_key: 'anon-key' }, { name: 'service_role', api_key: 'svc-key' }]))
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

async function build() {
  handle = await createDb(':memory:')
  const db = handle.db
  const vault = new DrizzleSecretVault(db, new SecretBox(deriveKey('master')))
  await vault.set(SUPABASE_OAUTH_CLIENT_ID, 'cid')
  await vault.set(SUPABASE_OAUTH_CLIENT_SECRET, 'csecret')
  const apiBaseUrl = await fakeSupabase()
  const svc = new SupabaseConnection({
    configStore: new DrizzleConfigStore(db),
    vault,
    restartFlag: new DrizzleRestartFlag(db),
    audit: new DrizzleConfigAudit(db),
    publicUrl: 'https://helpuit.example.com',
    apiBaseUrl,
  })
  return { svc, vault, db, configStore: new DrizzleConfigStore(db), restartFlag: new DrizzleRestartFlag(db) }
}

describe('SupabaseConnection', () => {
  it('builds an authorize URL with client_id, redirect_uri, and the state', async () => {
    const { svc } = await build()
    const url = new URL(await svc.authorizeUrl('state-123'))
    expect(url.pathname).toBe('/v1/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('https://helpuit.example.com/admin/connect/supabase/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('state-123')
  })

  it('exchanges the code for tokens and stores them in the vault', async () => {
    const { svc, vault } = await build()
    await svc.completeCallback('the-code')
    const { secrets } = await vault.openAll()
    expect(secrets[SUPABASE_OAUTH_ACCESS_TOKEN]).toBe('access-1')
  })

  it('lists projects and, on select, stores the service key + accountData config (restart-flagged)', async () => {
    const { svc, vault, configStore, restartFlag } = await build()
    await svc.completeCallback('the-code')

    const projects = await svc.listProjects()
    expect(projects).toEqual([{ ref: 'abcd', name: 'My Project', organizationId: 'org-1', region: 'us-east-1' }])

    const result = await svc.selectProject({ ref: 'abcd', table: 'profiles', userColumn: 'id', columns: ['plan', 'status'] })
    expect(result.ok).toBe(true)

    expect((await vault.openAll()).secrets[SUPABASE_SERVICE_KEY]).toBe('svc-key')
    const cfg = (await configStore.get('accountData'))?.value as {
      source: string
      table: string
      supabase: { projectRef: string; restUrl: string }
    }
    expect(cfg.source).toBe('supabase')
    expect(cfg.table).toBe('profiles')
    expect(cfg.supabase).toEqual({ projectRef: 'abcd', restUrl: 'https://abcd.supabase.co/rest/v1' })
    expect((await restartFlag.get()).pending).toBe(true)
  })

  it('refuses to build an authorize URL when the OAuth app is not configured', async () => {
    handle = await createDb(':memory:')
    const svc = new SupabaseConnection({
      configStore: new DrizzleConfigStore(handle.db),
      vault: new DrizzleSecretVault(handle.db, new SecretBox(deriveKey('master'))),
      restartFlag: new DrizzleRestartFlag(handle.db),
      audit: new DrizzleConfigAudit(handle.db),
      publicUrl: 'https://helpuit.example.com',
    })
    await expect(svc.authorizeUrl('s')).rejects.toThrow(/not configured/i)
  })
})
