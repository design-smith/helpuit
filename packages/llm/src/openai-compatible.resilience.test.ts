import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { OpenAICompatibleModel } from './openai-compatible.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

describe('OpenAICompatibleModel resilience', () => {
  it('retries a transient 503 from the LLM endpoint and still returns content', async () => {
    let hits = 0
    const server = createServer((req, res) => {
      hits++
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        if (hits < 2) {
          res.statusCode = 503
          res.end('overloaded')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'recovered answer' } }],
            usage: { prompt_tokens: 1, completion_tokens: 2 },
          }),
        )
      })
    })
    servers.push(server)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const model = new OpenAICompatibleModel({ model: 'local', baseUrl })
    const result = await model.complete({ messages: [{ role: 'user', content: 'hi' }] })

    expect(result.text).toBe('recovered answer')
    expect(hits).toBe(2) // one failure + one success, transparently retried
  })
})
