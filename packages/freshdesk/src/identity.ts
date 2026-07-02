import { resilientFetch } from '@helpuit/resilience'
import type { FreshdeskConfig, FreshdeskContact } from './types.js'

/**
 * Resolve a ticket requester to a stable identity by re-fetching the contact:
 * the merchant-assigned `unique_external_id` if set, else the email. Freshdesk's
 * `requester_id` is an internal contact id (not the merchant's user id), so the
 * re-fetch is what makes account-scoped (L2) lookups possible. null = unidentified.
 */
export async function fetchRequesterExternalId(
  config: FreshdeskConfig,
  requesterId: string | undefined,
): Promise<string | null> {
  if (requesterId === undefined || requesterId === '') return null
  const base = config.baseUrl.replace(/\/$/, '')
  const res = await resilientFetch(`${base}/contacts/${requesterId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Freshdesk request failed: ${res.status} ${res.statusText}`)
  const contact = (await res.json()) as FreshdeskContact
  return contact.unique_external_id ?? contact.email ?? null
}
