import type { Provider, ProviderKeys } from '@helpuit/config'
import type { ChatModel } from './types.js'
import { AnthropicModel } from './anthropic.js'
import { OpenAICompatibleModel } from './openai-compatible.js'
import { BedrockModel } from './bedrock.js'
import { LazyMissingKeyModel } from './lazy-missing-key.js'

export type Tier = 'guidance' | 'reasoning' | 'vision'

export interface ModelTierConfig {
  provider?: Provider
  model: string
}

export interface ModelsRoutingConfig {
  provider: Provider
  tiers: Record<Tier, ModelTierConfig>
  providerKeys: ProviderKeys
}

export interface ModelRouterOptions {
  /**
   * When true, a tier whose provider key is missing returns a `LazyMissingKeyModel`
   * (boots fine, errors clearly only when used) instead of throwing at build time.
   * The production server runs lenient so it boots with unset secrets.
   */
  lenient?: boolean
}

/**
 * Builds the right `ChatModel` for each pipeline tier from config. A tier uses
 * its own provider override or falls back to the default provider. This is the
 * single point where "which model" becomes a concrete adapter — swapping
 * providers is pure config.
 */
export class ModelRouter {
  private readonly lenient: boolean

  constructor(
    private readonly config: ModelsRoutingConfig,
    options: ModelRouterOptions = {},
  ) {
    this.lenient = options.lenient ?? false
  }

  forTier(tier: Tier): ChatModel {
    const tierConfig = this.config.tiers[tier]
    return this.build(tierConfig.provider ?? this.config.provider, tierConfig.model)
  }

  /** Resolve a required credential, or fall back to lazy/throw when it's unset. */
  private orFallback(value: string | undefined, provider: string, make: (v: string) => ChatModel): ChatModel {
    if (value === undefined || value === '') {
      if (this.lenient) return new LazyMissingKeyModel(provider)
      throw new Error(`No credentials configured for provider "${provider}"`)
    }
    return make(value)
  }

  private build(provider: Provider, model: string): ChatModel {
    const keys = this.config.providerKeys
    switch (provider) {
      case 'anthropic':
        return this.orFallback(keys.anthropic, 'anthropic', (apiKey) => new AnthropicModel({ apiKey, model }))
      case 'openai':
        return this.orFallback(
          keys.openai,
          'openai',
          (apiKey) => new OpenAICompatibleModel({ apiKey, model, baseUrl: 'https://api.openai.com/v1' }),
        )
      case 'deepseek':
        return this.orFallback(
          keys.deepseek,
          'deepseek',
          (apiKey) => new OpenAICompatibleModel({ apiKey, model, baseUrl: 'https://api.deepseek.com/v1' }),
        )
      case 'openai-compatible':
        return this.orFallback(
          keys.openaiCompatible?.baseUrl,
          'openai-compatible',
          (baseUrl) =>
            new OpenAICompatibleModel({ apiKey: keys.openaiCompatible?.apiKey ?? '', model, baseUrl }),
        )
      case 'bedrock':
        return this.orFallback(
          keys.bedrock?.region,
          'bedrock',
          (region) =>
            new BedrockModel({
              region,
              accessKeyId: keys.bedrock?.accessKeyId,
              secretAccessKey: keys.bedrock?.secretAccessKey,
              model,
            }),
        )
    }
  }
}
