import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AdminApi } from '@helpuit/composition'
import type { DocSource } from '@helpuit/db'
import { RateLimiter } from '@helpuit/budget'
import type { ActivityBus } from './activity.js'

/** Doc sources accepted from the console (repo docs are ephemeral, never posted). */
const DOC_SOURCES: readonly string[] = ['upload', 'gdrive', 'dropbox', 'sharepoint']
import {
  constantTimeEqual,
  verifyBearer,
  verifySession,
  signSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './server.js'

export interface AdminRoutesOptions {
  token: string
  api: AdminApi
  /** Add `Secure` to the session cookie (production over TLS). */
  secureCookie?: boolean
  /** When set, registers the SSE live-activity stream at GET /admin/stream. */
  activity?: ActivityBus
  /** When set, registers POST /admin/config/restart, which calls this to trigger a graceful restart. */
  onRestart?: () => void | Promise<void>
  now?: () => number
}

/** Read a single named cookie from a `Cookie` header without adding a cookie plugin. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** Coerce a query value to a positive int, or undefined. */
function intParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function listOptions(query: Record<string, unknown>) {
  return {
    limit: intParam(query.limit),
    offset: intParam(query.offset),
    order: query.order === 'oldest' ? ('oldest' as const) : query.order === 'newest' ? ('newest' as const) : undefined,
  }
}

/**
 * Registers the full operator-console admin API. Every route is gated by EITHER a
 * bearer token (programmatic clients) OR a session cookie minted by `/admin/login`
 * (the SPA). Mutations are POST-only and the session cookie is `SameSite=Strict`,
 * so no CSRF token is needed for the same-origin SPA.
 */
export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const { token, api } = options
  const now = options.now ?? (() => Date.now())
  // Blunt brute-forcing of the login endpoint (per client IP).
  const loginLimiter = new RateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 })

  const isAuthed = (request: FastifyRequest): boolean => {
    if (verifyBearer(request.headers.authorization, token)) return true
    const cookie = readCookie(request.headers.cookie, SESSION_COOKIE)
    return verifySession(cookie, token, now())
  }

  /** Wrap a handler so it 401s unless authed. */
  const guard =
    (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
      if (!isAuthed(request)) {
        reply.code(401)
        return { status: 'unauthorized' }
      }
      return handler(request, reply)
    }

  const paramId = (request: FastifyRequest): string => (request.params as { id: string }).id

  // ---- auth ----
  app.post('/admin/login', async (request, reply) => {
    if (!loginLimiter.allow(request.ip, now())) {
      reply.code(429)
      return { status: 'rate_limited' }
    }
    const provided = (request.body as { token?: string } | undefined)?.token
    if (typeof provided !== 'string' || !constantTimeEqual(provided, token)) {
      reply.code(401)
      return { status: 'unauthorized' }
    }
    const session = signSession(token, now() + SESSION_TTL_MS)
    const attrs = [
      `${SESSION_COOKIE}=${session}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/admin',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
      ...(options.secureCookie === true ? ['Secure'] : []),
    ]
    reply.header('set-cookie', attrs.join('; '))
    return { status: 'ok' }
  })

  app.post('/admin/logout', async (_request, reply) => {
    reply.header('set-cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0`)
    return { status: 'ok' }
  })

  // ---- dashboard ----
  app.get('/admin/overview', guard(() => api.overview()))
  app.get('/admin/alerts', guard(() => api.alerts()))

  // ---- investigations ----
  app.get(
    '/admin/investigations',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      const filter = {
        status: typeof q.status === 'string' ? (q.status as never) : undefined,
        level: typeof q.level === 'string' ? (q.level as never) : undefined,
        classification: typeof q.classification === 'string' ? (q.classification as never) : undefined,
        conversationId: intParam(q.conversationId),
        customerId: typeof q.customerId === 'string' ? q.customerId : undefined,
        // Conversations-page relation filters (became a ticket / has open issue / needs draft review).
        ticket: q.ticket === 'true' ? true : undefined,
        openIssue: q.openIssue === 'true' ? true : undefined,
        pendingDraft: q.pendingDraft === 'true' ? true : undefined,
      }
      return api.listInvestigations(filter, listOptions(q))
    }),
  )

  app.get(
    '/admin/investigations/:id',
    guard(async (request, reply) => {
      const detail = await api.getInvestigation(paramId(request))
      if (detail === null) {
        reply.code(404)
        return { status: 'not_found' }
      }
      return detail
    }),
  )

  // Live conversation transcript (fetched from Chatwoot on demand) — keyed by investigation id.
  app.get(
    '/admin/conversations/:id/transcript',
    guard(async (request, reply) => {
      const result = await api.conversationTranscript(paramId(request))
      if (result === null) {
        reply.code(404)
        return { status: 'not_found' }
      }
      return result
    }),
  )

  app.get(
    '/admin/investigations/:id/audit',
    guard(async (request) => {
      const limit = intParam((request.query as Record<string, unknown>).limit)
      return { items: await api.investigationAudit(paramId(request), { limit }) }
    }),
  )

  app.get(
    '/admin/investigations/:id/evidence',
    guard(async (request) => ({ items: await api.investigationEvidence(paramId(request)) })),
  )

  app.get(
    '/admin/investigations/:id/spend',
    guard((request) => api.investigationSpend(paramId(request))),
  )

  // Gated full (decrypted) evidence content — fetched one artifact at a time.
  app.get(
    '/admin/evidence/:id',
    guard(async (request, reply) => {
      const artifact = await api.getEvidence(paramId(request))
      if (artifact === null) {
        reply.code(404)
        return { status: 'not_found' }
      }
      return artifact
    }),
  )

  // ---- tickets ----
  app.get(
    '/admin/tickets',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      const filter = {
        investigationId: typeof q.investigationId === 'string' ? q.investigationId : undefined,
        issueNumber: intParam(q.issueNumber),
        linked: q.linked === 'true' ? true : q.linked === 'false' ? false : undefined,
      }
      return api.listTickets(filter, listOptions(q))
    }),
  )

  // ---- issues (filed GitHub issue links) ----
  app.get(
    '/admin/issues',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      const status = q.status === 'open' || q.status === 'closed' ? q.status : undefined
      return api.listIssues(listOptions(q), { status })
    }),
  )
  app.post('/admin/issues/refresh', guard(() => api.refreshIssues()))

  // ---- drafts (approval queue) ----
  app.get(
    '/admin/drafts',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      const status: 'pending' | 'published' | 'rejected' =
        q.status === 'published' || q.status === 'rejected' ? q.status : 'pending'
      const filter = {
        status,
        investigationId: typeof q.investigationId === 'string' ? q.investigationId : undefined,
      }
      return api.listDrafts(filter, listOptions(q))
    }),
  )

  app.get(
    '/admin/drafts/:id',
    guard(async (request, reply) => {
      const draft = await api.getDraft(paramId(request))
      if (draft === null) {
        reply.code(404)
        return { status: 'not_found' }
      }
      return draft
    }),
  )

  const draftResultCode = (status: string): number =>
    status === 'published' || status === 'rejected'
      ? 200
      : status === 'not_found'
        ? 404
        : status === 'conflict'
          ? 409
          : 502

  app.post(
    '/admin/drafts/:id/publish',
    guard(async (request, reply) => {
      const result = await api.publishDraft(paramId(request))
      reply.code(draftResultCode(result.status))
      return result
    }),
  )

  app.post(
    '/admin/drafts/:id/reject',
    guard(async (request, reply) => {
      const reason = (request.body as { reason?: string } | undefined)?.reason
      const result = await api.rejectDraft(paramId(request), reason)
      reply.code(draftResultCode(result.status))
      return result
    }),
  )

  // ---- conversations / founder takeover ----
  app.get('/admin/conversations/paused', guard(async () => ({ items: await api.listPausedConversations() })))

  app.post(
    '/admin/conversations/:id/pause',
    guard(async (request, reply) => {
      const id = Number(paramId(request))
      if (!Number.isInteger(id)) {
        reply.code(400)
        return { status: 'invalid conversation id' }
      }
      const note = (request.body as { note?: string } | undefined)?.note
      await api.pauseConversation(id, note)
      return { status: 'paused', conversationId: id }
    }),
  )

  app.post(
    '/admin/conversations/:id/resume',
    guard(async (request, reply) => {
      const id = Number(paramId(request))
      if (!Number.isInteger(id)) {
        reply.code(400)
        return { status: 'invalid conversation id' }
      }
      await api.resumeConversation(id)
      return { status: 'resumed', conversationId: id }
    }),
  )

  // ---- jobs (queue + dead-letter management) ----
  app.get(
    '/admin/jobs',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      const filter = {
        status: typeof q.status === 'string' ? (q.status as never) : undefined,
        type: typeof q.type === 'string' ? q.type : undefined,
      }
      return api.listJobs(filter, listOptions(q))
    }),
  )

  app.get(
    '/admin/jobs/:id/logs',
    guard(async (request, reply) => {
      const logs = await api.jobLogs(paramId(request))
      if (logs === null) {
        reply.code(404)
        return { status: 'not_found' }
      }
      return logs
    }),
  )
  app.post('/admin/jobs/:id/retry', guard((request) => api.retryJob(paramId(request))))

  app.post(
    '/admin/jobs/purge',
    guard(async (request, reply) => {
      const status = (request.query as Record<string, unknown>).status
      if (status !== 'done' && status !== 'failed') {
        reply.code(400)
        return { status: 'invalid', message: 'status must be "done" or "failed"' }
      }
      return api.purgeJobs(status)
    }),
  )

  // ---- alerts history ----
  app.get(
    '/admin/alerts/history',
    guard(async (request) => {
      const limit = intParam((request.query as Record<string, unknown>).limit)
      return { items: await api.alertHistory(limit) }
    }),
  )

  // ---- live activity feed (SSE) ----
  const activity = options.activity
  if (activity !== undefined) {
    app.get('/admin/stream', (request, reply) => {
      if (!isAuthed(request)) {
        reply.code(401)
        return reply.send({ status: 'unauthorized' })
      }
      reply.hijack()
      const res = reply.raw
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write('retry: 3000\n\n')
      const unsubscribe = activity.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`))
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
      request.raw.on('close', () => {
        clearInterval(ping)
        unsubscribe()
      })
    })
  }

  // ---- GitHub App connect flow ----
  // The manifest endpoint is a normal authed SPA fetch. The callback/installed
  // routes are TOP-LEVEL redirects coming back from github.com, so the
  // SameSite=Strict session cookie isn't sent — they authenticate via a signed
  // `state` token minted here instead.
  app.get(
    '/admin/connect/github/manifest',
    guard(async () => ({ ...api.githubConnect.manifest(), state: signSession(token, now() + SESSION_TTL_MS) })),
  )

  app.get('/admin/connect/github/callback', async (request, reply) => {
    const q = request.query as Record<string, unknown>
    if (typeof q.state !== 'string' || !verifySession(q.state, token, now())) {
      reply.code(401)
      return { status: 'unauthorized' }
    }
    if (typeof q.code !== 'string') {
      reply.code(400)
      return { status: 'invalid', message: 'missing code' }
    }
    const { installUrl } = await api.githubConnect.completeManifest(q.code)
    // Carry a fresh state into the install step (GitHub passes it through).
    const sep = installUrl.includes('?') ? '&' : '?'
    return reply.redirect(`${installUrl}${sep}state=${encodeURIComponent(signSession(token, now() + SESSION_TTL_MS))}`)
  })

  app.get('/admin/connect/github/installed', async (request, reply) => {
    const q = request.query as Record<string, unknown>
    if (typeof q.state !== 'string' || !verifySession(q.state, token, now())) {
      reply.code(401)
      return { status: 'unauthorized' }
    }
    const installationId = Number(q.installation_id)
    if (Number.isInteger(installationId)) await api.githubConnect.completeInstall(installationId)
    return reply.redirect('/connections?github=connected')
  })

  // ---- connect Supabase (OAuth, for L2 account data) ----
  const supabase = api.supabaseConnect
  app.get(
    '/admin/connect/supabase/manifest',
    guard(async () => {
      const state = signSession(token, now() + SESSION_TTL_MS)
      return { url: await supabase.authorizeUrl(state), state }
    }),
  )
  // Cross-site redirect from Supabase — state-gated, not cookie-gated.
  app.get('/admin/connect/supabase/callback', async (request, reply) => {
    const q = request.query as Record<string, unknown>
    if (typeof q.state !== 'string' || !verifySession(q.state, token, now())) {
      reply.code(401)
      return { status: 'unauthorized' }
    }
    if (typeof q.code !== 'string') {
      reply.code(400)
      return { status: 'invalid', message: 'missing code' }
    }
    await supabase.completeCallback(q.code)
    return reply.redirect('/settings/connections?supabase=connected')
  })
  app.get('/admin/connect/supabase/projects', guard(() => supabase.listProjects()))
  app.get(
    '/admin/connect/supabase/tables',
    guard((request) => supabase.listTables(String((request.query as Record<string, unknown>).ref ?? ''))),
  )
  app.get(
    '/admin/connect/supabase/columns',
    guard((request) => {
      const q = request.query as Record<string, unknown>
      return supabase.listColumns(String(q.ref ?? ''), String(q.table ?? ''))
    }),
  )
  app.post(
    '/admin/connect/supabase/select',
    guard(async (request, reply) => {
      const b = request.body as { ref?: string; table?: string; userColumn?: string; columns?: string[] } | undefined
      if (
        b?.ref === undefined ||
        b.table === undefined ||
        b.userColumn === undefined ||
        !Array.isArray(b.columns) ||
        b.columns.length === 0
      ) {
        reply.code(400)
        return { status: 'invalid', message: 'ref, table, userColumn, columns[] required' }
      }
      const result = await supabase.selectProject({ ref: b.ref, table: b.table, userColumn: b.userColumn, columns: b.columns })
      if (!result.ok) reply.code(400)
      return result
    }),
  )

  // ---- setup readiness (blockers/warnings/ready), only when a supervisor is wired ----
  const readiness = api.readiness
  if (readiness !== undefined) {
    app.get('/admin/readiness', guard(() => readiness()))
  }

  // ---- connector tests (real provider checks), only when a supervisor is wired ----
  const testLlm = api.testLlm
  if (testLlm !== undefined) {
    app.post('/admin/test/llm', guard(() => testLlm()))
  }
  const testIdentity = api.testIdentity
  if (testIdentity !== undefined) {
    app.post('/admin/test/identity', guard(() => testIdentity()))
  }
  const testGitHub = api.testGitHub
  if (testGitHub !== undefined) {
    app.post('/admin/test/github', guard(() => testGitHub()))
  }

  // ---- connections: disconnect an integration (clear creds + reset; restart-class) ----
  const disconnectConnection = api.disconnectConnection
  if (disconnectConnection !== undefined) {
    app.post(
      '/admin/connections/:id/disconnect',
      guard(async (request, reply) => {
        const result = await disconnectConnection((request.params as { id: string }).id)
        if (!result.ok) reply.code(400)
        return result
      }),
    )
  }

  // ---- customer-token hand-off: set the verified token on a Chatwoot conversation ----
  app.post(
    '/admin/chatwoot/set-token',
    guard(async (request, reply) => {
      const body = request.body as { conversationId?: unknown; authToken?: unknown } | undefined
      const conversationId = typeof body?.conversationId === 'number' ? body.conversationId : Number(body?.conversationId)
      const authToken = typeof body?.authToken === 'string' ? body.authToken : ''
      if (!Number.isInteger(conversationId) || authToken === '') {
        reply.code(400)
        return { status: 'invalid', message: 'conversationId (number) and authToken (string) are required.' }
      }
      return api.setChatwootAuthToken({ conversationId, authToken })
    }),
  )

  // ---- L2 query-route scaffold (Supabase Edge Function generator) ----
  app.post(
    '/admin/scaffold/supabase-query-route',
    guard(async (request, reply) => {
      const body = request.body as
        | { table?: unknown; userColumn?: unknown; allowedColumns?: unknown; functionName?: unknown; routeName?: unknown; supabaseUrl?: unknown }
        | undefined
      const table = typeof body?.table === 'string' ? body.table.trim() : ''
      const userColumn = typeof body?.userColumn === 'string' ? body.userColumn.trim() : ''
      const allowedColumns = Array.isArray(body?.allowedColumns)
        ? body!.allowedColumns.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        : []
      if (table === '' || userColumn === '' || allowedColumns.length === 0) {
        reply.code(400)
        return { status: 'invalid', message: 'table, userColumn, and a non-empty allowedColumns[] are required.' }
      }
      return api.supabaseQueryRouteScaffold({
        table,
        userColumn,
        allowedColumns,
        ...(typeof body?.functionName === 'string' ? { functionName: body.functionName } : {}),
        ...(typeof body?.routeName === 'string' ? { routeName: body.routeName } : {}),
        ...(typeof body?.supabaseUrl === 'string' ? { supabaseUrl: body.supabaseUrl } : {}),
      })
    }),
  )

  // ---- feature manifest review/edit ----
  app.get('/admin/manifest', guard(() => api.getManifest()))
  app.put(
    '/admin/manifest',
    guard(async (request, reply) => {
      const result = await api.saveManifest(request.body)
      if (!result.ok) reply.code(422)
      return result
    }),
  )

  // ---- one-click restart (graceful exit; a process supervisor restarts us) ----
  const onRestart = options.onRestart
  if (onRestart !== undefined) {
    let restarting = false
    app.post(
      '/admin/config/restart',
      guard(async () => {
        const reasons = api.config !== undefined ? (await api.config.restartStatus()).reasons : []
        // Fire exactly one exit signal, deferred so this 200 reaches the client first.
        if (!restarting) {
          restarting = true
          setImmediate(() => void onRestart())
        }
        return { status: 'restarting', reasons }
      }),
    )
  }
  app.post(
    '/admin/test/chatwoot',
    guard((request) => {
      const body = request.body as { baseUrl?: unknown; token?: unknown } | undefined
      const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : ''
      const token = typeof body?.token === 'string' ? body.token : ''
      return api.validateChatwoot({ baseUrl, token })
    }),
  )
  app.post(
    '/admin/setup/chatwoot',
    guard((request) => {
      const body = request.body as { baseUrl?: unknown; token?: unknown; accountId?: unknown } | undefined
      const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : ''
      const token = typeof body?.token === 'string' ? body.token : ''
      const accountId = typeof body?.accountId === 'number' ? body.accountId : Number(body?.accountId)
      return api.setupChatwoot({ baseUrl, token, accountId })
    }),
  )

  // ---- grounding docs (paste/upload → L1), only when the docs service is wired ----
  const docs = api.docs
  if (docs !== undefined) {
    app.get('/admin/docs', guard(async () => ({ items: await docs.list() })))

    app.post(
      '/admin/docs',
      guard(async (request, reply) => {
        const body = request.body as { title?: unknown; text?: unknown; source?: unknown; externalId?: unknown } | undefined
        const text = body?.text
        if (typeof text !== 'string' || text.trim() === '') {
          reply.code(400)
          return { status: 'invalid', message: 'text (non-empty string) required' }
        }
        const title = typeof body?.title === 'string' && body.title !== '' ? body.title : undefined
        const source = DOC_SOURCES.includes(body?.source as string) ? (body!.source as DocSource) : 'upload'
        const externalId = typeof body?.externalId === 'string' && body.externalId !== '' ? body.externalId : undefined
        // A stable externalId means "this is the same file" → upsert (refresh in place);
        // otherwise it's a one-off paste/upload → insert.
        return externalId !== undefined ? docs.importDoc({ source, externalId, title, text }) : docs.add({ title, text, source })
      }),
    )

    app.delete(
      '/admin/docs/:id',
      guard(async (request, reply) => {
        const removed = await docs.remove(paramId(request))
        if (!removed) {
          reply.code(404)
          return { status: 'not_found' }
        }
        return { status: 'removed' }
      }),
    )
  }

  // ---- config + secrets (only when a supervisor is wired) ----
  const config = api.config
  if (config !== undefined) {
    app.get('/admin/config/effective', guard(() => config.effective()))
    app.get('/admin/config/restart-status', guard(() => config.restartStatus()))

    app.put(
      '/admin/config/section/:section',
      guard(async (request, reply) => {
        const section = (request.params as { section: string }).section
        const result = await config.applyStructural(section, request.body)
        if (!result.ok) {
          reply.code(result.code === 'unknown_section' ? 400 : 422)
        }
        return result
      }),
    )

    app.put(
      '/admin/config/secret/:key',
      guard(async (request, reply) => {
        const key = (request.params as { key: string }).key
        const value = (request.body as { value?: unknown } | undefined)?.value
        if (typeof value !== 'string' || value === '') {
          reply.code(400)
          return { status: 'invalid', message: 'value (non-empty string) required' }
        }
        return config.setSecret(key, value)
      }),
    )

    app.delete(
      '/admin/config/secret/:key',
      guard((request) => config.deleteSecret((request.params as { key: string }).key)),
    )
  }
}
