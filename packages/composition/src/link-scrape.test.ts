import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { scrapeLink } from './link-scrape.js'

let server: Server | undefined
afterEach(() => server?.close())

async function serveHtml(html: string, status = 200): Promise<string> {
  server = createServer((_req, res) => {
    res.statusCode = status
    res.setHeader('content-type', 'text/html')
    res.end(html)
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/docs`
}

describe('scrapeLink', () => {
  it('extracts readable text: drops scripts/styles/head, strips tags, decodes entities', async () => {
    const url = await serveHtml(`<!doctype html>
      <html><head><title>Docs</title><style>.x{color:red}</style></head>
      <body><nav>Home | Pricing</nav>
      <h1>Refund policy</h1>
      <p>Refunds &amp; credits are processed within <b>five</b> business days.</p>
      <script>track("evil")</script>
      </body></html>`)

    const { title, text } = await scrapeLink(url)

    expect(title).toBe('Docs')
    expect(text).toContain('Refund policy')
    expect(text).toContain('Refunds & credits are processed within five business days.')
    expect(text).not.toContain('track(')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('<')
  })

  it('throws a clear error on a non-OK response and caps huge pages', async () => {
    const url = await serveHtml('gone', 404)
    await expect(scrapeLink(url)).rejects.toThrow(/404/)

    server?.close()
    const bigUrl = await serveHtml(`<body>${'word '.repeat(60_000)}</body>`)
    const { text } = await scrapeLink(bigUrl)
    expect(text.length).toBeLessThanOrEqual(100_000)
  })
})
