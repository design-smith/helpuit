import { existsSync } from 'node:fs'
import { bin, install, Tunnel } from 'cloudflared'
import type { TunnelHandle } from './tunnel.js'

const URL_TIMEOUT_MS = 30_000

/**
 * Start a Cloudflare **quick tunnel** to the local port and resolve once it
 * reports its public URL. No Cloudflare account or login is needed; the
 * cloudflared binary is downloaded on first use. This wraps an external process,
 * so it's loaded lazily (only when `--tunnel` is set) and never on the default
 * boot path — mirroring how the Playwright driver is imported.
 */
export async function startCloudflaredTunnel(port: number): Promise<TunnelHandle> {
  if (!existsSync(bin)) {
    console.log('Downloading the cloudflared tunnel binary (first run only)…')
    await install(bin)
  }

  const tunnel = Tunnel.quick(`http://localhost:${port}`)
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      tunnel.stop()
      reject(new Error('cloudflared did not report a public URL within 30s'))
    }, URL_TIMEOUT_MS)
    tunnel.once('url', (u: string) => {
      clearTimeout(timer)
      resolve(u)
    })
    tunnel.once('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
    tunnel.once('exit', (code: number | null) => {
      clearTimeout(timer)
      reject(new Error(`cloudflared exited (${code ?? 'null'}) before providing a public URL`))
    })
  })

  return {
    url,
    stop: async () => {
      tunnel.stop()
    },
  }
}
