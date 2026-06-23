import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { testGitHub } from './github-test.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** A real GitHub-API-shaped server. `onAuth` lets a test inspect the Authorization header. */
async function githubServer(opts: { status?: number; onAuth?: (auth: string | undefined) => void } = {}): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    opts.onAuth?.(req.headers.authorization)
    res.setHeader('content-type', 'application/json')
    const url = req.url ?? ''
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
      if (opts.status !== undefined && opts.status >= 400) {
        res.statusCode = opts.status
        res.end(JSON.stringify({ message: 'Not Found' }))
        return
      }
      res.end(JSON.stringify({ full_name: 'acme/product' }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  }
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

describe('testGitHub', () => {
  it('reports reachable with the repo name when the API responds (PAT auth)', async () => {
    const base = await githubServer()

    const result = await testGitHub({ owner: 'acme', repo: 'product', token: 'ghp_x', apiBaseUrl: base })

    expect(result.ok).toBe(true)
    expect(result.repo).toBe('acme/product')
  })

  it('reports not-reachable when the API rejects (e.g. bad token / missing repo)', async () => {
    const base = await githubServer({ status: 404 })

    const result = await testGitHub({ owner: 'acme', repo: 'missing', token: 'ghp_x', apiBaseUrl: base })

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/404/)
  })

  it('requires owner + repo', async () => {
    expect((await testGitHub({ owner: '', repo: 'r', token: 't' })).ok).toBe(false)
    expect((await testGitHub({ owner: 'o', repo: '', token: 't' })).ok).toBe(false)
  })

  it('uses an App installation token from getToken when provided (App auth path)', async () => {
    let seenAuth: string | undefined
    const base = await githubServer({ onAuth: (a) => (seenAuth = a) })

    // PAT empty, but a real getToken closure supplies the installation token —
    // exactly what githubOptionsFromConfig produces for App auth.
    const result = await testGitHub({
      owner: 'acme',
      repo: 'product',
      token: '',
      getToken: async () => 'inst-token-123',
      apiBaseUrl: base,
    })

    expect(result.ok).toBe(true)
    expect(seenAuth).toBe('Bearer inst-token-123')
  })
})
