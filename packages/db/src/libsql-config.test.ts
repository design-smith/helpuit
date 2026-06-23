import { describe, it, expect } from 'vitest'
import { libsqlClientConfig } from './client.js'

describe('libsqlClientConfig', () => {
  it('attaches the auth token for remote libsql/Turso urls', () => {
    expect(libsqlClientConfig('libsql://db.turso.io', 'tok')).toEqual({ url: 'libsql://db.turso.io', authToken: 'tok' })
    expect(libsqlClientConfig('https://db.turso.io', 'tok')).toEqual({ url: 'https://db.turso.io', authToken: 'tok' })
  })

  it('ignores the token for local file / in-memory dbs (no auth needed)', () => {
    expect(libsqlClientConfig(':memory:', 'tok')).toEqual({ url: ':memory:' })
    expect(libsqlClientConfig('file:./helpuit.sqlite', 'tok')).toEqual({ url: 'file:./helpuit.sqlite' })
    expect(libsqlClientConfig('./helpuit.sqlite', 'tok')).toEqual({ url: 'file:./helpuit.sqlite' })
  })

  it('omits authToken when none is provided', () => {
    expect(libsqlClientConfig('libsql://db.turso.io')).toEqual({ url: 'libsql://db.turso.io' })
    expect(libsqlClientConfig('libsql://db.turso.io', '')).toEqual({ url: 'libsql://db.turso.io' })
  })
})
