import type { Classification } from '@helpuit/contracts'
import type { VerifiedIdentity } from '@helpuit/identity'
import type { QueryRouteClient, Row } from '@helpuit/query-routes'

export interface ContextQuery {
  route: string
  columns: string[]
}

/** Summarizes raw query results into a safe, customer-presentable finding (the LLM, faked in tests). */
export interface AccountModel {
  summarize(input: {
    findings: Record<string, Row[]>
  }): Promise<{ summary: string; classificationHint?: Classification }>
}

export interface AccountFindings {
  /** Customer-safe summary (the `safe_user_summary`). */
  summary: string
  /** Raw rows per query — internal reasoning only, never customer-facing. */
  raw: Record<string, Row[]>
  classificationHint?: Classification
}

/**
 * L2 account investigation (issue 34): run the founder-approved context queries
 * (each scoped to the verified identity by the query-route client) and summarize
 * the result into safe findings. The investigator never composes SQL or chooses
 * whose data — that is enforced by the query-route client.
 */
export class AccountInvestigator {
  constructor(
    private readonly client: QueryRouteClient,
    private readonly queries: ContextQuery[],
    private readonly model: AccountModel,
  ) {}

  async investigate(identity: VerifiedIdentity): Promise<AccountFindings> {
    const raw: Record<string, Row[]> = {}
    for (const query of this.queries) {
      raw[query.route] = await this.client.query(
        { route: query.route, columns: query.columns },
        identity,
      )
    }
    const { summary, classificationHint } = await this.model.summarize({ findings: raw })
    return { summary, raw, classificationHint }
  }
}
