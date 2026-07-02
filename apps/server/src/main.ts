import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { resolveEffectiveConfig, readBaselineYaml, type HelpuitConfig } from '@helpuit/config'
import {
  createDb,
  resolveDatabaseUrl,
  DrizzleProcessedEvents,
  RetentionService,
  DrizzleJobQueue,
  DrizzleDashboardService,
  DrizzleConfigStore,
  DrizzleSecretVault,
  DrizzleConfigAudit,
  DrizzleRestartFlag,
  DrizzleAlertHistory,
  DrizzleEmbeddingRepository,
} from '@helpuit/db'
import { listOpenIssues } from '@helpuit/github'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import { Holder, ConfigSupervisor } from '@helpuit/runtime-config'
import {
  buildOrchestrator,
  buildIntercomConnection,
  buildFreshdeskConnection,
  buildHubSpotConnection,
  buildZendeskConnection,
  buildGitHubWebhookHandler,
  buildAdminApi,
  resolveAdminToken,
  provisionManifest,
  provisionDocs,
  autoSetupChatwoot,
  buildEmbedder,
  sweepLinkDocs,
  syncIssueEmbeddings,
  githubOptionsFromConfig,
} from '@helpuit/composition'
import { RateLimiter } from '@helpuit/budget'
import type { BrowserDriver } from '@helpuit/reproduction'
import { createMetrics, AlertEngine, WebhookAlertSink, type AlertSink } from '@helpuit/observability'
import { Worker } from '@helpuit/queue'
import { buildServer, type WebhookConnection } from './server.js'
import { ActivityBus } from './activity.js'
import { isWeakEncryptionKey } from './setup/keys.js'
import { RESTART_EXIT_CODE } from './supervisor-loop.js'

/** Resolve the built operator-console SPA dir (apps/web/dist), or undefined if not built. */
function resolveWebDir(): string | undefined {
  // apps/server/src/main.ts → ../../web/dist
  const here = dirname(fileURLToPath(import.meta.url))
  const candidate = resolve(here, '../../web/dist')
  return existsSync(candidate) ? candidate : undefined
}

const DAY_MS = 86_400_000
const ALERT_INTERVAL_MS = 300_000 // evaluate operational alerts every 5 minutes
const POLL_INTERVAL_MS = 60_000 // poll each poll-only platform (Freshdesk, HubSpot) every minute

/**
 * Production entrypoint: load config, open the database, build the real
 * orchestrator, register the Chatwoot webhook (idempotent intake), expose
 * health/readiness, listen, and shut down gracefully.
 */
async function main(): Promise<void> {
  // `pnpm start` runs us under a small supervisor (supervisor.ts) that owns the
  // public tunnel (so its URL stays stable across restarts) and respawns us when the
  // console's "Restart now" asks for it. We signal that intent by exiting with
  // RESTART_EXIT_CODE; a plain stop exits 0. HELPUIT_PUBLIC_URL / HELPUIT_BEHIND_TUNNEL
  // are injected by the supervisor when a tunnel is active.
  let restartRequested = false

  // HELPUIT_CONFIG_PATH lets a container point at a mounted config; defaults to ./helpuit.config.yaml.
  // The DB url is env-only (it's needed before any config can be read). Open it,
  // then build the config/secret stores that layer over the file/env baseline.
  // Unset DATABASE_URL → a persistent local SQLite file (data survives restarts)
  // rather than an ephemeral in-memory DB. A remote libsql/Turso url uses
  // DATABASE_AUTH_TOKEN for managed/HA; a postgres:// url fails with guidance.
  const handle = await createDb(resolveDatabaseUrl(process.env.DATABASE_URL), {
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })

  const encryptionKey = process.env.HELPUIT_ENCRYPTION_KEY ?? 'helpuit-default-dev-key'
  // The encryption key seals the secret vault. A weak/unset key means secrets at rest
  // are sealed with a guessable key — loud-warn (emphatically in prod) but still boot.
  if (isWeakEncryptionKey(process.env.HELPUIT_ENCRYPTION_KEY)) {
    const prod = (process.env.NODE_ENV ?? 'development') === 'production'
    console.warn(
      `\n${prod ? '🔴 SECURITY' : '⚠'}: HELPUIT_ENCRYPTION_KEY is unset or weak — the secret vault is sealed with a guessable key.`,
    )
    console.warn('   Run `pnpm run setup` to generate a strong, stable key before storing real secrets.')
    if (prod) console.warn('   Running in production with a weak key leaves secrets at rest effectively unprotected.\n')
  }
  const configStore = new DrizzleConfigStore(handle.db)
  const vault = new DrizzleSecretVault(handle.db, new SecretBox(deriveKey(encryptionKey)))
  const configAudit = new DrizzleConfigAudit(handle.db)
  const restartFlag = new DrizzleRestartFlag(handle.db)
  await restartFlag.clear() // this restart just applied any pending secret/restart-class changes

  // Effective config = file/env baseline → DB structural overrides → DB secrets.
  // Lenient: the app BOOTS even with unset secrets (the operator fills them in the
  // console); they're reported here and surfaced in the UI.
  const baselineYaml = readBaselineYaml(process.env.HELPUIT_CONFIG_PATH)
  const { secrets: vaultSecrets, unreadable } = await vault.openAll()
  if (unreadable.length > 0) {
    console.warn(`secret vault entries unreadable (encryption key changed?): ${unreadable.join(', ')}`)
  }
  const effective = resolveEffectiveConfig({
    baselineYaml,
    env: process.env,
    structural: await configStore.getAll(),
    secrets: vaultSecrets,
  })
  const config = effective.config

  // Behind the tunnel, (re)point the Chatwoot webhook at the CURRENT public URL so a
  // connected inbox keeps delivering even though a quick-tunnel URL changes per run.
  // Idempotent + best-effort: an unreachable Chatwoot is reported, never fatal.
  if (process.env.HELPUIT_BEHIND_TUNNEL === '1' && config.chatwoot.apiToken !== '' && config.runtime.publicUrl !== undefined) {
    const synced = await autoSetupChatwoot({
      baseUrl: config.chatwoot.baseUrl,
      token: config.chatwoot.apiToken,
      accountId: config.chatwoot.accountId,
      publicUrl: config.runtime.publicUrl,
    })
    console.log(
      synced.ok
        ? `Chatwoot webhook pointed at the tunnel — ${synced.detail}`
        : `Chatwoot tunnel reconcile skipped — ${synced.detail}`,
    )
  }

  // Provision the feature manifest so configuration actually turns on L3a static
  // investigation + L1 code-grounding: a confirmed manifest in the store wins,
  // else it's seeded from config.features (FCW-02), else it's auto-drafted from the
  // connected repo (FCW-03), else the orchestrator stays docs-only. Boot-safe.
  const manifest = await provisionManifest(config, { db: handle.db })
  if (manifest !== undefined) {
    console.log(`feature manifest active (${manifest.features.length} features) — code-grounding + static investigation on`)
  }

  // Grounding docs: one LIVE index shared into every orchestrator build, warmed
  // at boot from the store (operator-pasted docs, FCW-04) AND from markdown pulled
  // out of the connected repo at config.docs.repoPaths (FCW-05). Docs pasted in the
  // console ground L1 immediately and survive config rebuilds; repo docs are
  // re-derived each boot. Boot-safe — an unreachable repo degrades to store docs.
  const docs = await provisionDocs(config, { db: handle.db })

  // L3b dynamic reproduction (FCW-06): construct the real Playwright browser driver
  // only when the founder enabled it AND sandbox creds exist — and only then load
  // the heavy playwright module. Any failure to load degrades to no reproduction,
  // never blocking boot; the driver launches Chromium lazily on first use.
  let browserDriver: BrowserDriver | undefined
  if (config.policy.playwrightEnabled && Object.keys(config.reproduction.sandboxAccounts).length > 0) {
    try {
      const { PlaywrightBrowserDriver } = await import('@helpuit/playwright')
      browserDriver = new PlaywrightBrowserDriver({
        targetUrl: config.reproduction.targetUrl,
        login: config.reproduction.login,
        env: process.env,
      })
      console.log('dynamic reproduction enabled (Playwright) — suspected bugs reproduce in a sandbox')
    } catch (error) {
      console.warn(`reproduction disabled: could not load Playwright (${error instanceof Error ? error.message : String(error)})`)
    }
  }

  // The orchestrator lives behind a swappable holder; the supervisor rebuilds and
  // swaps it when a live structural change is applied from the console.
  const buildOrch = (cfg: HelpuitConfig) =>
    buildOrchestrator(cfg, { db: handle.db, manifest, docsIndex: docs.index, browserDriver })
  const holder = new Holder(buildOrch(config))
  const supervisor = new ConfigSupervisor({
    holder,
    rebuild: buildOrch,
    initialConfig: config,
    baselineYaml,
    env: process.env,
    configStore,
    vault,
    audit: configAudit,
    restartFlag,
  })

  // Second support platform (Intercom): built once at boot from config. Its
  // orchestrator shares every L1–L4 collaborator but replies through the Intercom
  // client and namespaces state `intercom:<id>`. The worker dispatches to it by
  // connectionId; Chatwoot jobs (no connectionId) use the live-swappable holder.
  // ponytail: built once — a change to Intercom creds needs a restart (the holder's
  //   live swap covers Chatwoot). Add a per-connection holder if that bites.
  const intercomConnection = buildIntercomConnection(config)
  const freshdeskConnection = buildFreshdeskConnection(config)
  const hubspotConnection = buildHubSpotConnection(config)
  const zendeskConnection = buildZendeskConnection(config)
  const connectionOrchestrators = new Map<string, ReturnType<typeof buildOrchestrator>>()
  for (const connection of [intercomConnection, freshdeskConnection, hubspotConnection, zendeskConnection]) {
    if (connection !== undefined) {
      connectionOrchestrators.set(
        connection.connectionId,
        buildOrchestrator(config, { db: handle.db, manifest, docsIndex: docs.index, browserDriver, connection }),
      )
    }
  }

  const idempotency = new DrizzleProcessedEvents(handle.db, 'chatwoot')

  // Real-time activity feed (SSE): the worker publishes outcomes here as it
  // processes investigations; connected consoles stream them live.
  const activity = new ActivityBus()

  // Process/runtime metrics on in production; off in dev to keep the scrape quiet.
  const metrics = createMetrics({ defaultMetrics: config.runtime.nodeEnv === 'production' })

  // Async pipeline: the webhook enqueues a durable job and returns immediately;
  // the worker runs the (slow) investigation off the request path, with retries.
  // The handler reads the orchestrator through the holder so a live config swap
  // is picked up by the next job (in-flight jobs finish on their captured one).
  const queue = new DrizzleJobQueue(handle.db)
  const worker = new Worker(
    queue,
    {
      investigation: async (job) => {
        const { payload, context, connectionId } = job.payload as {
          payload: unknown
          context: { customAttributes?: Record<string, unknown> }
          connectionId?: string
        }
        // Route to the connection's orchestrator; Chatwoot (no connectionId) → the holder.
        const orchestrator =
          connectionId !== undefined ? connectionOrchestrators.get(connectionId) ?? holder.get() : holder.get()
        const result = await orchestrator.handleInbound(payload, context)
        const outcome = (result as { outcome?: unknown } | undefined)?.outcome
        if (typeof outcome === 'string') {
          metrics.recordOutcome(outcome)
          const conversationId = (payload as { conversation?: { id?: number } } | undefined)?.conversation?.id
          activity.publish({ type: 'outcome', at: Date.now(), data: { outcome, conversationId } })
        }
      },
    },
    { concurrency: 2 },
  )

  // Founder dashboard + takeover + config. The operator console (apps/web) is the
  // UI over this admin API. The admin token is auto-bootstrapped — env wins, else
  // the vaulted one is reused, else one is generated + persisted — so the console
  // is ALWAYS reachable even with nothing configured (never a silent 404).
  const dashboard = new DrizzleDashboardService(handle.db) // also feeds the alert engine below
  const admin = await resolveAdminToken({ vault, envToken: process.env.HELPUIT_ADMIN_TOKEN })
  const webDir = resolveWebDir()
  if (webDir === undefined) {
    console.warn('operator console UI not built — run `pnpm --filter @helpuit/web build` (serving API only for now).')
  }

  // Webhook-based platform connections (Intercom, Zendesk, …) behind /webhooks/:connectionId:
  // same async intake as Chatwoot, signature-verified per the adapter and tagged with
  // connectionId so the worker routes to the right orchestrator. Each is live-toggled.
  const webhookConnections: Record<string, WebhookConnection> = {}
  const enqueueConnection =
    (connectionId: string): WebhookConnection['intake'] =>
    (payload, context) => {
      activity.publish({ type: 'received', at: Date.now(), data: {} })
      return queue.enqueue({ type: 'investigation', payload: { connectionId, payload, context } })
    }
  const connectionRateLimiter = (): RateLimiter =>
    new RateLimiter({ limit: config.budget.rateLimit.max, windowMs: config.budget.rateLimit.windowMs })
  if (intercomConnection !== undefined) {
    webhookConnections[intercomConnection.connectionId] = {
      intake: enqueueConnection(intercomConnection.connectionId),
      verify: intercomConnection.verify,
      extractContext: intercomConnection.extractContext,
      enabled: () => supervisor.currentConfig().integrations.intercom,
      idempotency: new DrizzleProcessedEvents(handle.db, 'intercom'),
      rateLimiter: connectionRateLimiter(),
      // Intercom fires a top-level notification id (idempotency) + a conversation id (rate-limit).
      eventId: (p) => (p as { id?: string }).id,
      rateLimitKey: (p) => (p as { data?: { item?: { id?: string } } }).data?.item?.id,
    }
  }
  if (zendeskConnection !== undefined) {
    webhookConnections[zendeskConnection.connectionId] = {
      intake: enqueueConnection(zendeskConnection.connectionId),
      verify: zendeskConnection.verify,
      extractContext: zendeskConnection.extractContext,
      enabled: () => supervisor.currentConfig().integrations.zendesk,
      idempotency: new DrizzleProcessedEvents(handle.db, 'zendesk'),
      rateLimiter: connectionRateLimiter(),
      // The trigger sets event_id for dedup (when available); ticket id is the rate-limit key.
      eventId: (p) => (p as { event_id?: string }).event_id,
      rateLimitKey: (p) => {
        const t = (p as { ticket_id?: string | number }).ticket_id
        return t === undefined ? undefined : String(t)
      },
    }
  }

  const app = buildServer({
    // Dev keeps the console quiet (warnings+errors only); production emits full structured logs.
    logger: config.runtime.nodeEnv === 'production' ? true : { level: 'warn' },
    metrics,
    staticDir: webDir,
    admin: {
      token: admin.token,
      api: buildAdminApi(config, { db: handle.db, configController: supervisor, docs }),
      secureCookie: config.runtime.nodeEnv === 'production',
      activity,
      // One-click restart (FCW-15): run the graceful shutdown below, exiting with
      // RESTART_EXIT_CODE so the supervisor (local) or a process manager (Docker
      // restart: unless-stopped / systemd) brings us back; boot clears the flag.
      onRestart: () => {
        restartRequested = true
        void shutdown()
      },
    },
    readiness: [
      {
        name: 'database',
        check: async () => {
          await handle.client.execute('SELECT 1')
          return true
        },
      },
    ],
    chatwoot: {
      intake: (payload, context) => {
        activity.publish({
          type: 'received',
          at: Date.now(),
          data: { conversationId: (payload as { conversation?: { id?: number } } | undefined)?.conversation?.id },
        })
        return queue.enqueue({ type: 'investigation', payload: { payload, context } })
      },
      idempotency,
      rateLimiter: new RateLimiter({
        limit: config.budget.rateLimit.max,
        windowMs: config.budget.rateLimit.windowMs,
      }),
      // Live console toggle: when Chatwoot is paused, the webhook is acknowledged
      // but never enqueued (read from the supervisor's live config, no restart).
      enabled: () => supervisor.currentConfig().integrations.chatwoot,
    },
    connections: Object.keys(webhookConnections).length > 0 ? webhookConnections : undefined,
    github: {
      handle: buildGitHubWebhookHandler(config, { db: handle.db }),
      secret: config.github.webhookSecret,
      idempotency: new DrizzleProcessedEvents(handle.db, 'github'),
    },
  })

  await app.listen({ port: config.runtime.port, host: '0.0.0.0' })
  worker.start()

  // The one thing the operator needs at a glance: where it's running.
  const rule = '─'.repeat(60)
  console.log(`\n${rule}`)
  console.log('  Helpuit is running')
  console.log(`    Local:  http://localhost:${config.runtime.port}`)
  if (config.runtime.publicUrl !== undefined && config.runtime.publicUrl !== '') {
    console.log(`    Live:   ${config.runtime.publicUrl}${process.env.HELPUIT_BEHIND_TUNNEL === '1' ? '   (cloudflared tunnel)' : ''}`)
  }
  console.log(`    Log in: ${admin.generated ? admin.token : 'use your HELPUIT_ADMIN_TOKEN'}`)
  if (effective.missingSecrets.length > 0) {
    console.log(`    Connect next (in the console): ${effective.missingSecrets.join(', ')}`)
  }
  console.log(`${rule}\n`)

  // Data retention: sweep expired investigations (and their encrypted evidence)
  // at startup and daily. 0 days = keep forever (sweep disabled).
  let retentionTimer: ReturnType<typeof setInterval> | undefined
  const retentionDays = config.retention.investigationDays
  if (retentionDays > 0) {
    const retention = new RetentionService(handle.db)
    const windowMs = retentionDays * DAY_MS
    const sweep = async (): Promise<void> => {
      try {
        const purged = await retention.purgeOlderThan(windowMs)
        app.log.info({ retention: purged, retentionDays }, 'retention sweep complete')
      } catch (error) {
        app.log.error({ err: error }, 'retention sweep failed')
      }
    }
    await sweep()
    retentionTimer = setInterval(() => void sweep(), DAY_MS)
    retentionTimer.unref() // never keep the process alive just for the sweep
  }

  // Knowledge sweep: re-scrape link docs and re-embed open GitHub issues at boot
  // and daily, keeping semantic retrieval and the known-issue matcher fresh.
  // Boot-safe and non-blocking: a failed sweep logs and the last-good corpus stays.
  const embedding = buildEmbedder(config)
  const knowledgeSweep = async (): Promise<void> => {
    try {
      const links = await sweepLinkDocs({ docs })
      let issues: { embedded: number; removed: number } | undefined
      if (embedding !== undefined && config.integrations.github) {
        issues = await syncIssueEmbeddings({
          listIssues: () => listOpenIssues(githubOptionsFromConfig(config)),
          embedder: embedding.embedder,
          store: new DrizzleEmbeddingRepository(handle.db),
          model: embedding.model,
        })
      }
      app.log.info({ links, issues }, 'knowledge sweep complete')
    } catch (error) {
      app.log.error({ err: error }, 'knowledge sweep failed')
    }
  }
  void knowledgeSweep()
  const knowledgeTimer = setInterval(() => void knowledgeSweep(), DAY_MS)
  knowledgeTimer.unref()

  // Operational alerting: evaluate budget/repro-failure/escalation thresholds over
  // a rolling 24h window and fire to a webhook (if configured) or the logs. Reads
  // the LIVE config each tick (via the supervisor) so threshold/budget changes
  // applied in the console take effect without a restart. Every fired alert is
  // ALSO recorded to history so the console can show what tripped and when.
  const alertHistory = new DrizzleAlertHistory(handle.db)
  const baseSink: AlertSink =
    config.security.alertWebhookUrl !== undefined && config.security.alertWebhookUrl !== ''
      ? new WebhookAlertSink(config.security.alertWebhookUrl)
      : { send: async (alert) => void app.log.warn({ alert }, 'helpuit alert') }
  const alertSink: AlertSink = {
    send: async (alert) => {
      await alertHistory.record(alert).catch((err: unknown) => app.log.error({ err }, 'alert persist failed'))
      await baseSink.send(alert)
    },
  }
  const evaluateAlerts = async (): Promise<void> => {
    try {
      const live = supervisor.currentConfig()
      const alertEngine = new AlertEngine(
        {
          budgetWarnRatio: live.alerts.budgetWarnRatio,
          reproFailureRate: live.alerts.reproFailureRate,
          reproFailureMinSample: live.alerts.reproFailureMinSample,
          escalationSpike: live.alerts.escalationSpike,
        },
        alertSink,
      )
      const snapshot = await dashboard.alertSnapshot({
        since: Date.now() - DAY_MS,
        dayCap: live.budget.perDay,
      })
      await alertEngine.evaluate(snapshot)
    } catch (error) {
      app.log.error({ err: error }, 'alert evaluation failed')
    }
  }
  const alertTimer = setInterval(() => void evaluateAlerts(), ALERT_INTERVAL_MS)
  alertTimer.unref()

  // Poll-only platforms (Freshdesk, HubSpot) have no inbound webhook — poll each for
  // new customer messages and feed them into the same async pipeline (deduped by
  // messageId, dispatched by connectionId). Each is live-toggled via the supervisor.
  // ponytail: in-memory cursor per connection starting at boot — a restart re-polls
  //   from "now", so messages that arrived while down are missed (dedup only prevents
  //   re-processing). Persist the cursor if that gap matters.
  const pollTimers: Array<ReturnType<typeof setInterval>> = []
  for (const connection of [freshdeskConnection, hubspotConnection]) {
    if (connection?.poll === undefined) continue
    const poll = connection.poll
    const { connectionId, extractContext } = connection
    const events = new DrizzleProcessedEvents(handle.db, connectionId)
    let cursor = new Date().toISOString()
    const runPoll = async (): Promise<void> => {
      const live = supervisor.currentConfig().integrations as Record<string, boolean | undefined>
      if (live[connectionId] === false) return
      const nextCursor = new Date().toISOString()
      try {
        for (const m of await poll(cursor)) {
          if (!(await events.claim(m.messageId))) continue // already handled (overlapping poll)
          const context = extractContext?.(m) ?? {}
          activity.publish({ type: 'received', at: Date.now(), data: { conversationId: m.conversationId } })
          await queue.enqueue({ type: 'investigation', payload: { connectionId, payload: m, context } })
        }
        cursor = nextCursor // advance only after a clean poll so a failure re-covers the same window
      } catch (error) {
        app.log.error({ err: error, connectionId }, 'platform poll failed')
      }
    }
    void runPoll()
    const timer = setInterval(() => void runPoll(), POLL_INTERVAL_MS)
    timer.unref()
    pollTimers.push(timer)
  }

  const shutdown = async (): Promise<void> => {
    if (retentionTimer !== undefined) clearInterval(retentionTimer)
    for (const timer of pollTimers) clearInterval(timer)
    clearInterval(alertTimer)
    await app.close() // stop accepting new webhooks (forceCloseConnections drops SSE/keep-alives)
    await worker.stop() // drain in-flight investigations
    handle.close()
    // RESTART_EXIT_CODE asks the supervisor to respawn (apply restart-class changes);
    // any other stop (SIGINT/SIGTERM) exits 0 so the supervisor tears down for good.
    process.exit(restartRequested ? RESTART_EXIT_CODE : 0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
}

main().catch((error: unknown) => {
  console.error('Failed to start Helpuit server:', error)
  process.exit(1)
})
