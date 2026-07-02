import { describe, it, expect } from 'vitest'
import { parseConfig } from '@helpuit/config'
import { buildEmbedder } from './embedder.js'

function config(yaml: string, env: Record<string, string> = {}) {
  return parseConfig(
    `
chatwoot: { baseUrl: http://cw.local, accountId: 1, inboxId: 1 }
identity: { mode: hmac }
github: { owner: o, repo: r }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { url: https://app.example.com/login }
${yaml}
`,
    { CHATWOOT_API_TOKEN: 'cw', IDENTITY_HMAC_SECRET: 's', GITHUB_TOKEN: 'gh', SANDBOX_ADMIN_USER: 'a@x.com', SANDBOX_ADMIN_PASS: 'pw', ...env },
  )
}

const MODELS = `
models:
  provider: openai-compatible
  tiers:
    guidance: { model: local }
    reasoning: { model: local }
    vision: { model: local }
`

describe('buildEmbedder', () => {
  it('resolves an embedder from models.embedding via the openai-compatible provider', () => {
    const cfg = config(`${MODELS}  embedding: { model: nomic-embed }`, {
      OPENAI_COMPATIBLE_BASE_URL: 'http://llm.local/v1',
    })
    const result = buildEmbedder(cfg)
    expect(result).toBeDefined()
    expect(result!.model).toBe('nomic-embed')
  })

  it('is absent when no embedding model is configured (semantic layer silently off)', () => {
    expect(buildEmbedder(config(MODELS, { OPENAI_COMPATIBLE_BASE_URL: 'http://llm.local/v1' }))).toBeUndefined()
  })

  it('is absent for a provider without an embeddings API and when the LLM integration is off', () => {
    const anthropic = config(
      `
models:
  provider: anthropic
  tiers:
    guidance: { model: haiku }
    reasoning: { model: opus }
    vision: { model: haiku }
  embedding: { model: whatever }
`,
      { ANTHROPIC_API_KEY: 'k' },
    )
    expect(buildEmbedder(anthropic)).toBeUndefined()

    const off = config(`${MODELS}  embedding: { model: nomic-embed }\nintegrations: { llm: false }`, {
      OPENAI_COMPATIBLE_BASE_URL: 'http://llm.local/v1',
    })
    expect(buildEmbedder(off)).toBeUndefined()
  })
})
