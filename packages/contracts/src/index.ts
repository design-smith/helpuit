import { z } from 'zod'

/** Branded identifier for a Helpuit investigation. */
export const InvestigationId = z.string().min(1).brand<'InvestigationId'>()
export type InvestigationId = z.infer<typeof InvestigationId>

/** Parse/brand a raw string as an InvestigationId. */
export const investigationId = (raw: string): InvestigationId => InvestigationId.parse(raw)

/**
 * The explicit, exhaustive set of outcomes every investigation ends in.
 * Irreversible-harm categories resolve to `needs_founder`.
 */
export const Classification = z.enum([
  'user_error',
  'permission_or_config_issue',
  'account_data_issue',
  'docs_gap',
  'known_bug',
  'new_bug',
  'cannot_reproduce',
  'needs_founder',
])
export type Classification = z.infer<typeof Classification>

/** Redaction lifecycle for evidence artifacts. Nothing exports until `redacted`. */
export const RedactionStatus = z.enum(['pending', 'redacted', 'blocked'])
export type RedactionStatus = z.infer<typeof RedactionStatus>

/** Lifecycle status of an investigation (mirrors the Chatwoot ticket state). */
export const InvestigationStatus = z.enum([
  'open',
  'escalated',
  'resolved_pending_customer_update',
  'resolved',
  'needs_founder',
])
export type InvestigationStatus = z.infer<typeof InvestigationStatus>

/** The escalation level an investigation has reached (the L1→L4 spine). */
export const InvestigationLevel = z.enum([
  'guidance',
  'account',
  'static_repro',
  'dynamic_repro',
  'escalation',
])
export type InvestigationLevel = z.infer<typeof InvestigationLevel>

/** Core domain entity: one customer issue under investigation. */
export interface Investigation {
  id: InvestigationId
  conversationId: number
  customerId: string | null
  status: InvestigationStatus
  level: InvestigationLevel
  classification: Classification | null
  confidence: number | null
  createdAt: number
  updatedAt: number
}

/** Shared list/pagination options for read queries (operator console). */
export interface ListOptions {
  /** Max rows to return. Implementations clamp to a sane maximum (default 25, max 100). */
  limit?: number
  /** Rows to skip (offset pagination). */
  offset?: number
  /** Sort by creation/recency. */
  order?: 'newest' | 'oldest'
}

/** A page of results plus the unfiltered-by-page total (for pagination UIs). */
export interface Page<T> {
  items: T[]
  total: number
}

/** Default page size and hard ceiling, shared by every list query. */
export const DEFAULT_PAGE_LIMIT = 25
export const MAX_PAGE_LIMIT = 100

/** Normalize raw list options into a safe `{ limit, offset, order }`. */
export function normalizeListOptions(options: ListOptions = {}): Required<ListOptions> {
  const rawLimit = options.limit ?? DEFAULT_PAGE_LIMIT
  const limit = Math.min(Math.max(1, Math.trunc(rawLimit)), MAX_PAGE_LIMIT)
  const offset = Math.max(0, Math.trunc(options.offset ?? 0))
  return { limit, offset, order: options.order ?? 'newest' }
}

export const ArtifactType = z.enum(['screenshot', 'console', 'har', 'findings'])
export type ArtifactType = z.infer<typeof ArtifactType>

/**
 * Cross-track contract: an evidence artifact produced during reproduction or
 * investigation. `content` is intentionally untyped at the boundary — each
 * producer/consumer narrows it by `type` (e.g. a HAR object for `har`).
 */
export const Artifact = z.object({
  id: z.string().min(1),
  investigationId: InvestigationId,
  type: ArtifactType,
  redactionStatus: RedactionStatus.default('pending'),
  content: z.unknown(),
})
export type Artifact = z.infer<typeof Artifact>
