/** One required setup item for the bare job, and what it's for. */
export interface MinimumConfigItem {
  /** The env/secret key (also settable in the console). */
  env: string
  /** What connecting it enables. */
  purpose: string
}

/**
 * The minimum a fork must connect to do the bare job — answer a customer message
 * grounded in their product and file an engineering-grade issue. Everything else
 * (account data, docs, reproduction) is an optional rung on the capability ladder.
 * Each item here is verified to be genuinely required by the config resolver, so
 * the docs can't drift into listing things that aren't actually needed (FCW-21).
 */
export const MINIMUM_CONFIG: readonly MinimumConfigItem[] = [
  { env: 'CHATWOOT_API_TOKEN', purpose: 'Read and reply to Chatwoot conversations.' },
  { env: 'GITHUB_TOKEN', purpose: 'Ground answers in your repo and file issues (or connect a GitHub App instead).' },
  { env: 'ANTHROPIC_API_KEY', purpose: "Your LLM provider's key — powers the agent's reasoning (swap for your chosen provider's key)." },
  { env: 'IDENTITY_HMAC_SECRET', purpose: 'Verify the customer before reading their account (or pick JWT/endpoint mode instead).' },
] as const
