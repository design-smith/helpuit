import { BudgetExceededError, type BudgetGovernor, type SpendLedger } from '@helpuit/budget'
import type { ChatModel, CompleteOptions, CompletionResult } from './types.js'

export interface MeteredModelOptions {
  ledger: SpendLedger
  governor: BudgetGovernor
  now?: () => number
  /** Budget scope key (an investigation id, or 'global'). */
  scope?: string
}

/**
 * Wraps a `ChatModel` to enforce budget caps and meter spend: it checks the
 * governor BEFORE each call (throwing `BudgetExceededError` when a cap is
 * reached) and records the call's token usage AFTER. This is the single choke
 * point that stops runaway LLM cost.
 */
export class MeteredChatModel implements ChatModel {
  private readonly now: () => number
  private readonly scope: string

  constructor(
    private readonly inner: ChatModel,
    private readonly options: MeteredModelOptions,
  ) {
    this.now = options.now ?? (() => Date.now())
    this.scope = options.scope ?? 'global'
  }

  async complete(options: CompleteOptions): Promise<CompletionResult> {
    const at = this.now()
    const decision = this.options.governor.evaluate(this.scope, 1, at)
    if (!decision.allowed) {
      throw new BudgetExceededError(decision.reason ?? 'budget cap reached', decision.cap)
    }
    const result = await this.inner.complete(options)
    this.options.ledger.record({
      investigationId: this.scope,
      amount: result.usage.inputTokens + result.usage.outputTokens,
      at,
    })
    return result
  }
}
