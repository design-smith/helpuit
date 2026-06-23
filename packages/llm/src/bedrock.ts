import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { ChatModel, CompleteOptions, CompletionResult } from './types.js'

export interface BedrockOptions {
  region: string
  model: string
  accessKeyId?: string
  secretAccessKey?: string
  /** Override the endpoint (e.g. a VPC endpoint). */
  endpoint?: string
}

interface BedrockAnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** Build the Bedrock (Anthropic-on-Bedrock) request body from chat options. Pure + testable. */
export function buildBedrockBody(options: CompleteOptions): string {
  const system = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const messages = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  return JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens ?? 1024,
    ...(system !== '' ? { system } : {}),
    messages,
  })
}

/** Parse a Bedrock InvokeModel response body into a CompletionResult. Pure + testable. */
export function parseBedrockResponse(bytes: Uint8Array): CompletionResult {
  const json = JSON.parse(new TextDecoder().decode(bytes)) as BedrockAnthropicResponse
  const text = (json.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
  return {
    text,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  }
}

/**
 * Real AWS Bedrock adapter (Anthropic-family models on Bedrock) via the AWS SDK.
 * Request-building and response-parsing are unit-tested as pure functions above;
 * the SDK transport is validated against real AWS in the integration suite (PB24).
 */
export class BedrockModel implements ChatModel {
  private readonly client: BedrockRuntimeClient
  private readonly model: string

  constructor(options: BedrockOptions) {
    this.model = options.model
    this.client = new BedrockRuntimeClient({
      region: options.region,
      ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
      ...(options.accessKeyId !== undefined && options.secretAccessKey !== undefined
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    })
  }

  async complete(options: CompleteOptions): Promise<CompletionResult> {
    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: buildBedrockBody(options),
      }),
    )
    return parseBedrockResponse(response.body)
  }
}
