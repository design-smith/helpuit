import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { GitHubRepoSource, GitHubCodeRetriever } from '@helpuit/github'
import { RepoDocsLoader } from './repo-docs-loader.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** A real GitHub-API-shaped server: git-trees listing + base64 contents. */
async function ghServer(tree: string[], contents: Record<string, string>): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (url.includes('/git/trees/')) {
      res.end(JSON.stringify({ tree: tree.map((path) => ({ path, type: 'blob' })) }))
      return
    }
    const match = /\/contents\/(.+?)\?/.exec(url)
    if (match !== null) {
      const path = decodeURIComponent(match[1]!)
      const body = contents[path]
      if (body === undefined) {
        res.statusCode = 404
        res.end('{}')
        return
      }
      res.end(JSON.stringify({ content: Buffer.from(body, 'utf8').toString('base64'), encoding: 'base64' }))
      return
    }
    res.end('{}')
  }
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('RepoDocsLoader', () => {
  it('fetches markdown matching the configured globs from the repo, with content', async () => {
    const base = await ghServer(
      ['README.md', 'docs/guide.md', 'docs/api/reference.md', 'src/app.ts'],
      {
        'README.md': '# Welcome\nGetting started with the product.',
        'docs/guide.md': 'To reset your password, open Settings and click Reset.',
        'docs/api/reference.md': 'The export endpoint returns CSV.',
      },
    )
    const options = { owner: 'o', repo: 'r', token: 't', apiBaseUrl: base, ref: 'main' }
    const loader = new RepoDocsLoader(
      new GitHubRepoSource(options),
      new GitHubCodeRetriever(options),
      ['README.md', 'docs/**/*.md'],
    )

    const docs = await loader.load()

    const byId = Object.fromEntries(docs.map((d) => [d.id, d.text]))
    // README.md (exact) + both docs/*.md (recursive glob); src/app.ts excluded.
    expect(Object.keys(byId).sort()).toEqual(['README.md', 'docs/api/reference.md', 'docs/guide.md'])
    expect(byId['docs/guide.md']).toContain('reset your password')
    expect(byId['docs/api/reference.md']).toContain('export endpoint')
  })
})
