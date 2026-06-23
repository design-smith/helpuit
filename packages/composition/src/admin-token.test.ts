import { describe, it, expect, afterEach } from 'vitest'
import { createDb, DrizzleSecretVault, type DbHandle } from '@helpuit/db'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import { resolveAdminToken } from './admin-token.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

async function vault() {
  handle = await createDb(':memory:')
  return new DrizzleSecretVault(handle.db, new SecretBox(deriveKey('master')))
}

describe('resolveAdminToken', () => {
  it('generates and persists a token when env and vault are empty', async () => {
    const v = await vault()
    const result = await resolveAdminToken({ vault: v })

    expect(result.generated).toBe(true)
    expect(result.source).toBe('generated')
    expect(result.token.length).toBeGreaterThanOrEqual(24)
    // really persisted (no mocks): the encrypted vault round-trips the same value
    expect((await v.openAll()).secrets.HELPUIT_ADMIN_TOKEN).toBe(result.token)
  })

  it('reuses the persisted token on the next boot (stable across restarts)', async () => {
    const v = await vault()
    const first = await resolveAdminToken({ vault: v })
    // simulate a restart: a fresh resolve against the same (real) vault
    const second = await resolveAdminToken({ vault: v })

    expect(second.token).toBe(first.token)
    expect(second.generated).toBe(false)
    expect(second.source).toBe('vault')
  })

  it('honors an env-provided token and never writes the vault', async () => {
    const v = await vault()
    const result = await resolveAdminToken({ vault: v, envToken: 'preset-admin-token' })

    expect(result).toEqual({ token: 'preset-admin-token', source: 'env', generated: false })
    expect((await v.openAll()).secrets).toEqual({}) // env mode persists nothing
  })
})
