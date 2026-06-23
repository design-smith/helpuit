import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { SandboxPool, FakeContainerRunner } from '@helpuit/sandbox'
import { DynamicReproducer } from '@helpuit/reproduction'
import { PlaywrightBrowserDriver } from './driver.js'

const servers: Server[] = []
const drivers: PlaywrightBrowserDriver[] = []
afterEach(async () => {
  for (const d of drivers) await d.shutdown()
  drivers.length = 0
  for (const s of servers) s.close()
  servers.length = 0
})

async function appServer(): Promise<string> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    if ((req.url ?? '').startsWith('/login')) {
      res.end(
        '<form action="/app/billing" method="get"><input id="email" name="email">' +
          '<input id="password" name="password"><button id="submit" type="submit">Login</button></form>',
      )
    } else {
      res.end('<button id="save" onclick="console.error(\'save failed: 500\')">Save</button>')
    }
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('DynamicReproducer + PlaywrightBrowserDriver (L3b, real browser)', () => {
  it('reproduces a real failure end-to-end and cleans up the lease + container', { timeout: 45000, retry: 2 }, async () => {
    const base = await appServer()
    const pool = new SandboxPool([
      { id: 'a1', role: 'admin', usernameSecret: 'SANDBOX_ADMIN_USER', passwordSecret: 'SANDBOX_ADMIN_PASS' },
    ])
    const containers = new FakeContainerRunner()
    const driver = new PlaywrightBrowserDriver({
      targetUrl: base,
      login: {
        mode: 'form',
        url: `${base}/login`,
        userSelector: '#email',
        passSelector: '#password',
        submitSelector: '#submit',
      },
      env: { SANDBOX_ADMIN_USER: 'admin@x.com', SANDBOX_ADMIN_PASS: 'pw' },
    })
    drivers.push(driver)

    const reproducer = new DynamicReproducer(pool, containers, driver)
    const result = await reproducer.reproduce({
      route: '/app/billing',
      sandboxRole: 'admin',
      steps: [{ action: 'click', selector: '#save' }],
    })

    expect(result.reproduced).toBe(true)
    expect(result.evidence.consoleErrors.some((e) => e.includes('save failed'))).toBe(true)
    expect(result.evidence.screenshot).toBeTruthy()

    // abortability cleanup
    expect(pool.availableCount('admin')).toBe(1)
    expect(containers.running.size).toBe(0)
  })
})
