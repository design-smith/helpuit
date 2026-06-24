import { join } from 'node:path'
import { resolveEffectiveConfig, readBaselineYaml } from '@helpuit/config'
import { generateEncryptionKey, generateAdminToken, isWeakEncryptionKey } from './keys.js'
import { parseEnvFile, serializeEnv, applyEnvUpdates, type EnvMap } from './env-file.js'
import { readFileIfExists, writeEnvFileWithBackup, ensureConfigYaml } from './io.js'

/** The launch-critical answers the wizard collects. All optional — blank = leave alone. */
export interface BootstrapAnswers {
  /** Use the built-in Cloudflare tunnel for the public URL (persists HELPUIT_TUNNEL=1). Wins over publicUrl. */
  useTunnel?: boolean
  publicUrl?: string
  databaseUrl?: string
  databaseAuthToken?: string
  nodeEnv?: string
  port?: string
}

/** Injectable generators so a plan is deterministic in tests; defaults are real crypto. */
export interface Generators {
  encryptionKey: () => string
  adminToken: () => string
}

const REAL_GENERATORS: Generators = { encryptionKey: generateEncryptionKey, adminToken: generateAdminToken }

/** An env-var-shaped key (a secret), per the same rule the console's readiness uses. */
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/

export interface BootstrapPlan {
  /** Only the keys the wizard is setting/changing (for an in-place edit of an existing file). */
  updates: EnvMap
  /** The full effective env after applying updates (for writing a brand-new file). */
  env: EnvMap
  /** The resolved admin token (generated or the operator's existing one). */
  adminToken: string
  generated: { encryptionKey: boolean; adminToken: boolean }
  warnings: string[]
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === ''
}

/**
 * Decide what the bootstrap should write, given what's already in `.env`. PURE —
 * no fs, no prompts. The keystone rules live here: a weak/absent encryption key
 * is replaced with a strong one, a strong one is NEVER overwritten (rotating it
 * makes the vault unreadable), and an admin token is generated only if absent.
 */
export function planBootstrapEnv(
  existing: EnvMap,
  answers: BootstrapAnswers,
  generators: Generators = REAL_GENERATORS,
): BootstrapPlan {
  const updates: EnvMap = {}
  const warnings: string[] = []
  const generated = { encryptionKey: false, adminToken: false }

  // Encryption keystone — generate when weak, preserve when strong.
  if (isWeakEncryptionKey(existing.HELPUIT_ENCRYPTION_KEY)) {
    updates.HELPUIT_ENCRYPTION_KEY = generators.encryptionKey()
    generated.encryptionKey = true
  } else {
    warnings.push('Kept your existing HELPUIT_ENCRYPTION_KEY — rotating it would make the secret vault unreadable.')
  }

  // Admin token — generate only when absent so the console is reachable without log-scraping.
  let adminToken = existing.HELPUIT_ADMIN_TOKEN ?? ''
  if (blank(existing.HELPUIT_ADMIN_TOKEN)) {
    adminToken = generators.adminToken()
    updates.HELPUIT_ADMIN_TOKEN = adminToken
    generated.adminToken = true
  }

  // NODE_ENV — honor an answer, else default to development on a fresh file.
  if (!blank(answers.nodeEnv)) updates.NODE_ENV = answers.nodeEnv!.trim()
  else if (blank(existing.NODE_ENV)) updates.NODE_ENV = 'development'

  if (!blank(answers.port)) updates.PORT = answers.port!.trim()

  // Reachability: the built-in tunnel (persisted as HELPUIT_TUNNEL=1 so `pnpm start`
  // auto-tunnels, no flag) OR an explicit domain. The tunnel choice wins.
  if (answers.useTunnel) updates.HELPUIT_TUNNEL = '1'
  else if (!blank(answers.publicUrl)) updates.HELPUIT_PUBLIC_URL = answers.publicUrl!.trim()

  if (!blank(answers.databaseUrl)) {
    const url = answers.databaseUrl!.trim()
    if (url.startsWith('postgres')) {
      throw new Error(
        'Helpuit runs on SQLite/libsql, not Postgres (see docs/adr/0001-database-engine.md). ' +
          'Leave DATABASE_URL blank for the default local file (file:./helpuit.sqlite), set a SQLite ' +
          'path, or use a remote libsql/Turso url ("libsql://…") with an auth token.',
      )
    }
    updates.DATABASE_URL = url
  }
  if (!blank(answers.databaseAuthToken)) updates.DATABASE_AUTH_TOKEN = answers.databaseAuthToken!.trim()

  return { updates, env: { ...existing, ...updates }, adminToken, generated, warnings }
}

/** Split unmet config gaps into env-shaped secrets vs structural labels (mirrors the console). */
export function splitMissing(missing: string[]): { secrets: string[]; structural: string[] } {
  const secrets: string[] = []
  const structural: string[] = []
  for (const key of missing) (ENV_KEY.test(key) ? secrets : structural).push(key)
  return { secrets, structural }
}

export interface RunBootstrapOptions {
  /** Project root to read/write `.env` + `helpuit.config.yaml` in. */
  cwd: string
  answers: BootstrapAnswers
  generators?: Generators
  /** Where to seed `helpuit.config.yaml` from; defaults to `<cwd>/helpuit.config.example.yaml`. */
  examplePath?: string
}

export interface RunBootstrapResult {
  envPath: string
  generated: { encryptionKey: boolean; adminToken: boolean }
  adminToken: string
  backedUp: boolean
  configCreated: boolean
  warnings: string[]
  missing: { secrets: string[]; structural: string[] }
  publicUrl?: string
  /** The operator chose the built-in tunnel (HELPUIT_TUNNEL=1) for the public URL. */
  tunnelEnabled: boolean
  port: number
}

/**
 * Run the first-run bootstrap against real files: read any existing `.env`, plan
 * the keystone + bootstrap settings, persist (`.env` + a valid `helpuit.config.yaml`,
 * backing up the old `.env`), then RE-READ through the real config resolver to prove
 * it parses and to report what connectors remain for the console.
 */
export async function runBootstrap(options: RunBootstrapOptions): Promise<RunBootstrapResult> {
  const { cwd, answers, generators } = options
  const envPath = join(cwd, '.env')
  const configPath = join(cwd, 'helpuit.config.yaml')
  const examplePath = options.examplePath ?? join(cwd, 'helpuit.config.example.yaml')

  const existingText = readFileIfExists(envPath)
  const existing = parseEnvFile(existingText ?? '')

  const plan = planBootstrapEnv(existing, answers, generators)
  const newText = existingText !== undefined ? applyEnvUpdates(existingText, plan.updates) : serializeEnv(plan.env)

  const { backedUp } = writeEnvFileWithBackup(envPath, newText)
  const { created: configCreated } = ensureConfigYaml(configPath, examplePath)

  // `.env.run` is loaded AFTER `.env` by `pnpm start`, so it overrides — warn if a
  // leftover dev-only file would shadow a key we just set.
  const warnings = [...plan.warnings]
  const envRun = readFileIfExists(join(cwd, '.env.run'))
  if (envRun !== undefined) {
    const shadowed = Object.keys(plan.env).filter((k) => !blank(parseEnvFile(envRun)[k]))
    if (shadowed.length > 0) {
      warnings.push(`.env.run will override these keys when you run \`pnpm start\`: ${shadowed.join(', ')}`)
    }
  }

  // Prove the persisted files actually parse, and learn what's still missing.
  const baselineYaml = readBaselineYaml(configPath)
  const effective = resolveEffectiveConfig({ baselineYaml, env: parseEnvFile(newText) })

  return {
    envPath,
    generated: plan.generated,
    adminToken: plan.adminToken,
    backedUp,
    configCreated,
    warnings,
    missing: splitMissing(effective.missingSecrets),
    publicUrl: effective.config.runtime.publicUrl,
    tunnelEnabled: plan.env.HELPUIT_TUNNEL === '1',
    port: effective.config.runtime.port,
  }
}
