import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createDb, type DbHandle } from '@helpuit/db'
import type { HelpuitConfig } from '@helpuit/config'
import { provisionDocs } from './provision-docs.js'

const servers: Server[] = []
let handle: DbHandle | undefined
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
  handle?.close()
})

// External LLM seam; grounding sources come from the REAL index retrieval.
const sourcesFor = async (index: { retrieve(q: string, k?: number): unknown }, q: string) =>
  ((await index.retrieve(q)) as Array<{ id: string }>).map((h) => h.id)

async function ghServer(tree: string[], contents: Record<string, string>): Promise<string> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (url.includes('/git/trees/')) {
      res.end(JSON.stringify({ tree: tree.map((path) => ({ path, type: 'blob' })) }))
      return
    }
    const match = /\/contents\/(.+?)\?/.exec(url)
    if (match !== null) {
      const body = contents[decodeURIComponent(match[1]!)]
      if (body === undefined) {
        res.statusCode = 404
        res.end('{}')
        return
      }
      res.end(JSON.stringify({ content: Buffer.from(body, 'utf8').toString('base64'), encoding: 'base64' }))
      return
    }
    res.end('{}')
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

function configFor(base: string, repoPaths: string[]): HelpuitConfig {
  return {
    github: { owner: 'o', repo: 'r', token: 't', apiBaseUrl: base, productionBranch: 'main', auth: 'pat' },
    docs: { repoPaths },
  } as unknown as HelpuitConfig
}

describe('provisionDocs', () => {
  it('ingests repo markdown so an L1 answer grounds on a repo-sourced doc', async () => {
    const base = await ghServer(
      ['docs/guide.md', 'src/app.ts'],
      { 'docs/guide.md': 'To reset your password, open Settings and click Reset Password.' },
    )
    handle = await createDb(':memory:')

    const service = await provisionDocs(configFor(base, ['docs/**/*.md']), { db: handle.db })

    expect(await sourcesFor(service.index, 'how do I reset my password?')).toContain('docs/guide.md')
  })

  it('degrades to persisted docs when the repo is unreachable (no crash)', async () => {
    handle = await createDb(':memory:')
    // Doc paths configured, but GitHub points at a closed port → a real failed fetch.
    const service = await provisionDocs(configFor('http://127.0.0.1:1', ['docs/**/*.md']), { db: handle.db })

    // Boot survived; operator-pasted docs still ground.
    const doc = await service.add({ text: 'Our refund policy allows returns within 30 days.' })
    expect(await sourcesFor(service.index, 'what is the refund policy?')).toContain(doc.id)
  })

  it('skips the repo fetch entirely when no doc paths are configured', async () => {
    handle = await createDb(':memory:')
    // repoPaths empty: even with an unreachable GitHub, no fetch is attempted.
    const service = await provisionDocs(configFor('http://127.0.0.1:1', []), { db: handle.db })

    const doc = await service.add({ text: 'The data export feature lives under Settings.' })
    expect(await sourcesFor(service.index, 'data export feature')).toContain(doc.id)
  })
})
