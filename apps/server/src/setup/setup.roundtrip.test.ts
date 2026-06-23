import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveEffectiveConfig, readBaselineYaml, type EffectiveConfig } from '@helpuit/config'
import { runBootstrap } from './bootstrap.js'
import { parseEnvFile } from './env-file.js'
import { isWeakEncryptionKey } from './keys.js'

// A valid structural baseline a fresh clone ships as helpuit.config.example.yaml —
// connectors unset, so the only remaining gaps are the connector secrets.
const EXAMPLE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'helpuit-setup-'))
  writeFileSync(join(dir, 'helpuit.config.example.yaml'), EXAMPLE_YAML)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Re-read the persisted files exactly the way the booting server would. */
function reread(): EffectiveConfig {
  const baselineYaml = readBaselineYaml(join(dir, 'helpuit.config.yaml'))
  const envPath = join(dir, '.env')
  const env = parseEnvFile(existsSync(envPath) ? readFileSync(envPath, 'utf8') : '')
  return resolveEffectiveConfig({ baselineYaml, env })
}

describe('first-run bootstrap (real files, real config resolver)', () => {
  it('writes a strong key + admin token + bootstrap settings, leaving only connectors missing', async () => {
    const result = await runBootstrap({
      cwd: dir,
      answers: { publicUrl: 'https://h.example.com', databaseUrl: 'file:./helpuit.sqlite', nodeEnv: 'production' },
    })

    expect(result.generated.encryptionKey).toBe(true)
    expect(result.generated.adminToken).toBe(true)
    expect(result.configCreated).toBe(true)

    const eff = reread()
    expect(isWeakEncryptionKey(eff.config.security.encryptionKey)).toBe(false)
    expect(eff.config.security.adminToken).toBe(result.adminToken)
    expect(eff.config.runtime.publicUrl).toBe('https://h.example.com')
    expect(eff.config.runtime.nodeEnv).toBe('production')
    expect(eff.config.runtime.databaseUrl).toBe('file:./helpuit.sqlite')

    // The bootstrap keys are handled — they are NOT among the remaining gaps...
    expect(eff.missingSecrets).not.toContain('HELPUIT_ENCRYPTION_KEY')
    expect(eff.missingSecrets).not.toContain('HELPUIT_ADMIN_TOKEN')
    // ...what's left is exactly the connector secrets the console finishes.
    expect(eff.missingSecrets).toContain('CHATWOOT_API_TOKEN')
    expect(eff.missingSecrets).toContain('GITHUB_TOKEN')
    expect(eff.missingSecrets).toContain('ANTHROPIC_API_KEY')
    // The summary mirrors the console: every remaining gap here is an env-shaped secret.
    expect(result.missing.structural).toEqual([])
    expect(result.missing.secrets).toContain('CHATWOOT_API_TOKEN')
  })

  it('rejects a postgres DATABASE_URL up front with the SQLite/libsql guidance', async () => {
    await expect(runBootstrap({ cwd: dir, answers: { databaseUrl: 'postgres://x/y' } })).rejects.toThrow(
      /SQLite|libsql/i,
    )
  })

  it('is idempotent: never overwrites an existing strong key, preserves foreign keys, and backs up', async () => {
    await runBootstrap({ cwd: dir, answers: {} })
    const envPath = join(dir, '.env')
    // An operator hand-adds their own var after the first run.
    writeFileSync(envPath, readFileSync(envPath, 'utf8') + 'FOREIGN=keep-me\n')
    const keyBefore = parseEnvFile(readFileSync(envPath, 'utf8')).HELPUIT_ENCRYPTION_KEY

    const second = await runBootstrap({ cwd: dir, answers: {} })

    expect(second.generated.encryptionKey).toBe(false)
    const after = parseEnvFile(readFileSync(envPath, 'utf8'))
    expect(after.HELPUIT_ENCRYPTION_KEY).toBe(keyBefore)
    expect(after.FOREIGN).toBe('keep-me')
    expect(existsSync(envPath + '.bak')).toBe(true)
  })
})
