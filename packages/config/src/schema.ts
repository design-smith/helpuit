import { z } from 'zod'

/** Supported LLM providers (model-agnostic gateway). */
export const Provider = z.enum(['anthropic', 'openai', 'bedrock', 'deepseek', 'openai-compatible'])
export type Provider = z.infer<typeof Provider>

const Tier = z.object({
  /** Optional per-tier provider override; falls back to models.provider. */
  provider: Provider.optional(),
  model: z.string().min(1),
})

export const ModelsConfig = z.object({
  provider: Provider,
  tiers: z.object({ guidance: Tier, reasoning: Tier, vision: Tier }),
})

const Chatwoot = z.object({
  baseUrl: z.string().url(),
  accountId: z.number().int().positive(),
  inboxId: z.number().int().positive(),
})

const GitHub = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  productionBranch: z.string().min(1).default('main'),
  auth: z.enum(['pat', 'app']).default('pat'),
  /** GitHub App connection (auth = 'app') — populated by the console's Connect flow. */
  appId: z.string().optional(),
  slug: z.string().optional(),
  installationId: z.number().int().optional(),
})

const Identity = z.object({
  mode: z.enum(['hmac', 'jwt', 'endpoint']),
  useridClaim: z.string().min(1).default('sub'),
  /** Required (here or via env) when mode = jwt. */
  jwksUrl: z.string().url().optional(),
  /** Required (here or via env) when mode = endpoint. */
  verifyUrl: z.string().url().optional(),
})

const QueryRoute = z.object({
  name: z.string().min(1),
  method: z.enum(['GET', 'POST']).default('GET'),
  path: z.string().min(1),
  /** Identity field bound server-side (never from chat), e.g. "userId". */
  param: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
})

const QueryRoutes = z.object({
  baseUrl: z.string().url(),
  routes: z.array(QueryRoute).default([]),
})

/**
 * L2 account-data source. `supabase`/`postgres` read a single table directly
 * (column-allowlisted + scoped to the verified user's row, no raw SQL); creds are
 * secrets (SUPABASE_SERVICE_KEY / ACCOUNT_DB_URL). `queryRoutes` is the legacy
 * customer-deployed HTTP endpoint model. `none` disables account investigation.
 */
export const AccountData = z
  .object({
    source: z.enum(['none', 'supabase', 'postgres', 'queryRoutes']).default('none'),
    /** Table read for direct sources (supabase/postgres). */
    table: z.string().min(1).optional(),
    /** Column matched against the verified user id (e.g. "id"). */
    userColumn: z.string().min(1).optional(),
    /** Allowlist of readable columns (direct sources). */
    columns: z.array(z.string().min(1)).default([]),
    /** Connected Supabase project (set by the OAuth connect flow). */
    supabase: z.object({ projectRef: z.string().min(1), restUrl: z.string().url() }).optional(),
  })
  .default({})
export type AccountData = z.infer<typeof AccountData>

const Login = z.object({
  mode: z.enum(['form', 'api']).default('form'),
  url: z.string().url(),
  userSelector: z.string().optional(),
  passSelector: z.string().optional(),
  submitSelector: z.string().optional(),
})

const Reproduction = z.object({
  targetUrl: z.string().url(),
  environment: z.string().min(1).default('production'),
  containerImage: z.string().min(1).default('helpuit/repro:latest'),
  sandboxRoles: z.array(z.string().min(1)).min(1),
  login: Login,
})

const Feature = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  routes: z.array(z.string()).default([]),
  components: z.array(z.string()).default([]),
  endpoints: z.array(z.string()).default([]),
  docsLinks: z.array(z.string()).default([]),
  keywords: z.array(z.string()).optional(),
  sandboxRole: z.string().optional(),
  irreversible: z.boolean().optional(),
})

const Docs = z
  .object({
    // Repo paths/globs (at the production ref) whose markdown is ingested to ground
    // L1 guidance — e.g. "README.md" or a recursive "docs" markdown glob. Empty = none.
    repoPaths: z.array(z.string().min(1)).default([]),
    /**
     * Public Dropbox app key for the client-side Chooser drop-in. Browser-exposed
     * (surfaced unmasked via effective config) — NOT a secret. Empty = Dropbox import off.
     */
    dropboxAppKey: z.string().min(1).optional(),
    /**
     * Public Google API (browser) key + OAuth client id for the client-side Picker.
     * Both are public client identifiers (referrer/origin-restricted), surfaced
     * unmasked to the browser — NOT secrets. Both required to enable Drive import.
     */
    googleApiKey: z.string().min(1).optional(),
    googleClientId: z.string().min(1).optional(),
    /**
     * Public Microsoft app (client) id for the client-side OneDrive/SharePoint File
     * Picker. A public client identifier (origin-restricted), surfaced unmasked to
     * the browser — NOT a secret. Empty = OneDrive/SharePoint import off.
     */
    microsoftClientId: z.string().min(1).optional(),
  })
  .default({})

export const Policy = z
  .object({
    autopublish: z.enum(['draft', 'auto']).default('draft'),
    resolutionMode: z.enum(['manual', 'auto']).default('manual'),
    allowAnonymous: z.boolean().default(false),
    playwrightEnabled: z.boolean().default(true),
  })
  .default({})

export const Budget = z
  .object({
    perInvestigation: z.number().int().positive().default(200_000),
    perDay: z.number().int().positive().default(5_000_000),
    perMonth: z.number().int().positive().default(100_000_000),
    repro: z
      .object({
        maxSteps: z.number().int().positive().default(25),
        maxRetries: z.number().int().nonnegative().default(2),
        timeoutMs: z.number().int().positive().default(120_000),
      })
      .default({}),
    rateLimit: z
      .object({
        max: z.number().int().positive().default(20),
        windowMs: z.number().int().positive().default(3_600_000),
      })
      .default({}),
  })
  .default({})

const Retention = z
  .object({
    /** Delete investigations + their evidence/audit/etc. older than this many days. 0 = keep forever. */
    investigationDays: z.number().int().nonnegative().default(90),
  })
  .default({})

export const Alerts = z
  .object({
    /** Warn when 24h spend / daily cap ≥ this (critical at ≥ 1.0). */
    budgetWarnRatio: z.number().positive().default(0.8),
    /** Alert when the reproduction failure rate ≥ this (over the min sample). */
    reproFailureRate: z.number().positive().default(0.7),
    reproFailureMinSample: z.number().int().positive().default(5),
    /** Alert when escalations in the last 24h ≥ this. */
    escalationSpike: z.number().int().positive().default(25),
  })
  .default({})

/**
 * Per-integration on/off switches (the console's connection toggles). Default ON,
 * so existing configs (without this section) keep every integration enabled. When
 * an integration is OFF, the orchestrator wires it as if it were never configured.
 */
export const Integrations = z
  .object({
    github: z.boolean().default(true),
    chatwoot: z.boolean().default(true),
    identity: z.boolean().default(true),
    llm: z.boolean().default(true),
  })
  .default({})
export type Integrations = z.infer<typeof Integrations>

/** The structural (non-secret) config loaded from helpuit.config.yaml. */
export const StructuredConfig = z.object({
  chatwoot: Chatwoot,
  github: GitHub,
  identity: Identity,
  queryRoutes: QueryRoutes.optional(),
  accountData: AccountData,
  reproduction: Reproduction,
  features: z.array(Feature).default([]),
  docs: Docs,
  models: ModelsConfig,
  policy: Policy,
  budget: Budget,
  retention: Retention,
  alerts: Alerts,
  integrations: Integrations,
})

export type StructuredConfig = z.infer<typeof StructuredConfig>

/** Flatten a ZodError into human-readable `path: message` lines. */
export function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || '(root)'
    return `${path}: ${issue.message}`
  })
}
