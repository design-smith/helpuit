import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AlertEngine, WebhookAlertSink, type Alert, type AlertSink } from './alerts.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** Real in-memory sink — records what it was sent. */
function recordingSink(): AlertSink & { sent: Alert[] } {
  const sent: Alert[] = []
  return { sent, send: async (a) => void sent.push(a) }
}

const clear = { spendToday: 0, dayCap: 1000, reproAttempts: 0, reproFailures: 0, escalations: 0 }

describe('AlertEngine', () => {
  it('fires a budget warning past the ratio, escalating to critical at/over the cap', async () => {
    const warn = recordingSink()
    await new AlertEngine({ budgetWarnRatio: 0.8 }, warn).evaluate({ ...clear, spendToday: 850, dayCap: 1000 })
    expect(warn.sent).toHaveLength(1)
    expect(warn.sent[0]).toMatchObject({ kind: 'budget', severity: 'warn' })

    const crit = recordingSink()
    await new AlertEngine({ budgetWarnRatio: 0.8 }, crit).evaluate({ ...clear, spendToday: 1000, dayCap: 1000 })
    expect(crit.sent[0]).toMatchObject({ kind: 'budget', severity: 'critical' })
  })

  it('fires a repro-failure alert only with enough sample', async () => {
    const sink = recordingSink()
    const engine = new AlertEngine({ reproFailureRate: 0.7, reproFailureMinSample: 5 }, sink)

    await engine.evaluate({ ...clear, reproAttempts: 2, reproFailures: 2 }) // below sample
    expect(sink.sent).toHaveLength(0)

    await engine.evaluate({ ...clear, reproAttempts: 10, reproFailures: 8 }) // 80% fail
    expect(sink.sent.map((a) => a.kind)).toEqual(['repro_failure'])
  })

  it('fires an escalation-spike alert and stays silent when all is well', async () => {
    const spike = recordingSink()
    await new AlertEngine({ escalationSpike: 3 }, spike).evaluate({ ...clear, escalations: 4 })
    expect(spike.sent.map((a) => a.kind)).toEqual(['escalation_spike'])

    const quiet = recordingSink()
    await new AlertEngine({ budgetWarnRatio: 0.8, escalationSpike: 3, reproFailureRate: 0.7 }, quiet).evaluate(clear)
    expect(quiet.sent).toEqual([])
  })
})

describe('WebhookAlertSink', () => {
  it('POSTs the alert as JSON to the configured URL', async () => {
    const received: unknown[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push(JSON.parse(body))
        res.end('{}')
      })
    })
    servers.push(server)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/alerts`

    await new WebhookAlertSink(url).send({ kind: 'budget', severity: 'critical', message: 'over cap' })

    expect(received).toEqual([{ kind: 'budget', severity: 'critical', message: 'over cap' }])
  })
})
