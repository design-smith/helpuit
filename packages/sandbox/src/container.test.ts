import { describe, it, expect } from 'vitest'
import { FakeContainerRunner } from './container.js'

describe('FakeContainerRunner', () => {
  it('tracks a running container and removes it on kill', async () => {
    const runner = new FakeContainerRunner()
    const c = await runner.run({ image: 'helpuit/repro' })
    expect(runner.running.has(c.id)).toBe(true)
    await c.kill()
    expect(runner.running.has(c.id)).toBe(false)
  })

  it('assigns distinct ids and kill is idempotent', async () => {
    const runner = new FakeContainerRunner()
    const a = await runner.run({ image: 'x' })
    const b = await runner.run({ image: 'x' })
    expect(a.id).not.toBe(b.id)
    await a.kill()
    await a.kill()
    expect(runner.running.has(b.id)).toBe(true)
  })
})
