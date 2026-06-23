import type { HelpuitConfig } from '@helpuit/config'
import { DrizzleTicketing, type Db } from '@helpuit/db'
import { HttpChatwootClient } from '@helpuit/chatwoot'
import { LifecycleSync, parseGitHubEvent } from '@helpuit/lifecycle-sync'

export interface LifecycleDeps {
  db: Db
}

/**
 * Build the GitHub-webhook handler: parse the event and run lifecycle sync,
 * which posts status notes to every linked ticket and (in auto resolution mode,
 * on a `completed` close) fans the "try again" message out to all affected
 * customers. Returns a handler the server calls after signature + idempotency checks.
 */
export function buildGitHubWebhookHandler(
  config: HelpuitConfig,
  deps: LifecycleDeps,
): (payload: unknown) => Promise<void> {
  const sync = new LifecycleSync({
    ticketing: new DrizzleTicketing(deps.db),
    client: new HttpChatwootClient({
      baseUrl: config.chatwoot.baseUrl,
      accountId: config.chatwoot.accountId,
      apiAccessToken: config.chatwoot.apiToken,
    }),
    mode: config.policy.resolutionMode,
  })

  return async (payload: unknown) => {
    const event = parseGitHubEvent(payload)
    if (event !== null) await sync.handleEvent(event)
  }
}
