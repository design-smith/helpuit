import { describe, it, expect } from 'vitest'
import { buildBedrockBody, parseBedrockResponse, BedrockModel } from './bedrock.js'

describe('buildBedrockBody', () => {
  it('separates system messages and includes the bedrock anthropic version', () => {
    const body = JSON.parse(
      buildBedrockBody({
        maxTokens: 256,
        messages: [
          { role: 'system', content: 'be helpful' },
          { role: 'user', content: 'hi' },
        ],
      }),
    )
    expect(body.anthropic_version).toBe('bedrock-2023-05-31')
    expect(body.max_tokens).toBe(256)
    expect(body.system).toBe('be helpful')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('parseBedrockResponse', () => {
  it('parses text + usage from a Bedrock response body', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        content: [{ type: 'text', text: 'From Bedrock.' }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    )
    const result = parseBedrockResponse(bytes)
    expect(result.text).toBe('From Bedrock.')
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2 })
  })
})

describe('BedrockModel', () => {
  it('constructs with explicit credentials without throwing', () => {
    const model = new BedrockModel({
      region: 'us-east-1',
      accessKeyId: 'a',
      secretAccessKey: 'b',
      model: 'anthropic.claude-3-sonnet',
    })
    expect(model).toBeInstanceOf(BedrockModel)
  })
})
