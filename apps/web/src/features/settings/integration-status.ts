import type { EffectiveConfigView } from '../../lib/api'

export type IntegrationId = 'github' | 'chatwoot' | 'identity' | 'llm'

export interface IntegrationStatus {
  id: IntegrationId
  label: string
  /** Credentials present → the integration CAN run (the Connect step is done). */
  connected: boolean
  /** The live enable-map flag — the on/off toggle state. */
  enabled: boolean
  /** A structural problem; when set on a connected integration the toggle is forced off + greyed. */
  issue?: string
  /** The connected account/owner/provider name (shown when connected). */
  account?: string
  /** What it's scoped to — GitHub: owner/repo; Chatwoot: account+inbox; LLM: model; Identity: id claim. */
  access?: string
}

/** The required secret that proves an LLM provider is configured. */
const LLM_KEY: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  bedrock: 'AWS_REGION',
  'openai-compatible': 'OPENAI_COMPATIBLE_BASE_URL',
}

/**
 * Derive each integration's card status from the effective-config view — no extra
 * network. "connected" = its required credential is present (vault or env);
 * "enabled" = the live integrations enable-map (default on); "issue" = a structural
 * gap that should grey out the toggle.
 */
export function integrationStatuses(view: EffectiveConfigView): IntegrationStatus[] {
  const cfg = view.config
  const isSet = (key: string): boolean => view.secrets.find((s) => s.key === key)?.set ?? false
  const issueOf = (prefix: string): string | undefined => view.structuralIssues.find((s) => s.startsWith(`${prefix}.`))
  const enabled = (id: IntegrationId): boolean => cfg.integrations?.[id] ?? true

  const mode = cfg.identity?.mode as string | undefined
  const identityConnected =
    mode === 'hmac'
      ? isSet('IDENTITY_HMAC_SECRET')
      : mode === 'endpoint'
        ? isSet('IDENTITY_VERIFY_TOKEN')
        : mode === 'jwt'
          ? issueOf('identity') === undefined
          : false

  const provider = cfg.models?.provider as string | undefined

  return [
    {
      id: 'github',
      label: 'GitHub',
      connected: isSet('GITHUB_TOKEN') || isSet('GITHUB_APP_PRIVATE_KEY'),
      enabled: enabled('github'),
      issue: issueOf('github'),
      account: cfg.github?.owner,
      access: cfg.github?.owner && cfg.github?.repo ? `${cfg.github.owner}/${cfg.github.repo}` : undefined,
    },
    {
      id: 'chatwoot',
      label: 'Chatwoot',
      connected: isSet('CHATWOOT_API_TOKEN'),
      enabled: enabled('chatwoot'),
      issue: issueOf('chatwoot'),
      account: cfg.chatwoot?.baseUrl,
      access:
        cfg.chatwoot?.accountId !== undefined
          ? `account #${cfg.chatwoot.accountId} · inbox #${cfg.chatwoot.inboxId}`
          : undefined,
    },
    {
      id: 'identity',
      label: 'Identity',
      connected: identityConnected,
      enabled: enabled('identity'),
      issue: issueOf('identity'),
      account: mode,
      access: cfg.identity?.useridClaim ? `claim: ${cfg.identity.useridClaim}` : undefined,
    },
    {
      id: 'llm',
      label: 'LLM provider',
      connected: provider !== undefined ? isSet(LLM_KEY[provider] ?? '') : false,
      enabled: enabled('llm'),
      issue: issueOf('models'),
      account: provider,
      access: cfg.models?.tiers?.guidance?.model,
    },
  ]
}
