/**
 * Local process supervisor for `pnpm start`. The operator console's "Restart now"
 * triggers a clean exit; in production a process manager (Docker/systemd) brings
 * the server back, but locally there's nothing to. This loop IS that manager:
 * it respawns the server when it exits with RESTART_EXIT_CODE, and — crucially —
 * OWNS the tunnel so its public URL stays stable across restarts (a fresh tunnel
 * per restart would change the URL and break the GitHub App + the open browser tab).
 */

/** The server exits with this code to ask the supervisor to respawn it (any other code = stop). */
export const RESTART_EXIT_CODE = 75

export interface TunnelLease {
  url: string
  stop: () => Promise<void>
}

export interface SupervisorDeps {
  /** Open the tunnel once, up front; omit to run without one. */
  startTunnel?: () => Promise<TunnelLease>
  /** Spawn the server with the given extra env; resolves with its exit code. */
  spawnChild: (env: Record<string, string | undefined>) => Promise<number>
  log?: (message: string) => void
}

/**
 * Run the server under supervision. Returns the server's final (non-restart) exit
 * code. The tunnel (if any) is opened before the first child and torn down once,
 * after the loop ends — so it survives every restart in between.
 */
export async function runSupervisor(deps: SupervisorDeps): Promise<number> {
  const tunnel = deps.startTunnel !== undefined ? await deps.startTunnel() : undefined
  const childEnv: Record<string, string | undefined> =
    tunnel !== undefined ? { HELPUIT_PUBLIC_URL: tunnel.url, HELPUIT_BEHIND_TUNNEL: '1' } : {}
  try {
    for (;;) {
      const code = await deps.spawnChild(childEnv)
      if (code !== RESTART_EXIT_CODE) return code
      deps.log?.('Applying saved changes — restarting…')
    }
  } finally {
    if (tunnel !== undefined) await tunnel.stop()
  }
}
