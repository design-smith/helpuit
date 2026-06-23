/**
 * A running tunnel: the public URL it exposes and a way to tear it down. The
 * actual cloudflared process is an EXTERNAL boundary — the wrapper that produces
 * this lives in `cloudflared-tunnel.ts` and is loaded only when a tunnel is asked
 * for (like the Playwright driver). Everything here is pure + unit-tested.
 */
export interface TunnelHandle {
  /** The public https URL forwarding to the local server (e.g. https://xyz.trycloudflare.com). */
  url: string
  /** Stop the tunnel (idempotent, best-effort). */
  stop: () => Promise<void>
}

/** Starts a tunnel to the given local port and resolves once a public URL is live. */
export type TunnelStarter = (port: number) => Promise<TunnelHandle>

/** Did the operator ask for a tunnel — via `--tunnel` or `HELPUIT_TUNNEL=1`? */
export function tunnelRequested(argv: readonly string[], env: { HELPUIT_TUNNEL?: string }): boolean {
  return argv.includes('--tunnel') || env.HELPUIT_TUNNEL === '1'
}

/** Normalize a tunnel URL for use as HELPUIT_PUBLIC_URL (trim, drop trailing slashes). */
export function normalizePublicUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** The port the server will listen on (mirrors the config loader: PORT or 3000). */
export function tunnelPort(env: { PORT?: string }): number {
  const n = Number(env.PORT)
  return Number.isInteger(n) && n > 0 ? n : 3000
}
