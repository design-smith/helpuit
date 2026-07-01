import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runSupervisor, type TunnelLease } from './supervisor-loop.js'
import { tunnelRequested, tunnelPort, normalizePublicUrl, namedTunnelToken } from './tunnel/tunnel.js'

// The server entrypoint we supervise (run under tsx, same as `node --import tsx`).
const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), 'main.ts')

async function main(): Promise<void> {
  const token = namedTunnelToken(process.env)
  const withQuickTunnel = tunnelRequested(process.argv, process.env)

  let startTunnel: (() => Promise<TunnelLease>) | undefined

  if (token !== undefined) {
    // Named tunnel: permanent URL configured in Cloudflare Zero Trust dashboard.
    // HELPUIT_PUBLIC_URL must be set to the stable hostname.
    const publicUrl = process.env.HELPUIT_PUBLIC_URL?.trim()
    if (!publicUrl) {
      console.error(
        'CLOUDFLARE_TUNNEL_TOKEN is set but HELPUIT_PUBLIC_URL is missing.\n' +
          'Set HELPUIT_PUBLIC_URL to your tunnel hostname (e.g. https://helpuit.example.com).',
      )
      process.exit(1)
    }
    console.log(`Starting permanent Cloudflare named tunnel → ${publicUrl}`)
    startTunnel = async (): Promise<TunnelLease> => {
      const { startNamedCloudflaredTunnel } = await import('./tunnel/cloudflared-tunnel.js')
      const handle = await startNamedCloudflaredTunnel(token, normalizePublicUrl(publicUrl))
      return { url: handle.url, stop: handle.stop }
    }
  } else if (withQuickTunnel) {
    // Quick tunnel: random URL, no Cloudflare account needed.
    console.log('Opening a Cloudflare quick tunnel (downloads cloudflared on first run)…')
    startTunnel = async (): Promise<TunnelLease> => {
      const { startCloudflaredTunnel } = await import('./tunnel/cloudflared-tunnel.js')
      const handle = await startCloudflaredTunnel(tunnelPort(process.env))
      return { url: normalizePublicUrl(handle.url), stop: handle.stop }
    }
  }

  let child: ChildProcess | undefined
  let stopping = false
  const forward = (): void => {
    stopping = true
    child?.kill('SIGTERM') // graceful stop → server exits 0 → no respawn
  }
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)

  const code = await runSupervisor({
    startTunnel,
    spawnChild: (env) =>
      new Promise<number>((resolveCode, rejectSpawn) => {
        const proc = spawn(process.execPath, ['--import', 'tsx', mainPath], {
          stdio: 'inherit',
          env: { ...process.env, ...env },
        })
        child = proc
        proc.once('error', rejectSpawn)
        proc.once('exit', (exitCode) => {
          child = undefined
          // A signal-killed or clean child must not look like a restart request.
          resolveCode(stopping ? 0 : (exitCode ?? 0))
        })
      }),
    log: (message) => console.log(`\n${message}\n`),
  })

  process.exit(code)
}

main().catch((error: unknown) => {
  console.error('Supervisor failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
