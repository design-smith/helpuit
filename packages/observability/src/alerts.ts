export type AlertSeverity = 'warn' | 'critical'

export interface Alert {
  kind: 'budget' | 'repro_failure' | 'escalation_spike'
  severity: AlertSeverity
  message: string
}

/** Where alerts go (a webhook, a log, a pager). */
export interface AlertSink {
  send(alert: Alert): Promise<void>
}

export interface AlertThresholds {
  /** Warn when spendToday/dayCap ≥ this (critical at ≥ 1.0). */
  budgetWarnRatio?: number
  /** Alert when the reproduction failure rate ≥ this… */
  reproFailureRate?: number
  /** …but only once at least this many attempts exist (default 5). */
  reproFailureMinSample?: number
  /** Alert when escalations in the window ≥ this. */
  escalationSpike?: number
}

export interface AlertSnapshot {
  spendToday: number
  dayCap: number
  reproAttempts: number
  reproFailures: number
  escalations: number
}

/**
 * Evaluates operational thresholds against a snapshot and pushes any tripped
 * alerts to a sink (issue 39). Pure decision logic — the snapshot is gathered
 * elsewhere (dashboard/budget) so this stays trivially testable.
 */
export class AlertEngine {
  constructor(
    private readonly thresholds: AlertThresholds,
    private readonly sink: AlertSink,
  ) {}

  async evaluate(snapshot: AlertSnapshot): Promise<Alert[]> {
    const alerts: Alert[] = []

    const { budgetWarnRatio, reproFailureRate, escalationSpike } = this.thresholds
    const minSample = this.thresholds.reproFailureMinSample ?? 5

    if (budgetWarnRatio !== undefined && snapshot.dayCap > 0) {
      const ratio = snapshot.spendToday / snapshot.dayCap
      if (ratio >= budgetWarnRatio) {
        const severity: AlertSeverity = ratio >= 1 ? 'critical' : 'warn'
        alerts.push({
          kind: 'budget',
          severity,
          message: `Daily spend at ${Math.round(ratio * 100)}% of cap (${snapshot.spendToday}/${snapshot.dayCap}).`,
        })
      }
    }

    if (reproFailureRate !== undefined && snapshot.reproAttempts >= minSample) {
      const failRate = snapshot.reproFailures / snapshot.reproAttempts
      if (failRate >= reproFailureRate) {
        alerts.push({
          kind: 'repro_failure',
          severity: 'warn',
          message: `Reproduction failing at ${Math.round(failRate * 100)}% (${snapshot.reproFailures}/${snapshot.reproAttempts}).`,
        })
      }
    }

    if (escalationSpike !== undefined && snapshot.escalations >= escalationSpike) {
      alerts.push({
        kind: 'escalation_spike',
        severity: 'warn',
        message: `${snapshot.escalations} escalations — above the alert threshold of ${escalationSpike}.`,
      })
    }

    for (const alert of alerts) await this.sink.send(alert)
    return alerts
  }
}

/** Posts alerts as JSON to a webhook (Slack-compatible endpoints, etc.). Best-effort. */
export class WebhookAlertSink implements AlertSink {
  constructor(private readonly url: string) {}

  async send(alert: Alert): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
    })
  }
}
