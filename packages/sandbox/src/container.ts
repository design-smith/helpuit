import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ContainerSpec {
  image: string
  env?: Record<string, string>
  cmd?: string[]
}

export interface RunningContainer {
  readonly id: string
  /** Force-stop and remove (abort). Idempotent. Satisfies the abortability rail. */
  kill(): Promise<void>
}

export interface ContainerRunner {
  run(spec: ContainerSpec): Promise<RunningContainer>
}

/** In-memory runner for tests — no real containers. */
export class FakeContainerRunner implements ContainerRunner {
  private counter = 0
  readonly running = new Set<string>()

  async run(_spec: ContainerSpec): Promise<RunningContainer> {
    const id = `fake-${++this.counter}`
    this.running.add(id)
    return {
      id,
      kill: async () => {
        this.running.delete(id)
      },
    }
  }
}

/**
 * Real Docker-backed runner. Not unit-tested (requires a Docker daemon); covered
 * by integration. `kill` uses `docker rm -f`, which both stops and removes —
 * guaranteeing the abortability invariant (never start what can't be stopped).
 */
export class DockerContainerRunner implements ContainerRunner {
  async run(spec: ContainerSpec): Promise<RunningContainer> {
    const args = ['run', '-d']
    for (const [key, value] of Object.entries(spec.env ?? {})) {
      args.push('-e', `${key}=${value}`)
    }
    args.push(spec.image, ...(spec.cmd ?? []))
    const { stdout } = await execFileAsync('docker', args)
    const id = String(stdout).trim()
    return {
      id,
      kill: async () => {
        await execFileAsync('docker', ['rm', '-f', id])
      },
    }
  }
}
