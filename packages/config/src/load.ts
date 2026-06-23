import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import {
  StructuredConfig,
  zodIssues,
  type Provider,
  type StructuredConfig as Structured,
} from './schema.js'

export type Env = Record<string, string | undefined>

/** Raised when configuration is invalid. Carries every problem found, not just the first. */
export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid Helpuit configuration:\n  - ${issues.join('\n  - ')}`)
    this.name = 'ConfigError'
  }
}

export interface SandboxAccount {
  user: string
  pass: string
}

export interface BedrockKey {
  region: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface OpenAICompatibleKey {
  baseUrl: string
  apiKey?: string
}

export interface ProviderKeys {
  anthropic?: string
  openai?: string
  deepseek?: string
  bedrock?: BedrockKey
  openaiCompatible?: OpenAICompatibleKey
}

/** Fully-resolved configuration: structural YAML + secrets/runtime from env. */
export interface HelpuitConfig {
  runtime: {
    nodeEnv: string
    port: number
    publicUrl?: string
    databaseUrl?: string
  }
  chatwoot: Structured['chatwoot'] & { apiToken: string }
  github: Structured['github'] & {
    token: string
    webhookSecret?: string
    apiBaseUrl?: string
    /** GitHub App private key (PEM), when auth = 'app'. Sourced from the secret vault. */
    appPrivateKey?: string
  }
  identity: Structured['identity'] & { secret?: string; verifyToken?: string }
  queryRoutes?: NonNullable<Structured['queryRoutes']> & { token: string }
  reproduction: Structured['reproduction'] & { sandboxAccounts: Record<string, SandboxAccount> }
  features: Structured['features']
  docs: Structured['docs']
  models: Structured['models'] & { providerKeys: ProviderKeys }
  policy: Structured['policy']
  budget: Structured['budget']
  retention: Structured['retention']
  alerts: Structured['alerts']
  /** Data-protection + ops secrets (env-only). */
  security: { encryptionKey?: string; adminToken?: string; alertWebhookUrl?: string }
}

function intEnv(value: string | undefined, fallback: number, key: string, issues: string[]): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n)) {
    issues.push(`${key} must be an integer (got "${value}")`)
    return fallback
  }
  return n
}

function boolEnv(value: string | undefined, key: string, issues: string[]): boolean | undefined {
  if (value === undefined || value === '') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  issues.push(`${key} must be "true" or "false" (got "${value}")`)
  return undefined
}

function resolveProviderKeys(
  providers: Set<Provider>,
  env: Env,
  requireSecret: (key: string) => string,
): ProviderKeys {
  const keys: ProviderKeys = {}
  for (const provider of providers) {
    switch (provider) {
      case 'anthropic':
        keys.anthropic = requireSecret('ANTHROPIC_API_KEY')
        break
      case 'openai':
        keys.openai = requireSecret('OPENAI_API_KEY')
        break
      case 'deepseek':
        keys.deepseek = requireSecret('DEEPSEEK_API_KEY')
        break
      case 'bedrock': {
        const region = requireSecret('AWS_REGION')
        keys.bedrock = {
          region,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }
        break
      }
      case 'openai-compatible': {
        const baseUrl = requireSecret('OPENAI_COMPATIBLE_BASE_URL')
        keys.openaiCompatible = { baseUrl, apiKey: env.OPENAI_COMPATIBLE_API_KEY }
        break
      }
    }
  }
  return keys
}

export interface BindResult {
  config: HelpuitConfig
  /** Required secrets (and structural-required URLs) that are unset. Empty in strict mode (it throws instead). */
  missingSecrets: string[]
}

/**
 * Validate a structural config object against the schema and bind secrets/runtime
 * from env. In STRICT mode a missing required secret throws `ConfigError`; in
 * LENIENT mode it is recorded in `missingSecrets` and substituted with an empty
 * placeholder so the app still boots (the operator fills it in via the console).
 * Malformed structural config (Zod type errors) always throws — that's a config
 * file mistake, not an operator-fixable runtime gap.
 */
function bindConfig(raw: unknown, env: Env, opts: { lenient: boolean }): BindResult {
  const parsed = StructuredConfig.safeParse(raw ?? {})
  if (!parsed.success) throw new ConfigError(zodIssues(parsed.error))
  const cfg = parsed.data

  const issues: string[] = []
  const missingSecrets: string[] = []

  // A required value sourced from env. Missing → throw (strict) or record (lenient).
  const requireSecret = (key: string): string => {
    const v = env[key]
    if (v === undefined || v === '') {
      if (opts.lenient) missingSecrets.push(key)
      else issues.push(`Missing required env var ${key}`)
      return ''
    }
    return v
  }
  // A structurally-required value (not a secret). Missing → throw (strict) or record (lenient).
  const requireStructural = (present: boolean, label: string): void => {
    if (present) return
    if (opts.lenient) missingSecrets.push(label)
    else issues.push(label)
  }

  const runtime = {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: intEnv(env.PORT, 3000, 'PORT', issues),
    publicUrl: env.HELPUIT_PUBLIC_URL,
    databaseUrl: env.DATABASE_URL,
  }

  const chatwootToken = requireSecret('CHATWOOT_API_TOKEN')
  const githubToken = requireSecret('GITHUB_TOKEN')

  let identitySecret: string | undefined
  let verifyToken: string | undefined
  if (cfg.identity.mode === 'hmac') {
    identitySecret = requireSecret('IDENTITY_HMAC_SECRET')
  } else if (cfg.identity.mode === 'jwt') {
    requireStructural(cfg.identity.jwksUrl !== undefined, 'identity.jwksUrl is required when identity.mode = jwt')
  } else {
    requireStructural(cfg.identity.verifyUrl !== undefined, 'identity.verifyUrl is required when identity.mode = endpoint')
    verifyToken = requireSecret('IDENTITY_VERIFY_TOKEN')
  }

  let queryRoutes: HelpuitConfig['queryRoutes']
  if (cfg.queryRoutes !== undefined) {
    queryRoutes = { ...cfg.queryRoutes, token: requireSecret('QUERY_ROUTES_TOKEN') }
  }

  const sandboxAccounts: Record<string, SandboxAccount> = {}
  for (const role of cfg.reproduction.sandboxRoles) {
    const upper = role.toUpperCase()
    const user = requireSecret(`SANDBOX_${upper}_USER`)
    const pass = requireSecret(`SANDBOX_${upper}_PASS`)
    if (user && pass) sandboxAccounts[role] = { user, pass }
  }

  const providers = new Set<Provider>([cfg.models.provider])
  for (const tier of [cfg.models.tiers.guidance, cfg.models.tiers.reasoning, cfg.models.tiers.vision]) {
    if (tier.provider !== undefined) providers.add(tier.provider)
  }
  const providerKeys = resolveProviderKeys(providers, env, requireSecret)

  // Policy env overrides (env wins over YAML)
  const autopublish = env.HELPUIT_AUTOPUBLISH
  if (autopublish !== undefined) {
    if (autopublish === 'draft' || autopublish === 'auto') cfg.policy.autopublish = autopublish
    else issues.push('HELPUIT_AUTOPUBLISH must be "draft" or "auto"')
  }
  const resolution = env.HELPUIT_RESOLUTION_MODE
  if (resolution !== undefined) {
    if (resolution === 'manual' || resolution === 'auto') cfg.policy.resolutionMode = resolution
    else issues.push('HELPUIT_RESOLUTION_MODE must be "manual" or "auto"')
  }
  const allowAnon = boolEnv(env.HELPUIT_ALLOW_ANONYMOUS, 'HELPUIT_ALLOW_ANONYMOUS', issues)
  if (allowAnon !== undefined) cfg.policy.allowAnonymous = allowAnon
  const playwright = boolEnv(env.HELPUIT_PLAYWRIGHT_ENABLED, 'HELPUIT_PLAYWRIGHT_ENABLED', issues)
  if (playwright !== undefined) cfg.policy.playwrightEnabled = playwright

  cfg.retention.investigationDays = intEnv(
    env.HELPUIT_RETENTION_DAYS,
    cfg.retention.investigationDays,
    'HELPUIT_RETENTION_DAYS',
    issues,
  )

  if (issues.length > 0) throw new ConfigError(issues)

  const config: HelpuitConfig = {
    runtime,
    chatwoot: { ...cfg.chatwoot, apiToken: chatwootToken },
    github: {
      ...cfg.github,
      token: githubToken,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      apiBaseUrl: env.GITHUB_API_URL,
      appPrivateKey: env.GITHUB_APP_PRIVATE_KEY,
    },
    identity: { ...cfg.identity, secret: identitySecret, verifyToken },
    queryRoutes,
    reproduction: { ...cfg.reproduction, sandboxAccounts },
    features: cfg.features,
    docs: cfg.docs,
    models: { ...cfg.models, providerKeys },
    policy: cfg.policy,
    budget: cfg.budget,
    retention: cfg.retention,
    alerts: cfg.alerts,
    security: {
      encryptionKey: env.HELPUIT_ENCRYPTION_KEY,
      adminToken: env.HELPUIT_ADMIN_TOKEN,
      alertWebhookUrl: env.HELPUIT_ALERT_WEBHOOK_URL,
    },
  }
  return { config, missingSecrets }
}

function parseYamlRaw(yamlText: string): unknown {
  try {
    return parseYaml(yamlText)
  } catch (error) {
    throw new ConfigError([`helpuit.config.yaml is not valid YAML: ${(error as Error).message}`])
  }
}

/**
 * Parse + validate a Helpuit configuration from raw YAML text and an environment
 * map (STRICT: throws `ConfigError` listing every problem). Structural config
 * comes from YAML; secrets/runtime/overrides come from env.
 */
export function parseConfig(yamlText: string, env: Env): HelpuitConfig {
  return bindConfig(parseYamlRaw(yamlText), env, { lenient: false }).config
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep-merge `override` onto `base` (override wins; arrays replaced wholesale). */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v
  }
  return out
}

export interface EffectiveConfigInput {
  /** The file/env baseline config text. */
  baselineYaml: string
  env: Env
  /** Persisted structural overrides, keyed by top-level section (policy/budget/…). */
  structural?: Record<string, unknown>
  /** Persisted secrets, keyed by ENV VAR NAME (overlaid over `env`; DB wins). */
  secrets?: Record<string, string>
}

export interface EffectiveConfig {
  config: HelpuitConfig
  missingSecrets: string[]
}

/**
 * Resolve the EFFECTIVE config: file/env baseline → DB structural overrides → DB
 * secrets, validated leniently so the app boots even with unset secrets (they're
 * reported in `missingSecrets` for the console to surface). An empty store yields
 * exactly the baseline behavior.
 */
export function resolveEffectiveConfig(input: EffectiveConfigInput): EffectiveConfig {
  const raw = parseYamlRaw(input.baselineYaml)
  const merged = deepMerge(raw ?? {}, input.structural ?? {})
  const mergedEnv: Env = { ...input.env, ...(input.secrets ?? {}) }
  return bindConfig(merged, mergedEnv, { lenient: true })
}

const MASK = '••••'

/** A config with all secret-bearing fields masked — safe to return to the UI. */
export function maskConfig(config: HelpuitConfig): Record<string, unknown> {
  const mask = (v: string | undefined | null): string | null => (v !== undefined && v !== null && v !== '' ? MASK : null)
  return {
    runtime: config.runtime,
    chatwoot: { ...config.chatwoot, apiToken: mask(config.chatwoot.apiToken) },
    github: {
      ...config.github,
      token: mask(config.github.token),
      webhookSecret: mask(config.github.webhookSecret),
      appPrivateKey: mask(config.github.appPrivateKey),
    },
    identity: { ...config.identity, secret: mask(config.identity.secret), verifyToken: mask(config.identity.verifyToken) },
    queryRoutes:
      config.queryRoutes !== undefined ? { ...config.queryRoutes, token: mask(config.queryRoutes.token) } : undefined,
    reproduction: {
      ...config.reproduction,
      sandboxAccounts: Object.fromEntries(
        Object.entries(config.reproduction.sandboxAccounts).map(([role, acct]) => [
          role,
          { user: acct.user, pass: mask(acct.pass) },
        ]),
      ),
    },
    features: config.features,
    docs: config.docs,
    models: {
      provider: config.models.provider,
      tiers: config.models.tiers,
      providerKeys: {
        anthropic: mask(config.models.providerKeys.anthropic),
        openai: mask(config.models.providerKeys.openai),
        deepseek: mask(config.models.providerKeys.deepseek),
        bedrock:
          config.models.providerKeys.bedrock !== undefined
            ? {
                region: config.models.providerKeys.bedrock.region,
                accessKeyId: mask(config.models.providerKeys.bedrock.accessKeyId),
                secretAccessKey: mask(config.models.providerKeys.bedrock.secretAccessKey),
              }
            : undefined,
        openaiCompatible:
          config.models.providerKeys.openaiCompatible !== undefined
            ? {
                baseUrl: config.models.providerKeys.openaiCompatible.baseUrl,
                apiKey: mask(config.models.providerKeys.openaiCompatible.apiKey),
              }
            : undefined,
      },
    },
    policy: config.policy,
    budget: config.budget,
    retention: config.retention,
    alerts: config.alerts,
    security: {
      encryptionKey: mask(config.security.encryptionKey),
      adminToken: mask(config.security.adminToken),
      alertWebhookUrl: mask(config.security.alertWebhookUrl),
    },
  }
}

export interface LoadConfigOptions {
  path?: string
  env?: Env
}

/** Read helpuit.config.yaml from disk and parse it against the environment (STRICT). */
export function loadConfig(options: LoadConfigOptions = {}): HelpuitConfig {
  const path = options.path ?? 'helpuit.config.yaml'
  const env = options.env ?? process.env
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new ConfigError([`Could not read config file at "${path}": ${(error as Error).message}`])
  }
  return parseConfig(text, env)
}

/** Read the baseline config file text (for `resolveEffectiveConfig`). Empty string if absent. */
export function readBaselineYaml(path = 'helpuit.config.yaml'): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
