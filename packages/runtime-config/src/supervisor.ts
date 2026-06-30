import {
  resolveEffectiveConfig,
  maskConfig,
  ConfigError,
  type HelpuitConfig,
  type Env,
} from '@helpuit/config'
import type {
  DrizzleConfigStore,
  DrizzleSecretVault,
  DrizzleConfigAudit,
  DrizzleRestartFlag,
  RestartStatus,
} from '@helpuit/db'
import { Holder } from './holder.js'
import { classifySection, LIVE_SECTIONS } from './classify.js'

/** Optional secrets the console offers even when unset (not required to boot). */
const OPTIONAL_SECRETS = [
  'GITHUB_WEBHOOK_SECRET',
  'HELPUIT_ALERT_WEBHOOK_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  // Operator-set Supabase OAuth app (for the one-click account-data connect).
  'SUPABASE_OAUTH_CLIENT_ID',
  'SUPABASE_OAUTH_CLIENT_SECRET',
]
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/

/** Where a secret's value currently comes from. */
export type SecretSource = 'vault' | 'env' | 'unset'

/** One secret as the console sees it — never the value. */
export interface SecretCatalogEntry {
  key: string
  set: boolean
  required: boolean
  /** 'vault' (set in the console, wins), 'env' (from .env/file), or 'unset'. */
  source: SecretSource
}

/** The full effective-config view returned to the console (secrets masked). */
export interface EffectiveView {
  config: Record<string, unknown>
  secrets: SecretCatalogEntry[]
  /** Non-secret structural gaps (e.g. "identity.jwksUrl is required …"). */
  structuralIssues: string[]
  restart: RestartStatus
  editableSections: string[]
}

export type ApplyResult =
  | { ok: true; mode: 'live' | 'restart' }
  | { ok: false; code: 'invalid' | 'unknown_section'; issues: string[] }
export type SecretResult = { ok: true; mode: 'restart' }

/** The mutation surface the admin API delegates to. */
export interface ConfigController {
  effective(): Promise<EffectiveView>
  applyStructural(section: string, value: unknown): Promise<ApplyResult>
  setSecret(key: string, value: string): Promise<SecretResult>
  deleteSecret(key: string): Promise<SecretResult>
  restartStatus(): Promise<RestartStatus>
  /**
   * Server-internal: the UNMASKED effective config, freshly resolved from
   * vault+structural+baseline (so a just-set secret is visible before restart).
   * For server-side use only (e.g. connector tests) — never serialized to clients.
   */
  resolveEffective(): Promise<HelpuitConfig>
}

export interface ConfigSupervisorDeps<T> {
  holder: Holder<T>
  /** Rebuild the live unit (orchestrator) from a resolved config — injected by main.ts. */
  rebuild: (config: HelpuitConfig) => T
  /** The effective config resolved at boot — the starting point for `currentConfig()`. */
  initialConfig: HelpuitConfig
  baselineYaml: string
  env: Env
  configStore: DrizzleConfigStore
  vault: DrizzleSecretVault
  audit: DrizzleConfigAudit
  restartFlag: DrizzleRestartFlag
}

/**
 * Runtime config supervisor (hybrid apply). Structural sections (policy, budget,
 * alerts, models) apply LIVE: validate → trial-rebuild → atomically swap the
 * holder → persist. Secrets apply on RESTART: sealed into the vault + a
 * restart-required flag. Nothing is persisted or swapped unless a trial build
 * succeeds, so the live orchestrator is never replaced by a broken one.
 */
export class ConfigSupervisor<T> implements ConfigController {
  /** The current live effective config — read by main-process consumers (alert engine, etc.). */
  private cached: HelpuitConfig

  constructor(private readonly deps: ConfigSupervisorDeps<T>) {
    this.cached = deps.initialConfig
  }

  /** The effective config currently in force (updated on each successful live apply). */
  currentConfig(): HelpuitConfig {
    return this.cached
  }

  /**
   * Server-internal: the unmasked effective config freshly resolved from the vault
   * + structural store + baseline — so a secret set in the console is visible to a
   * connector test before the restart that applies it. Never serialized to clients.
   */
  async resolveEffective(): Promise<HelpuitConfig> {
    return (await this.resolve()).config
  }

  private async resolve(structuralOverride?: { section: string; value: unknown }) {
    const structural = await this.deps.configStore.getAll()
    if (structuralOverride !== undefined) structural[structuralOverride.section] = structuralOverride.value
    const { secrets } = await this.deps.vault.openAll()
    return resolveEffectiveConfig({ baselineYaml: this.deps.baselineYaml, env: this.deps.env, structural, secrets })
  }

  async effective(): Promise<EffectiveView> {
    const { config, missingSecrets } = await this.resolve()
    const structural = await this.deps.configStore.getAll()

    // The FULL set of required secret keys = everything that would be missing if
    // nothing were provided. This is how an env-satisfied secret (e.g. GITHUB_TOKEN
    // from .env) still shows up so the operator can rotate it in the console.
    const requiredAll = resolveEffectiveConfig({
      baselineYaml: this.deps.baselineYaml,
      env: {},
      structural,
      secrets: {},
    }).missingSecrets.filter((s) => ENV_KEY.test(s))

    const structuralIssues = missingSecrets.filter((s) => !ENV_KEY.test(s))
    const vaultKeys = new Set((await this.deps.vault.presence()).map((p) => p.key))

    const catalogKeys = [...new Set([...requiredAll, ...OPTIONAL_SECRETS, ...vaultKeys])].sort()
    const secrets: SecretCatalogEntry[] = catalogKeys.map((key) => {
      const inVault = vaultKeys.has(key)
      const inEnv = (this.deps.env[key] ?? '') !== ''
      const source: SecretSource = inVault ? 'vault' : inEnv ? 'env' : 'unset'
      return { key, set: inVault || inEnv, required: requiredAll.includes(key), source }
    })

    return {
      config: maskConfig(config),
      secrets,
      structuralIssues,
      restart: await this.deps.restartFlag.get(),
      editableSections: [...LIVE_SECTIONS],
    }
  }

  async applyStructural(section: string, value: unknown): Promise<ApplyResult> {
    const cls = classifySection(section)
    if (cls === 'unknown') return { ok: false, code: 'unknown_section', issues: [`Unknown config section "${section}"`] }

    // Validate the merged effective config (authoritative gate) for BOTH classes —
    // a malformed section must never persist or flag a restart.
    let resolved
    try {
      resolved = await this.resolve({ section, value })
    } catch (error) {
      if (error instanceof ConfigError) return { ok: false, code: 'invalid', issues: error.issues }
      throw error
    }

    // Cross-field structural requirements (e.g. "identity.jwksUrl is required when
    // mode = jwt") are reported leniently so the app still BOOTS — but an operator
    // explicitly applying a section must not save one that's left incomplete.
    // Reject it here, loudly, instead of persisting a config that fails silently at
    // runtime after the restart.
    const sectionIssues = resolved.missingSecrets.filter((s) => !ENV_KEY.test(s) && s.startsWith(`${section}.`))
    if (sectionIssues.length > 0) return { ok: false, code: 'invalid', issues: sectionIssues }

    // Restart-class (github/chatwoot/identity/queryRoutes/reproduction/retention):
    // persist + flag a restart. It applies on next boot — no live swap, since the
    // bound clients/secrets capture these at build time.
    if (cls === 'restart') {
      await this.deps.configStore.put(section, value)
      await this.deps.restartFlag.add(`config:${section}`)
      await this.deps.audit.record('config.apply.restart', section)
      return { ok: true, mode: 'restart' }
    }

    // Live-class (policy/budget/alerts/models): trial-build, then atomically swap.
    let next: T
    try {
      next = this.deps.rebuild(resolved.config)
    } catch (error) {
      return { ok: false, code: 'invalid', issues: [error instanceof Error ? error.message : String(error)] }
    }
    await this.deps.configStore.put(section, value)
    this.deps.holder.swap(next)
    this.cached = resolved.config
    await this.deps.audit.record('config.apply', section)
    return { ok: true, mode: 'live' }
  }

  async setSecret(key: string, value: string): Promise<SecretResult> {
    await this.deps.vault.set(key, value)
    await this.deps.restartFlag.add(`secret:${key}`)
    await this.deps.audit.record('secret.set', key)
    return { ok: true, mode: 'restart' }
  }

  async deleteSecret(key: string): Promise<SecretResult> {
    await this.deps.vault.delete(key)
    await this.deps.restartFlag.add(`secret:${key}`)
    await this.deps.audit.record('secret.delete', key)
    return { ok: true, mode: 'restart' }
  }

  restartStatus(): Promise<RestartStatus> {
    return this.deps.restartFlag.get()
  }
}
