import type { ConfigController } from '@helpuit/runtime-config'

/** One thing standing between the operator and a working agent. */
export interface ReadinessItem {
  /** The env-secret key (e.g. "GITHUB_TOKEN") or "config" for a structural gap. */
  key: string
  message: string
}

/** Whether the agent is ready, and what's left if not. */
export interface Readiness {
  ready: boolean
  /** Required-but-unset secrets + non-secret structural gaps. Must be empty to be ready. */
  blockers: ReadinessItem[]
  /** Optional, unset secrets — useful to surface, but never block readiness. */
  warnings: ReadinessItem[]
}

/**
 * Derives a single readiness view (FCW-07) from the supervisor's effective
 * config: a required secret that isn't set, or a structural gap (e.g.
 * "identity.jwksUrl is required …"), is a blocker; an optional secret that isn't
 * set is a warning. The agent is `ready` exactly when there are no blockers — the
 * data behind the console's Setup checklist (FCW-08).
 */
export class ReadinessService {
  constructor(private readonly config: ConfigController) {}

  async evaluate(): Promise<Readiness> {
    const view = await this.config.effective()
    const blockers: ReadinessItem[] = []
    const warnings: ReadinessItem[] = []

    for (const secret of view.secrets) {
      if (secret.set) continue
      if (secret.required) blockers.push({ key: secret.key, message: `${secret.key} is required but not set` })
      else warnings.push({ key: secret.key, message: `${secret.key} is optional and not set` })
    }
    for (const issue of view.structuralIssues) {
      blockers.push({ key: 'config', message: issue })
    }

    return { ready: blockers.length === 0, blockers, warnings }
  }
}
