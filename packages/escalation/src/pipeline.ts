import { computeSignature, classifyMatch, type IssueSearch } from '@helpuit/dedup'
import type { Classification } from '@helpuit/contracts'
import { EscalationAgent, type IssueDraft, type IssueTracker } from './escalation.js'

/** Optional reproduction step (real Playwright via the composition adapter; gated by canReproduce). */
export interface ReproductionRunner {
  reproduce(input: { feature?: string; investigationId?: string }): Promise<{ reproduced: boolean }>
}

export interface EscalationPipelineDeps {
  tracker: IssueTracker
  search: IssueSearch
  autopublish: boolean
  reproduction?: ReproductionRunner
}

export interface EscalationRequest {
  complaint: string
  classification: Classification
  feature?: string
  hypothesis?: string
  suspectedFiles?: string[]
  /** The investigation being escalated — lets reproduction tie its evidence to it. */
  investigationId?: string
}

export interface EscalationOutcome {
  action: 'created' | 'linked' | 'drafted'
  issueNumber?: number
  reproduced: boolean
  classification: Classification
  /** The drafted issue (always produced) — persisted for approval when `action` is `drafted`. */
  draft: IssueDraft
  /** Bug signature embedded in the issue body (for dedup). */
  signature: string
  /** When dedup found an open match, the issue it linked/would link to. */
  openMatchIssue?: number
}

/**
 * The L3a→L4 pipeline (satisfies the orchestrator's escalation port): compute a
 * bug signature, dedup against existing issues, optionally reproduce, then file
 * (or link to an open match). The signature is embedded in the issue body so the
 * Nth customer with the same bug links instead of filing a duplicate.
 */
export class EscalationPipeline {
  constructor(private readonly deps: EscalationPipelineDeps) {}

  async escalate(request: EscalationRequest): Promise<EscalationOutcome> {
    const signature = computeSignature({
      feature: request.feature,
      errorClass: request.classification,
    })
    const match = classifyMatch(signature, await this.deps.search.search(signature))
    const openMatchIssue = match.verdict === 'open' ? match.issue.number : undefined

    let reproduced = false
    if (this.deps.reproduction !== undefined) {
      reproduced = (
        await this.deps.reproduction.reproduce({
          feature: request.feature,
          investigationId: request.investigationId,
        })
      ).reproduced
    }

    const agent = new EscalationAgent(this.deps.tracker, { autopublish: this.deps.autopublish })
    const result = await agent.escalate({
      classification: request.classification,
      safeSummary: `Customer report: ${request.complaint}`,
      hypothesis: request.hypothesis,
      suspectedFiles: request.suspectedFiles,
      reproduced,
      signature,
      openMatchIssue,
    })

    return {
      action: result.action,
      issueNumber: result.issueNumber,
      reproduced,
      classification: request.classification,
      draft: result.draft,
      signature,
      openMatchIssue,
    }
  }
}
