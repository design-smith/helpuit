import type { InboundMessage, SupportClient } from '@helpuit/chatwoot'

/**
 * One support platform behind a connection. Chatwoot is the first; Zendesk,
 * Intercom, Freshdesk, HubSpot follow. `parse` turns that platform's inbound
 * webhook/poll payload into a normalized customer message (or null to ignore);
 * `client` posts replies + private notes back on the same connection.
 */
export interface SupportAdapter {
  readonly platform: string
  parse(payload: unknown): InboundMessage | null
  readonly client: SupportClient
}

/**
 * Resolves a connection id (from the `/webhooks/:connectionId` route or a poll
 * loop) to its adapter. A thin Map so multiple connections — including several
 * of the same platform — run side by side.
 */
export class PlatformRegistry {
  private readonly adapters: Map<string, SupportAdapter>

  constructor(entries: Iterable<readonly [string, SupportAdapter]>) {
    this.adapters = new Map(entries)
  }

  get(connectionId: string): SupportAdapter | undefined {
    return this.adapters.get(connectionId)
  }

  get connectionIds(): string[] {
    return [...this.adapters.keys()]
  }
}
