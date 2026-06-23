import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleConfigStore } from './config-store-repository.js'
import { DrizzleSecretVault } from './secret-vault-repository.js'
import { DrizzleRestartFlag } from './restart-flag-repository.js'
import { SecretBox, deriveKey } from '@helpuit/crypto'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('config + secret stores', () => {
  it('upserts structural overrides and reads them back as a section map', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleConfigStore(handle.db, () => 1)
    const first = await store.put('policy', { allowAnonymous: true })
    expect(first.version).toBe(1)
    const second = await store.put('policy', { allowAnonymous: false })
    expect(second.version).toBe(2)
    await store.put('budget', { perDay: 99 })

    const all = await store.getAll()
    expect(all).toEqual({ policy: { allowAnonymous: false }, budget: { perDay: 99 } })
  })

  it('seals secrets, masks presence, and decrypts only via openAll', async () => {
    handle = await createDb(':memory:')
    const box = new SecretBox(deriveKey('master-key'))
    const vault = new DrizzleSecretVault(handle.db, box, () => 5)
    await vault.set('ANTHROPIC_API_KEY', 'sk-secret-123')

    const presence = await vault.presence()
    expect(presence).toEqual([{ key: 'ANTHROPIC_API_KEY', isSet: true, updatedAt: 5 }])
    // presence carries no value or length
    expect(JSON.stringify(presence)).not.toContain('sk-secret')

    const { secrets, unreadable } = await vault.openAll()
    expect(secrets.ANTHROPIC_API_KEY).toBe('sk-secret-123')
    expect(unreadable).toEqual([])
  })

  it('marks unreadable (wrong-key) secrets without throwing, so boot survives', async () => {
    handle = await createDb(':memory:')
    await new DrizzleSecretVault(handle.db, new SecretBox(deriveKey('old-key'))).set('K', 'v')
    // a different key cannot open the sealed value
    const { secrets, unreadable } = await new DrizzleSecretVault(
      handle.db,
      new SecretBox(deriveKey('new-key')),
    ).openAll()
    expect(secrets).toEqual({})
    expect(unreadable).toEqual(['K'])
  })

  it('tracks restart-required state with merged reasons', async () => {
    handle = await createDb(':memory:')
    const flag = new DrizzleRestartFlag(handle.db, () => 9)
    expect((await flag.get()).pending).toBe(false)
    await flag.add('secret:GITHUB_TOKEN')
    await flag.add('secret:GITHUB_TOKEN') // dedup
    await flag.add('secret:ANTHROPIC_API_KEY')
    const status = await flag.get()
    expect(status.pending).toBe(true)
    expect(status.reasons.sort()).toEqual(['secret:ANTHROPIC_API_KEY', 'secret:GITHUB_TOKEN'])
    await flag.clear()
    expect((await flag.get()).pending).toBe(false)
  })
})
