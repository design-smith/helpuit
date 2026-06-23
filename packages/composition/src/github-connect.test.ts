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
import { GitHubConnectionService } from './github-connect.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const conversionResponse = {
  id: 99,
  slug: 'helpuit-acme',
  html_url: 'https://github.com/apps/helpuit-acme',
  pem: '-----BEGIN RSA PRIVATE KEY-----\nKEY\n-----END RSA PRIVATE KEY-----',
  webhook_secret: 'whsec',
  client_id: 'Iv1.abc',
  client_secret: 'csec',
}

async function makeService(fetchImpl: unknown) {
  handle = await createDb(':memory:')
  const db = handle.db
  const vault = new DrizzleSecretVault(db, new SecretBox(deriveKey('master')))
  const store = new DrizzleConfigStore(db)
  const restartFlag = new DrizzleRestartFlag(db)
  const service = new GitHubConnectionService({
    configStore: store,
    vault,
    restartFlag,
    audit: new DrizzleConfigAudit(db),
    publicUrl: 'https://helpuit.example.com',
    appName: 'Helpuit',
    fetchImpl: fetchImpl as never,
  })
  return { service, vault, store, restartFlag }
}

describe('GitHubConnectionService', () => {
  it('returns a manifest pointed at this deployment', async () => {
    const { service } = await makeService(async () => ({ ok: true, json: async () => ({}) }))
    const { url, manifest } = service.manifest()
    expect(url).toContain('github.com/settings/apps/new')
    expect((manifest as Record<string, any>).redirect_url).toContain('https://helpuit.example.com')
  })

  it('completes the manifest exchange: stores App secrets in the vault, app id in config, flags restart', async () => {
    const { service, vault, store, restartFlag } = await makeService(async () => ({
      ok: true,
      json: async () => conversionResponse,
    }))

    const result = await service.completeManifest('code-123')
    expect(result.installUrl).toBe('https://github.com/apps/helpuit-acme/installations/new')

    // private key + webhook secret are sealed in the vault, never returned to the caller
    const { secrets } = await vault.openAll()
    expect(secrets.GITHUB_APP_PRIVATE_KEY).toContain('BEGIN RSA PRIVATE KEY')
    expect(secrets.GITHUB_WEBHOOK_SECRET).toBe('whsec')
    expect(JSON.stringify(result)).not.toContain('BEGIN RSA PRIVATE KEY')

    // non-secret app metadata lands in the github config section, switching auth to 'app'
    const github = (await store.get('github'))?.value as Record<string, unknown>
    expect(github).toMatchObject({ appId: '99', slug: 'helpuit-acme', auth: 'app' })

    expect((await restartFlag.get()).pending).toBe(true)
  })
})
