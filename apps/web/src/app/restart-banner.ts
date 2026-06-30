/** The restart-required banner is in exactly one of these states at a time. */
export type RestartBanner =
  | { kind: 'hidden' }
  | { kind: 'pending'; reasons: string[] } // changes staged; waiting for the operator to restart
  | { kind: 'restarting' } // restart triggered; the server is bouncing — show progress, not a button

/** Just the fields of the restart status this decision needs (structurally compatible with the API type). */
export interface RestartStatusView {
  pending: boolean
  reasons: string[]
}

/**
 * Decide what the restart banner shows.
 *
 * A restart in flight (`restarting`) wins over the server's flag: while the
 * process is bouncing, its last-seen status is stale (and the server may be
 * unreachable), so we show progress rather than offering the button again.
 */
export function restartBanner(status: RestartStatusView | undefined, restarting: boolean): RestartBanner {
  if (restarting) return { kind: 'restarting' }
  if (status?.pending === true) return { kind: 'pending', reasons: status.reasons }
  return { kind: 'hidden' }
}

/**
 * True once an in-flight restart has completed: the server is back AND cleared the
 * flag on boot (`pending: false`). This is the signal to drop the in-flight state so
 * the banner disappears. While the server is down the status is stale/undefined, so
 * this stays false until a fresh `pending: false` arrives.
 */
export function restartFinished(status: RestartStatusView | undefined, restarting: boolean): boolean {
  return restarting && status?.pending === false
}
