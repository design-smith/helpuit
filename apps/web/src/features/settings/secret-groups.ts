import type { SecretCatalogEntry } from '../../lib/api'

export interface SecretGroup {
  id: string
  title: string
  /** One line on what this group's secrets are for. */
  usedBy: string
  secrets: SecretCatalogEntry[]
}

/** Which feature-gated groups are active (so their secrets show). */
export interface SecretGroupingOptions {
  reproductionEnabled: boolean
  accountDataEnabled: boolean
}

type Gate = 'reproduction' | 'accountData'

interface GroupSpec {
  id: string
  title: string
  usedBy: string
  /** When set, the group (and its secrets) is hidden unless that feature is enabled. */
  gate?: Gate
  match(key: string): boolean
}

const LLM_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_API_KEY',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
])

// Ordered: required-to-work features first, optional features next, ops last.
const SPECS: GroupSpec[] = [
  { id: 'github', title: 'GitHub', usedBy: 'Code grounding, static investigation, and filing issues.', match: (k) => k.startsWith('GITHUB_') },
  { id: 'chatwoot', title: 'Chatwoot', usedBy: 'Reading and replying to customer conversations.', match: (k) => k.startsWith('CHATWOOT_') },
  { id: 'llm', title: 'LLM provider', usedBy: "The agent's reasoning and replies.", match: (k) => LLM_KEYS.has(k) },
  { id: 'identity', title: 'Customer identity', usedBy: 'Verifying who a customer is before reading their data.', match: (k) => k.startsWith('IDENTITY_') },
  { id: 'reproduction', title: 'Reproduction sandboxes', usedBy: 'Driving your app in a sandbox to reproduce bugs.', gate: 'reproduction', match: (k) => k.startsWith('SANDBOX_') },
  { id: 'accountData', title: 'Database', usedBy: 'Reading customer account state for L2 investigation.', gate: 'accountData', match: (k) => k.startsWith('QUERY_ROUTES_') },
  { id: 'operations', title: 'Operations', usedBy: 'Admin login, encryption at rest, and alerting.', match: (k) => k.startsWith('HELPUIT_') },
]

const OTHER: Omit<GroupSpec, 'match'> = { id: 'other', title: 'Other', usedBy: 'Additional configured secrets.' }

/**
 * Group the secret catalog by the feature that uses each secret (FCW-17), each
 * with a "used by" line. Feature-gated groups (reproduction sandboxes,
 * account-data query routes) are hidden entirely unless that feature is enabled —
 * so a fork isn't nagged about SANDBOX_* creds it doesn't need. Unknown keys fall
 * into an "Other" group. Order is preserved (required features first, ops last).
 */
export function groupSecrets(secrets: SecretCatalogEntry[], opts: SecretGroupingOptions): SecretGroup[] {
  const enabled: Record<Gate, boolean> = {
    reproduction: opts.reproductionEnabled,
    accountData: opts.accountDataEnabled,
  }
  const buckets = new Map<string, SecretCatalogEntry[]>()
  const add = (id: string, entry: SecretCatalogEntry): void => {
    const list = buckets.get(id) ?? []
    list.push(entry)
    buckets.set(id, list)
  }

  for (const secret of secrets) {
    const spec = SPECS.find((s) => s.match(secret.key))
    if (spec === undefined) {
      add(OTHER.id, secret)
      continue
    }
    if (spec.gate !== undefined && !enabled[spec.gate]) continue // feature off → hidden
    add(spec.id, secret)
  }

  const groups: SecretGroup[] = []
  for (const spec of [...SPECS, OTHER]) {
    const entries = buckets.get(spec.id)
    if (entries !== undefined && entries.length > 0) {
      groups.push({ id: spec.id, title: spec.title, usedBy: spec.usedBy, secrets: entries })
    }
  }
  return groups
}
