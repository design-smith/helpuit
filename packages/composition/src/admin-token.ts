import { randomBytes } from 'node:crypto'
import type { DrizzleSecretVault } from '@helpuit/db'

/** The vault key the admin token is persisted under (an env-var-shaped key). */
export const ADMIN_TOKEN_KEY = 'HELPUIT_ADMIN_TOKEN'

export interface ResolveAdminTokenDeps {
  vault: Pick<DrizzleSecretVault, 'set' | 'openAll'>
  /** A pre-set token from the environment; takes precedence when non-empty. */
  envToken?: string
  /** Token generator (defaults to real crypto-random hex). */
  generate?: () => string
}

export interface AdminTokenResolution {
  token: string
  source: 'env' | 'vault' | 'generated'
  generated: boolean
}

/**
 * Resolve the operator-console admin token so the console is ALWAYS reachable:
 * an env-provided token wins; otherwise reuse the one persisted in the encrypted
 * vault (stable across restarts); otherwise generate one and persist it. This is
 * what lets `docker compose up` with nothing configured still log into the console.
 */
export async function resolveAdminToken(deps: ResolveAdminTokenDeps): Promise<AdminTokenResolution> {
  if (deps.envToken !== undefined && deps.envToken !== '') {
    return { token: deps.envToken, source: 'env', generated: false }
  }
  const stored = (await deps.vault.openAll()).secrets[ADMIN_TOKEN_KEY]
  if (stored !== undefined && stored !== '') {
    return { token: stored, source: 'vault', generated: false }
  }
  const token = (deps.generate ?? (() => randomBytes(24).toString('hex')))()
  await deps.vault.set(ADMIN_TOKEN_KEY, token)
  return { token, source: 'generated', generated: true }
}
