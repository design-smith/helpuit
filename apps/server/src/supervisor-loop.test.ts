import { describe, it, expect } from 'vitest'
import { runSupervisor, RESTART_EXIT_CODE } from './supervisor-loop.js'

describe('runSupervisor', () => {
  it('respawns the child while it exits with the restart code, then returns the final code', async () => {
    const codes = [RESTART_EXIT_CODE, RESTART_EXIT_CODE, 0]
    let i = 0
    const code = await runSupervisor({ spawnChild: async () => codes[i++]! })
    expect(code).toBe(0)
    expect(i).toBe(3) // initial run + two respawns
  })

  it('does NOT respawn on a non-restart exit (clean stop or crash)', async () => {
    let n = 0
    const code = await runSupervisor({
      spawnChild: async () => {
        n++
        return 1
      },
    })
    expect(code).toBe(1)
    expect(n).toBe(1)
  })

  it('opens the tunnel once, shares its stable URL with every child, and stops it at the end', async () => {
    let started = 0
    let stopped = 0
    const urls: Array<string | undefined> = []
    const code = await runSupervisor({
      startTunnel: async () => {
        started++
        return { url: 'https://x.trycloudflare.com', stop: async () => void stopped++ }
      },
      spawnChild: async (env) => {
        urls.push(env.HELPUIT_PUBLIC_URL)
        return urls.length < 3 ? RESTART_EXIT_CODE : 0
      },
    })
    expect(code).toBe(0)
    expect(started).toBe(1) // tunnel opened once, survives respawns
    expect(stopped).toBe(1) // and torn down once at the end
    expect(urls).toEqual([
      'https://x.trycloudflare.com',
      'https://x.trycloudflare.com',
      'https://x.trycloudflare.com',
    ])
  })

  it('marks tunnel children with HELPUIT_BEHIND_TUNNEL so the server re-points the Chatwoot webhook', async () => {
    let behind: string | undefined
    await runSupervisor({
      startTunnel: async () => ({ url: 'https://x.trycloudflare.com', stop: async () => {} }),
      spawnChild: async (env) => {
        behind = env.HELPUIT_BEHIND_TUNNEL
        return 0
      },
    })
    expect(behind).toBe('1')
  })

  it('stops the tunnel even if a child throws', async () => {
    let stopped = 0
    await expect(
      runSupervisor({
        startTunnel: async () => ({ url: 'https://x.trycloudflare.com', stop: async () => void stopped++ }),
        spawnChild: async () => {
          throw new Error('spawn failed')
        },
      }),
    ).rejects.toThrow('spawn failed')
    expect(stopped).toBe(1)
  })
})
