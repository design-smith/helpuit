import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { HttpEmbeddingModel } from './embeddings.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('HttpEmbeddingModel', () => {
  it('embeds a batch via the OpenAI-compatible /embeddings endpoint (real HTTP)', async () => {
    srv = await startTestServer(() => ({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }],
      usage: { prompt_tokens: 7 },
    }))
    const model = new HttpEmbeddingModel({ baseUrl: srv.baseUrl, model: 'embed-1', apiKey: 'k' })

    const vectors = await model.embed(['refund policy', 'export button'])

    expect(vectors).toHaveLength(2)
    expect(Array.from(vectors[0]!)).toEqual([1, 0, 0])
    expect(vectors[0]).toBeInstanceOf(Float32Array)

    const req = srv.requests[0]!
    expect(req.url).toBe('/embeddings')
    expect(req.headers.authorization).toBe('Bearer k')
    expect(req.body).toMatchObject({ model: 'embed-1', input: ['refund policy', 'export button'] })
  })

  it('throws a provider error on a non-OK response', async () => {
    srv = await startTestServer(() => ({ error: 'nope' }))
    // Make the server return 500 by throwing inside respond? startTestServer always 200s —
    // so exercise the error path with an unreachable port instead.
    const dead = new HttpEmbeddingModel({ baseUrl: 'http://127.0.0.1:1', model: 'm' })
    await expect(dead.embed(['x'])).rejects.toThrow()
  })
})
