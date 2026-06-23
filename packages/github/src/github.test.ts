import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { GitHubRepoSource } from './repo-source.js'
import { GitHubCodeRetriever } from './code-retriever.js'
import { GitHubIssueTracker } from './issue-tracker.js'
import { RedactingIssueTracker } from './redacting-issue-tracker.js'
import { GitHubIssueSearch } from './issue-search.js'
import { githubRequest } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

interface Captured {
  method?: string
  url?: string
  auth?: string | string[]
  body?: unknown
}

async function start(respond: (c: Captured) => unknown, status = 200): Promise<{ url: string; requests: Captured[] }> {
  const requests: Captured[] = []
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const captured: Captured = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: body === '' ? undefined : JSON.parse(body),
      }
      requests.push(captured)
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(respond(captured)))
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { url: `http://127.0.0.1:${port}`, requests }
}

const base = (apiBaseUrl: string) => ({ owner: 'acme', repo: 'product', token: 'ght', apiBaseUrl })

describe('GitHubRepoSource', () => {
  it('lists repository file paths from the git tree at the configured ref', async () => {
    const { url, requests } = await start(() => ({
      tree: [
        { path: 'app/routes/billing.tsx', type: 'blob' },
        { path: 'app/routes', type: 'tree' },
        { path: 'src/util.ts', type: 'blob' },
      ],
    }))
    const source = new GitHubRepoSource({ ...base(url), ref: 'release' })

    expect(source.ref()).toBe('release')
    const files = await source.listFiles()
    expect(files.map((f) => f.path)).toEqual(['app/routes/billing.tsx', 'src/util.ts'])
    expect(requests[0]!.url).toContain('/repos/acme/product/git/trees/release')
    expect(requests[0]!.auth).toBe('Bearer ght')
  })
})

describe('GitHubCodeRetriever', () => {
  it('fetches and base64-decodes file contents', async () => {
    const { url } = await start(() => ({
      content: Buffer.from('export const x = 1\n', 'utf8').toString('base64'),
      encoding: 'base64',
    }))
    const retriever = new GitHubCodeRetriever({ ...base(url), ref: 'main' })
    const code = await retriever.retrieve(['src/x.ts'])
    expect(code['src/x.ts']).toBe('export const x = 1\n')
  })
})

describe('GitHubIssueTracker', () => {
  it('creates an issue and returns its number + url', async () => {
    const { url, requests } = await start(() => ({ number: 321, html_url: 'https://github.com/acme/product/issues/321' }))
    const tracker = new GitHubIssueTracker(base(url))
    const ref = await tracker.create({ title: 'Bug', body: 'details', labels: ['helpuit'], severity: 'high' })
    expect(ref).toEqual({ number: 321, url: 'https://github.com/acme/product/issues/321' })
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.url).toBe('/repos/acme/product/issues')
    expect((requests[0]!.body as { labels: string[] }).labels).toContain('helpuit')
  })

  it('posts a comment to an existing issue', async () => {
    const { url, requests } = await start(() => ({}))
    await new GitHubIssueTracker(base(url)).comment(321, 'another affected customer')
    expect(requests[0]!.url).toBe('/repos/acme/product/issues/321/comments')
    expect((requests[0]!.body as { body: string }).body).toContain('affected customer')
  })
})

describe('RedactingIssueTracker (export boundary gate)', () => {
  it('redacts PII and secrets from the title + body before they reach GitHub', async () => {
    const { url, requests } = await start(() => ({ number: 12, html_url: 'https://github.com/acme/product/issues/12' }))
    const tracker = new RedactingIssueTracker(new GitHubIssueTracker(base(url)))

    const ref = await tracker.create({
      title: 'Crash reported by jane@example.com',
      body: 'User jane@example.com saw a 500. Their token sk-abcdEFGH1234abcdEFGH1234abcdEFGH leaked into logs.',
      labels: ['helpuit'],
      severity: 'high',
    })

    expect(ref.number).toBe(12)
    const sent = requests[0]!.body as { title: string; body: string }
    expect(sent.body).not.toContain('jane@example.com')
    expect(sent.body).not.toContain('sk-abcd')
    expect(sent.body).toContain('[REDACTED:email]')
    expect(sent.body).toContain('[REDACTED:secret]')
    expect(sent.title).not.toContain('jane@example.com')
    expect(sent.title).toContain('[REDACTED:email]')
  })

  it('redacts comment bodies too', async () => {
    const { url, requests } = await start(() => ({}))
    await new RedactingIssueTracker(new GitHubIssueTracker(base(url))).comment(
      7,
      'Another report from bob@corp.io',
    )
    const sent = requests[0]!.body as { body: string }
    expect(sent.body).not.toContain('bob@corp.io')
    expect(sent.body).toContain('[REDACTED:email]')
  })
})

describe('GitHubIssueSearch', () => {
  it('maps search results to IssueRefs and parses the embedded signature', async () => {
    const { url } = await start(() => ({
      items: [
        { number: 5, html_url: 'u5', state: 'open', body: 'Summary\nhelpuit-signature: billing|/x|POST|500\n' },
        { number: 6, html_url: 'u6', state: 'closed', body: 'no marker here' },
      ],
    }))
    const refs = await new GitHubIssueSearch(base(url)).search('billing|/x|POST|500')
    expect(refs[0]).toEqual({ number: 5, url: 'u5', state: 'open', signature: 'billing|/x|POST|500' })
    expect(refs[1]!.state).toBe('closed')
    expect(refs[1]!.signature).toBeUndefined()
  })
})

describe('githubRequest auth', () => {
  it('uses a static token by default', async () => {
    const { url, requests } = await start(() => ({ ok: true }))
    await githubRequest({ owner: 'a', repo: 'b', token: 'static-tok', apiBaseUrl: url }, 'GET', '/x')
    expect(requests[0]!.auth).toBe('Bearer static-tok')
  })

  it('uses an async token provider when given (GitHub App installation tokens)', async () => {
    const { url, requests } = await start(() => ({ ok: true }))
    await githubRequest(
      { owner: 'a', repo: 'b', token: '', apiBaseUrl: url, getToken: async () => 'inst-xyz' },
      'GET',
      '/x',
    )
    expect(requests[0]!.auth).toBe('Bearer inst-xyz')
  })
})
