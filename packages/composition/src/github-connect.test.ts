import { describe, it, expect, afterEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
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

  it('reuses an existing app: derives the install URL from the stored slug (never recreates)', async () => {
    const { service, store } = await makeService(async () => ({ ok: true, json: async () => ({}) }))
    expect(await service.installUrlForExistingApp()).toBeUndefined() // nothing connected yet
    await store.put('github', { slug: 'helpuit-acme', appId: '99', auth: 'app' })
    expect(await service.installUrlForExistingApp()).toBe('https://github.com/apps/helpuit-acme/installations/new')
  })

  it('connects an externally-created app: seals the key, stores app id + installation, flags restart', async () => {
    const { service, vault, store, restartFlag } = await makeService(async () => ({ ok: true, json: async () => ({}) }))
    await service.connectExistingApp({ appId: '123', privateKey: 'PEM-DATA', installationId: 42, slug: 'my-app' })

    expect((await vault.openAll()).secrets.GITHUB_APP_PRIVATE_KEY).toBe('PEM-DATA')
    const github = (await store.get('github'))?.value as Record<string, unknown>
    expect(github).toMatchObject({ appId: '123', installationId: 42, slug: 'my-app', auth: 'app' })
    expect((await restartFlag.get()).pending).toBe(true)
  })

  it('lists the installation repositories for the repo picker', async () => {
    const { privateKey: pem } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    const fetchImpl = async (url: string) => {
      if (url.includes('/access_tokens')) {
        return { ok: true, json: async () => ({ token: 'inst-tok', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) }
      }
      if (url.includes('/installation/repositories')) {
        return {
          ok: true,
          json: async () => ({
            repositories: [
              { name: 'product', owner: { login: 'acme' } },
              { name: 'docs', owner: { login: 'acme' } },
            ],
          }),
        }
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => 'nope' }
    }
    const { service, store, vault } = await makeService(fetchImpl)
    await store.put('github', { appId: '99', installationId: 7, auth: 'app' })
    await vault.set('GITHUB_APP_PRIVATE_KEY', pem)

    expect(await service.listRepos()).toEqual([
      { owner: 'acme', repo: 'product', fullName: 'acme/product' },
      { owner: 'acme', repo: 'docs', fullName: 'acme/docs' },
    ])
  })

  it('records the operator-picked repo and flags restart', async () => {
    const { service, store, restartFlag } = await makeService(async () => ({ ok: true, json: async () => ({}) }))
    await store.put('github', { appId: '99', auth: 'app' })
    await service.selectRepo('acme', 'product')

    const github = (await store.get('github'))?.value as Record<string, unknown>
    expect(github).toMatchObject({ owner: 'acme', repo: 'product', auth: 'app' })
    expect((await restartFlag.get()).pending).toBe(true)
  })
})
