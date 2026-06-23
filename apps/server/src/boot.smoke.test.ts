import { describe, it, expect, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

// A minimal but fully-valid config — the server boots without contacting any
// external service (clients are constructed lazily), so health/readiness work.
const CONFIG = `chatwoot: { baseUrl: http://127.0.0.1:1, accountId: 1, inboxId: 1 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: http://127.0.0.1:1
  sandboxRoles: [admin]
  login: { url: http://127.0.0.1:1/login }
docs:
  repoPaths: ["README.md", "docs/**/*.md"]
policy:
  playwrightEnabled: false
models:
  provider: openai-compatible
  tiers:
    guidance: { model: local }
    reasoning: { model: local }
    vision: { model: local }
`

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

let child: ChildProcess | undefined
afterAll(() => {
  child?.kill()
})

describe('production server boot (real process, real entrypoint)', () => {
  it('boots from apps/server main and serves /healthz + /readyz', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'helpuit-smoke-'))
    const cfgPath = join(dir, 'helpuit.config.yaml')
    writeFileSync(cfgPath, CONFIG)
    const port = await freePort()

    child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/main.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HELPUIT_CONFIG_PATH: cfgPath,
        PORT: String(port),
        DATABASE_URL: ':memory:',
        NODE_ENV: 'production',
        CHATWOOT_API_TOKEN: 'x',
        GITHUB_TOKEN: 'x',
        GITHUB_API_URL: 'http://127.0.0.1:1',
        IDENTITY_HMAC_SECRET: 'secret',
        OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1',
        SANDBOX_ADMIN_USER: 'u',
        SANDBOX_ADMIN_PASS: 'p',
      },
      stdio: 'ignore',
    })

    const base = `http://127.0.0.1:${port}`
    let healthy = false
    for (let i = 0; i < 60 && !healthy; i++) {
      try {
        const res = await fetch(`${base}/healthz`)
        if (res.ok) healthy = true
      } catch {
        // not listening yet
      }
      if (!healthy) await new Promise((r) => setTimeout(r, 500))
    }

    expect(healthy).toBe(true)
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: 'ok' })

    const ready = await fetch(`${base}/readyz`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ status: 'ok' })
  }, 60_000)

  it('auto-bootstraps the admin console with a printed token when none is set (FCW-01)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'helpuit-smoke-admin-'))
    const cfgPath = join(dir, 'helpuit.config.yaml')
    writeFileSync(cfgPath, CONFIG)
    const port = await freePort()

    // No HELPUIT_ADMIN_TOKEN — the server must generate one and still be reachable.
    const proc = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/main.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HELPUIT_CONFIG_PATH: cfgPath,
        PORT: String(port),
        DATABASE_URL: ':memory:',
        CHATWOOT_API_TOKEN: 'x',
        GITHUB_TOKEN: 'x',
        GITHUB_API_URL: 'http://127.0.0.1:1',
        IDENTITY_HMAC_SECRET: 'secret',
        OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1',
        SANDBOX_ADMIN_USER: 'u',
        SANDBOX_ADMIN_PASS: 'p',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let stdout = ''
    proc.stdout?.on('data', (c) => (stdout += String(c)))

    try {
      const base = `http://127.0.0.1:${port}`
      let healthy = false
      for (let i = 0; i < 60 && !healthy; i++) {
        try {
          if ((await fetch(`${base}/healthz`)).ok) healthy = true
        } catch {
          // not listening yet
        }
        if (!healthy) await new Promise((r) => setTimeout(r, 500))
      }
      expect(healthy).toBe(true)

      // Registered even with no admin env var: unauthenticated → 401 (NOT a silent 404).
      expect((await fetch(`${base}/admin/overview`)).status).toBe(401)

      // The generated token was printed once and actually logs in.
      const match = /Generated admin token: (\S+)/.exec(stdout)
      expect(match).not.toBeNull()
      const token = match![1]!
      const login = await fetch(`${base}/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      expect(login.status).toBe(200)
      expect(login.headers.get('set-cookie')).toContain('helpuit_admin=')

      // FCW-04: docs ingestion is live in the real process — paste a doc, see it listed.
      const authed = { authorization: `Bearer ${token}` }
      const add = await fetch(`${base}/admin/docs`, {
        method: 'POST',
        headers: { ...authed, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hours', text: 'Support hours are 9am to 5pm Pacific.' }),
      })
      expect(add.status).toBe(200)
      const listed = await fetch(`${base}/admin/docs`, { headers: authed })
      expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(1)

      // FCW-07: readiness is live in the real process (supervisor wired).
      const readiness = await fetch(`${base}/admin/readiness`, { headers: authed })
      expect(readiness.status).toBe(200)
      const r = (await readiness.json()) as { ready: boolean; blockers: unknown[]; warnings: unknown[] }
      expect(typeof r.ready).toBe('boolean')
      expect(Array.isArray(r.blockers)).toBe(true)
    } finally {
      proc.kill()
    }
  }, 60_000)
})
