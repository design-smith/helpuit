import { createHmac, timingSafeEqual } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import fastifyStatic from '@fastify/static'
import type { Metrics } from '@helpuit/observability'
import type { AdminApi } from '@helpuit/composition'
import { registerAdminRoutes } from './admin-routes.js'
import type { ActivityBus } from './activity.js'

/** Path prefixes that are API/ops — never served the SPA shell (kept as JSON 404s). */
const API_PREFIXES = ['/admin', '/webhooks', '/healthz', '/readyz', '/metrics']

/** Verify a GitHub webhook HMAC-SHA256 signature (`x-hub-signature-256`). */
export function verifyGitHubSignature(
  rawBody: string,
  secret: string,
  header: string | string[] | undefined,
): boolean {
  if (typeof header !== 'string') return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  if (header.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}

/** Constant-time string compare (false on length mismatch, no early-exit leak). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function verifyBearer(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  return constantTimeEqual(header.slice('Bearer '.length), token)
}

/** Default session lifetime for the operator-console cookie. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
/** Cookie name holding the stateless admin session token. */
export const SESSION_COOKIE = 'helpuit_admin'

/**
 * Mint a stateless session token `base64url(expiry).HMAC_SHA256(adminToken, expiry)`.
 * No session store — verification re-derives the HMAC from the admin token, so a
 * rotated admin token invalidates every outstanding session for free.
 */
export function signSession(adminToken: string, expiry: number): string {
  const payload = Buffer.from(String(expiry)).toString('base64url')
  const mac = createHmac('sha256', adminToken).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

/** Verify a session token's HMAC (constant-time) and that it hasn't expired. */
export function verifySession(
  sessionToken: string | undefined,
  adminToken: string,
  now: number,
): boolean {
  if (sessionToken === undefined) return false
  const dot = sessionToken.indexOf('.')
  if (dot < 0) return false
  const payload = sessionToken.slice(0, dot)
  const mac = sessionToken.slice(dot + 1)
  const expected = createHmac('sha256', adminToken).update(payload).digest('base64url')
  if (!constantTimeEqual(mac, expected)) return false
  const expiry = Number(Buffer.from(payload, 'base64url').toString())
  return Number.isFinite(expiry) && expiry > now
}

export interface ReadinessCheck {
  name: string
  /** Returns true when the dependency is reachable/healthy. */
  check: () => Promise<boolean>
}

/** Context the orchestrator needs alongside the raw payload (carries the auth token). */
export interface InboundContext {
  customAttributes?: Record<string, unknown>
}

export interface ChatwootWebhook {
  /** Hands the parsed payload + context to the orchestrator. */
  intake: (payload: unknown, context: InboundContext) => Promise<unknown>
  /** Optional idempotency guard; `claim(id)` returns false for a redelivered event. */
  idempotency?: { claim: (id: string) => Promise<boolean> }
  /** Optional per-conversation rate limiter; `allow` returning false → 429. */
  rateLimiter?: { allow: (key: string, at: number) => boolean }
}

interface ChatwootWebhookPayload {
  id?: number | string
  conversation?: { id?: number; custom_attributes?: Record<string, unknown> }
  sender?: { custom_attributes?: Record<string, unknown> }
}

export interface GitHubWebhook {
  /** Handles a parsed GitHub event payload (lifecycle sync). */
  handle: (payload: unknown) => Promise<void>
  /** When set, the `x-hub-signature-256` HMAC is verified against this secret. */
  secret?: string
  idempotency?: { claim: (id: string) => Promise<boolean> }
}

export interface ServerOptions {
  /** Dependencies probed by /readyz (DB, queue, …). */
  readiness?: ReadinessCheck[]
  logger?: FastifyServerOptions['logger']
  /** Max request body size in bytes (default 1 MiB). */
  bodyLimit?: number
  /** When set, registers POST /webhooks/chatwoot. */
  chatwoot?: ChatwootWebhook
  /** When set, registers POST /webhooks/github. */
  github?: GitHubWebhook
  /** When set, registers GET /metrics and records webhook/outcome counters. */
  metrics?: Metrics
  /** When set, registers the bearer-token-gated founder dashboard API. */
  admin?: {
    token: string
    /** Legacy minimal overview handler (used only when `api` is absent). */
    overview?: () => Promise<unknown>
    /** Legacy pause/resume (used only when `api` is absent). */
    control?: {
      pause: (conversationId: number, note?: string) => Promise<void>
      resume: (conversationId: number) => Promise<void>
    }
    /** The full operator-console API. When present, the rich `/admin/*` routes are registered. */
    api?: AdminApi
    /** Add `Secure` to the session cookie (production over TLS). */
    secureCookie?: boolean
    /** When set, registers the SSE live-activity stream. */
    activity?: ActivityBus
    /** When set, registers POST /admin/config/restart, which invokes this to trigger a graceful restart. */
    onRestart?: () => void | Promise<void>
  }
  /** When set, serves the built operator-console SPA (static files + history fallback) from this dir. */
  staticDir?: string
}

/**
 * Build the Helpuit HTTP server. `/healthz` is liveness (always 200 if the
 * process is up); `/readyz` runs the configured readiness checks and returns 503
 * if any dependency is unreachable, so an orchestrator can gate traffic.
 */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: options.bodyLimit ?? 1_048_576 })

  // Capture the raw JSON body (needed verbatim for GitHub HMAC verification) while still parsing it.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    ;(request as { rawBody?: string }).rawBody = typeof body === 'string' ? body : body.toString()
    if (body === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  app.get('/healthz', async () => ({ status: 'ok' }))

  const metrics = options.metrics
  if (metrics !== undefined) {
    app.get('/metrics', async (_request, reply) => {
      reply.header('content-type', metrics.contentType)
      return await metrics.text()
    })
  }

  app.get('/readyz', async (_request, reply) => {
    const checks = options.readiness ?? []
    const results = await Promise.all(
      checks.map(async (c) => ({
        name: c.name,
        ok: await c.check().catch(() => false),
      })),
    )
    const ok = results.every((r) => r.ok)
    reply.code(ok ? 200 : 503)
    return { status: ok ? 'ok' : 'unavailable', checks: results }
  })

  const admin = options.admin
  if (admin !== undefined && admin.api !== undefined) {
    // Rich operator-console API (bearer OR session-cookie auth, login/logout, full routes).
    registerAdminRoutes(app, {
      token: admin.token,
      api: admin.api,
      secureCookie: admin.secureCookie,
      activity: admin.activity,
      onRestart: admin.onRestart,
    })
  } else if (admin !== undefined) {
    // Legacy minimal admin surface (kept for back-compat: overview + pause/resume only).
    const authed = (request: { headers: { authorization?: string | string[] } }): boolean =>
      verifyBearer(request.headers.authorization, admin.token)

    const overview = admin.overview
    if (overview !== undefined) {
      app.get('/admin/overview', async (request, reply) => {
        if (!authed(request)) {
          reply.code(401)
          return { status: 'unauthorized' }
        }
        return await overview()
      })
    }

    const control = admin.control
    if (control !== undefined) {
      const parseId = (request: { params: unknown }): number => Number((request.params as { id: string }).id)

      app.post('/admin/conversations/:id/pause', async (request, reply) => {
        if (!authed(request)) {
          reply.code(401)
          return { status: 'unauthorized' }
        }
        const id = parseId(request)
        if (!Number.isInteger(id)) {
          reply.code(400)
          return { status: 'invalid conversation id' }
        }
        const note = (request.body as { note?: string } | undefined)?.note
        await control.pause(id, note)
        return { status: 'paused', conversationId: id }
      })

      app.post('/admin/conversations/:id/resume', async (request, reply) => {
        if (!authed(request)) {
          reply.code(401)
          return { status: 'unauthorized' }
        }
        const id = parseId(request)
        if (!Number.isInteger(id)) {
          reply.code(400)
          return { status: 'invalid conversation id' }
        }
        await control.resume(id)
        return { status: 'resumed', conversationId: id }
      })
    }
  }

  const chatwoot = options.chatwoot
  if (chatwoot !== undefined) {
    app.post('/webhooks/chatwoot', async (request, reply) => {
      metrics?.recordWebhook('chatwoot')
      const payload = (request.body ?? {}) as ChatwootWebhookPayload

      // Idempotency: skip a webhook we've already acted on.
      const id = payload.id !== undefined ? String(payload.id) : undefined
      if (id !== undefined && chatwoot.idempotency !== undefined) {
        const claimed = await chatwoot.idempotency.claim(id)
        if (!claimed) {
          reply.code(200)
          return { status: 'duplicate' }
        }
      }

      // Per-conversation rate limit — blunts a flood before any expensive work.
      const conversationId = payload.conversation?.id
      if (chatwoot.rateLimiter !== undefined && conversationId !== undefined) {
        if (!chatwoot.rateLimiter.allow(String(conversationId), Date.now())) {
          reply.code(429)
          return { status: 'rate_limited' }
        }
      }

      const customAttributes = {
        ...(payload.conversation?.custom_attributes ?? {}),
        ...(payload.sender?.custom_attributes ?? {}),
      }
      const result = await chatwoot.intake(request.body, { customAttributes })
      const outcome = (result as { outcome?: unknown } | undefined)?.outcome
      if (typeof outcome === 'string') metrics?.recordOutcome(outcome)
      reply.code(200)
      return { status: 'ok' }
    })
  }

  const github = options.github
  if (github !== undefined) {
    app.post('/webhooks/github', async (request, reply) => {
      metrics?.recordWebhook('github')
      if (github.secret !== undefined) {
        const rawBody = (request as { rawBody?: string }).rawBody ?? ''
        if (!verifyGitHubSignature(rawBody, github.secret, request.headers['x-hub-signature-256'])) {
          reply.code(401)
          return { status: 'invalid signature' }
        }
      }

      const delivery = request.headers['x-github-delivery']
      if (typeof delivery === 'string' && github.idempotency !== undefined) {
        const claimed = await github.idempotency.claim(delivery)
        if (!claimed) {
          reply.code(200)
          return { status: 'duplicate' }
        }
      }

      await github.handle(request.body)
      reply.code(200)
      return { status: 'ok' }
    })
  }

  // Serve the operator-console SPA (static assets + client-side-routing fallback).
  // Registered last; `wildcard: false` means it never shadows the API/webhook
  // routes above. The not-found handler returns index.html ONLY for non-API GET
  // navigations that accept HTML — API typos stay JSON 404s (so the SPA's
  // fetch/401 handling isn't broken by an HTML 200).
  const staticDir = options.staticDir
  if (staticDir !== undefined) {
    void app.register(fastifyStatic, { root: staticDir, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0] ?? request.url
      const isApi = API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
      const wantsHtml = (request.headers.accept ?? '').includes('text/html')
      if (request.method === 'GET' && !isApi && wantsHtml) {
        return reply.sendFile('index.html')
      }
      reply.code(404)
      return { status: 'not_found' }
    })
  }

  return app
}
