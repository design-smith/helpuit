import { describe, it, expect } from 'vitest'
import { parseEnvFile, mergeEnv, serializeEnv, applyEnvUpdates } from './env-file.js'

describe('parseEnvFile', () => {
  it('reads KEY=value lines and skips comments and blanks', () => {
    const text = ['# a comment', '', 'NODE_ENV=production', 'PORT=3000', '   # indented comment'].join('\n')
    expect(parseEnvFile(text)).toEqual({ NODE_ENV: 'production', PORT: '3000' })
  })

  it('strips surrounding quotes and keeps the inner value verbatim', () => {
    expect(parseEnvFile('TOKEN="a b#c"')).toEqual({ TOKEN: 'a b#c' })
    expect(parseEnvFile("K='v'")).toEqual({ K: 'v' })
  })

  it('keeps an empty value as an empty string', () => {
    expect(parseEnvFile('GITHUB_TOKEN=')).toEqual({ GITHUB_TOKEN: '' })
  })
})

describe('mergeEnv', () => {
  it('overwrites staged keys and preserves foreign keys', () => {
    const merged = mergeEnv({ A: '1', B: '2' }, { B: '9', C: '3' })
    expect(merged).toEqual({ A: '1', B: '9', C: '3' })
  })
})

describe('serializeEnv / parseEnvFile round-trip', () => {
  it('is idempotent for values containing spaces, # and empties', () => {
    const original = { A: '1', SPACED: 'has space', HASHED: 'a#b', EMPTY: '' }
    expect(parseEnvFile(serializeEnv(original))).toEqual(original)
  })
})

describe('applyEnvUpdates', () => {
  it('replaces an existing key in place, preserves comments + foreign keys, appends new keys', () => {
    const existing = ['# data protection', 'HELPUIT_ENCRYPTION_KEY=old', '', 'FOREIGN=keep-me'].join('\n')
    const updated = applyEnvUpdates(existing, { HELPUIT_ENCRYPTION_KEY: 'new', HELPUIT_ADMIN_TOKEN: 'tok' })
    const parsed = parseEnvFile(updated)
    expect(parsed.HELPUIT_ENCRYPTION_KEY).toBe('new')
    expect(parsed.FOREIGN).toBe('keep-me')
    expect(parsed.HELPUIT_ADMIN_TOKEN).toBe('tok')
    expect(updated).toContain('# data protection')
  })
})
