import { LlmError, type ChatModel, type CompletionResult } from './types.js'

/**
 * A placeholder `ChatModel` used when a provider's API key is not configured. It
 * lets the app BUILD and BOOT with unset secrets (the operator fills them in via
 * the console), and only fails — with a clear, actionable message and no network
 * call — if something actually tries to use the model.
 */
export class LazyMissingKeyModel implements ChatModel {
  constructor(private readonly provider: string) {}

  async complete(): Promise<CompletionResult> {
    throw new LlmError(
      this.provider,
      0,
      `No API key configured for provider "${this.provider}". Set it in the console under Settings → Secrets.`,
    )
  }
}
