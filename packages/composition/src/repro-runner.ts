import { SandboxPool, DockerContainerRunner, type ContainerRunner, type SandboxAccount } from '@helpuit/sandbox'
import {
  DynamicReproducer,
  canReproduce,
  type BrowserDriver,
  type ReproductionConfig,
  type ReproductionPlan,
  type ReproductionResult,
} from '@helpuit/reproduction'
import { DrizzleEvidenceArtifacts, type Db } from '@helpuit/db'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import type { HelpuitConfig } from '@helpuit/config'
import type { ReproductionRunner } from '@helpuit/escalation'

/** The minimal slice of `DynamicReproducer` the adapter drives. */
interface Reproducer {
  reproduce(plan: ReproductionPlan): Promise<ReproductionResult>
}

/** Persists reproduction evidence to an investigation (satisfied by `DrizzleEvidenceArtifacts`). */
interface EvidenceSink {
  save(input: { investigationId: string; type: string; content: string; redactionStatus: 'raw' | 'redacted' }): Promise<string>
}

export interface ReproductionRunnerAdapterDeps {
  reproducer: Reproducer
  evidence: EvidenceSink
  /** Reproduction policy (founder toggle + environment + caps) for the per-feature gate. */
  policy: ReproductionConfig
  /** Sandbox role to drive (the first configured role by default). */
  sandboxRole: string
  /** Base target + login come from config; the route is the feature's home for the baseline plan. */
  targetRoute: string
}

/**
 * Adapts the L3b {@link DynamicReproducer} to the escalation pipeline's
 * {@link ReproductionRunner} port (FCW-06): per-feature gate via `canReproduce`,
 * a baseline plan (load the route, capture console/network errors), then persist
 * the captured evidence to the investigation. Reproduction is best-effort — a
 * browser/container failure degrades to `reproduced: false` and never breaks the
 * escalation (a static-evidence issue is still filed).
 */
export class ReproductionRunnerAdapter implements ReproductionRunner {
  constructor(private readonly deps: ReproductionRunnerAdapterDeps) {}

  async reproduce(input: { feature?: string; investigationId?: string }): Promise<{ reproduced: boolean }> {
    const featureName = input.feature ?? 'unknown'
    const gate = canReproduce(this.deps.policy, { name: featureName })
    if (!gate.allowed) return { reproduced: false }

    const plan: ReproductionPlan = {
      route: this.deps.targetRoute,
      sandboxRole: this.deps.sandboxRole,
      steps: [],
    }
    try {
      const result = await this.deps.reproducer.reproduce(plan)
      if (input.investigationId !== undefined) {
        await this.deps.evidence.save({
          investigationId: input.investigationId,
          type: 'reproduction',
          content: JSON.stringify(result.evidence),
          redactionStatus: 'raw',
        })
      }
      return { reproduced: result.reproduced }
    } catch {
      // A sandbox/browser/container failure must not break the escalation.
      return { reproduced: false }
    }
  }
}

export interface ReproductionRunnerDeps {
  db: Db
  /** The browser driver (production: PlaywrightBrowserDriver). Absent → reproduction stays off. */
  browserDriver?: BrowserDriver
  /** Container runner; defaults to Docker in production (overridable in tests). */
  containers?: ContainerRunner
}

/**
 * Build the escalation pipeline's reproduction runner from config + a live DB
 * (FCW-06). Returns `undefined` — meaning "no reproduction, behave as before" —
 * unless the founder enabled Playwright, sandbox credentials are present, and a
 * browser driver is available. Otherwise wires a real {@link DynamicReproducer}
 * over a sandbox pool and persists evidence to the investigation.
 */
export function buildReproductionRunner(
  config: HelpuitConfig,
  deps: ReproductionRunnerDeps,
): ReproductionRunner | undefined {
  if (!config.policy.playwrightEnabled) return undefined
  if (deps.browserDriver === undefined) return undefined
  const roles = Object.keys(config.reproduction.sandboxAccounts)
  if (roles.length === 0) return undefined

  // Sandbox accounts: the driver resolves username/password from env by the
  // standard SANDBOX_<ROLE>_USER/PASS refs (the same vars config read them from).
  const accounts: SandboxAccount[] = roles.map((role) => ({
    id: role,
    role,
    usernameSecret: `SANDBOX_${role.toUpperCase()}_USER`,
    passwordSecret: `SANDBOX_${role.toUpperCase()}_PASS`,
  }))
  const pool = new SandboxPool(accounts)
  const containers = deps.containers ?? new DockerContainerRunner()
  const reproducer = new DynamicReproducer(pool, containers, deps.browserDriver, {
    image: config.reproduction.containerImage,
  })
  const evidence = new DrizzleEvidenceArtifacts(
    deps.db,
    new SecretBox(deriveKey(config.security.encryptionKey ?? 'helpuit-no-key')),
  )

  return new ReproductionRunnerAdapter({
    reproducer,
    evidence,
    policy: {
      playwrightEnabled: config.policy.playwrightEnabled,
      environment: config.reproduction.environment,
      caps: { maxSteps: config.budget.repro.maxSteps, maxRetries: config.budget.repro.maxRetries },
    },
    sandboxRole: roles[0]!,
    targetRoute: '/',
  })
}
