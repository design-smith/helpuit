import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PlaywrightBrowserDriver } from './driver.js'

const servers: Server[] = []
const drivers: PlaywrightBrowserDriver[] = []
afterEach(async () => {
  for (const d of drivers) await d.shutdown()
  drivers.length = 0
  for (const s of servers) s.close()
  servers.length = 0
})

/** A real local app: a login form that navigates to the billing page, which errors on Save. */
async function appServer(): Promise<string> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    if ((req.url ?? '').startsWith('/login')) {
      res.end(
        '<form action="/app/billing" method="get">' +
          '<input id="email" name="email"><input id="password" name="password">' +
          '<button id="submit" type="submit">Login</button></form>',
      )
    } else {
      res.end('<button id="save" onclick="console.error(\'save failed: 500\')">Save</button>')
    }
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('PlaywrightBrowserDriver', () => {
  it('logs in with a real browser, drives the page, and captures console errors', { timeout: 45000, retry: 2 }, async () => {
    const base = await appServer()
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

    const session = await driver.open(
      { id: 'a1', role: 'admin', usernameSecret: 'SANDBOX_ADMIN_USER', passwordSecret: 'SANDBOX_ADMIN_PASS' },
      'container-1',
    )
    const evidence = await session.run({
      route: '/app/billing',
      sandboxRole: 'admin',
      steps: [{ action: 'click', selector: '#save' }],
    })
    await driver.close(session)

    expect(evidence.consoleErrors.some((e) => e.includes('save failed'))).toBe(true)
    expect(evidence.screenshot).toBeTruthy()
  })
})
