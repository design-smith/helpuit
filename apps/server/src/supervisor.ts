import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runSupervisor, type TunnelLease } from './supervisor-loop.js'
import { tunnelRequested, tunnelPort, normalizePublicUrl } from './tunnel/tunnel.js'

// The server entrypoint we supervise (run under tsx, same as `node --import tsx`).
const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), 'main.ts')

async function main(): Promise<void> {
  const withTunnel = tunnelRequested(process.argv, process.env)
  if (withTunnel) console.log('Opening a Cloudflare tunnel (downloads cloudflared on first run)…')

  let child: ChildProcess | undefined
  let stopping = false
  const forward = (): void => {
    stopping = true
    child?.kill('SIGTERM') // graceful stop → server exits 0 → no respawn
  }
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)

  const code = await runSupervisor({
    startTunnel: withTunnel
      ? async (): Promise<TunnelLease> => {
          const { startCloudflaredTunnel } = await import('./tunnel/cloudflared-tunnel.js')
          const handle = await startCloudflaredTunnel(tunnelPort(process.env))
          return { url: normalizePublicUrl(handle.url), stop: handle.stop }
        }
      : undefined,
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
