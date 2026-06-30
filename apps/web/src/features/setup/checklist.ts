import type { Readiness, ReadinessItem } from '../../lib/api'

export type SetupStatus = 'done' | 'todo' | 'optional'

export interface SetupItem {
  id: string
  title: string
  detail: string
  status: SetupStatus
  /** The page that fixes this item. */
  href: string
  /** Readiness blocker keys this item is responsible for (empty when done/optional). */
  keys: string[]
  /** Human messages for the unmet blockers under this item. */
  unmet: string[]
}

interface RequiredSpec {
  id: string
  title: string
  detail: string
  href: string
  /** True when a readiness blocker belongs to this setup area. */
  claims(blocker: ReadinessItem): boolean
}

/** Any provider's credential keys — one configured provider clears the LLM rung. */
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

// The headline required rungs, in setup order. Structural blockers carry key
// "config" with a dotted-path message (e.g. "identity.jwksUrl …"), so areas also
// claim by message prefix.
const REQUIRED: RequiredSpec[] = [
  {
    id: 'github',
    title: 'Connect GitHub',
    detail: 'Link the repository Helpuit grounds answers in and files issues to.',
    href: '/settings/connections',
    claims: (b) => b.key === 'GITHUB_TOKEN' || b.key.startsWith('GITHUB_APP') || b.message.startsWith('github.'),
  },
  {
    id: 'chatwoot',
    title: 'Connect Chatwoot',
    detail: 'Point Helpuit at your Chatwoot inbox so it can read and reply to conversations.',
    href: '/settings/connections',
    claims: (b) => b.key === 'CHATWOOT_API_TOKEN' || b.message.startsWith('chatwoot.'),
  },
  {
    id: 'llm',
    title: 'Choose an LLM provider + key',
    detail: 'Pick a provider and set its API key so the agent can reason and reply.',
    href: '/settings/configuration',
    claims: (b) => LLM_KEYS.has(b.key) || b.message.startsWith('models.'),
  },
  {
    id: 'identity',
    title: 'Verify customer identity',
    detail: 'Configure how Helpuit verifies who a customer is before reading their data.',
    href: '/settings/configuration',
    claims: (b) => b.key.startsWith('IDENTITY_') || b.message.startsWith('identity.'),
  },
]

const OPTIONAL: ReadonlyArray<Omit<SetupItem, 'status'>> = [
  {
    id: 'accountData',
    title: 'Connect account data',
    detail: 'Optional: add read-only query routes so the agent can investigate a customer’s account state.',
    href: '/settings/configuration',
    keys: [],
    unmet: [],
  },
  {
    id: 'docs',
    title: 'Add product docs',
    detail: 'Optional: paste docs or point at repo markdown to ground L1 answers in your product.',
    href: '/settings/configuration',
    keys: [],
    unmet: [],
  },
]

const sig = (b: ReadinessItem): string => `${b.key}|${b.message}`

/**
 * Maps a {@link Readiness} into the ordered Setup checklist (FCW-08): a rung per
 * required area (GitHub, Chatwoot, LLM, identity) that is `done` when nothing
 * blocks it and `todo` (with the unmet blockers + a link to its fix) otherwise,
 * plus a catch-all for any leftover required blocker so NOTHING is lost, then the
 * optional rungs (account data, docs). `done` everywhere ⇔ `readiness.ready`.
 */
export function buildSetupChecklist(readiness: Readiness): SetupItem[] {
  const claimed = new Set<string>()
  const items: SetupItem[] = REQUIRED.map((spec) => {
    const mine = readiness.blockers.filter(spec.claims)
    for (const b of mine) claimed.add(sig(b))
    return {
      id: spec.id,
      title: spec.title,
      detail: spec.detail,
      href: spec.href,
      status: mine.length === 0 ? 'done' : 'todo',
      keys: mine.map((b) => b.key),
      unmet: mine.map((b) => b.message),
    }
  })

  // Anything required but not claimed by a known area (e.g. SANDBOX_* creds).
  const leftover = readiness.blockers.filter((b) => !claimed.has(sig(b)))
  if (leftover.length > 0) {
    items.push({
      id: 'other',
      title: 'Finish required configuration',
      detail: 'Remaining required values to set before the agent is ready.',
      href: '/settings/secrets',
      status: 'todo',
      keys: leftover.map((b) => b.key),
      unmet: leftover.map((b) => b.message),
    })
  }

  return [...items, ...OPTIONAL.map((o) => ({ ...o, status: 'optional' as const }))]
}

/** The console home shows the checklist until the agent is ready, then the dashboard. */
export function selectHome(readiness: Readiness): 'dashboard' | 'checklist' {
  return readiness.ready ? 'dashboard' : 'checklist'
}
