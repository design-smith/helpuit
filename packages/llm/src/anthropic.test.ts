import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { AnthropicModel } from './anthropic.js'

let server: Server | undefined
afterEach(() => server?.close())

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void

/** Start a REAL local HTTP server (no mocking) and return its base URL. */
async function startServer(handler: Handler): Promise<string> {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => handler(req, res, body))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('AnthropicModel', () => {
  it('makes a real HTTP request to the messages API and parses text + usage', async () => {
    let captured: { url?: string; apiKey?: string; model?: string } = {}
    const baseUrl = await startServer((req, res, body) => {
      const parsed = JSON.parse(body) as { model: string }
      captured = {
        url: req.url,
        apiKey: req.headers['x-api-key'] as string,
        model: parsed.model,
      }
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: 'Click Save on the billing page.' }],
          usage: { input_tokens: 12, output_tokens: 7 },
        }),
      )
    })

    const model = new AnthropicModel({ apiKey: 'k', model: 'claude-haiku-4-5', baseUrl })
    const result = await model.complete({
      messages: [{ role: 'user', content: 'how do I save billing?' }],
    })

    expect(result.text).toContain('Click Save')
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 7 })
    expect(captured.url).toBe('/v1/messages')
    expect(captured.apiKey).toBe('k')
    expect(captured.model).toBe('claude-haiku-4-5')
  })
})
