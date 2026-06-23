import { describe, it, expect } from 'vitest'
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js'

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and then fails fast without calling fn', async () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 1000, now: () => 0 })
    const boom = async (): Promise<never> => {
      throw new Error('down')
    }

    await expect(breaker.execute(boom)).rejects.toThrow('down')
    await expect(breaker.execute(boom)).rejects.toThrow('down') // 2nd failure trips it

    let called = false
    await expect(
      breaker.execute(async () => {
        called = true
        return 'ok'
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError)
    expect(called).toBe(false) // open circuit short-circuits — fn never runs
    expect(breaker.state).toBe('open')
  })

  it('half-opens after the cooldown and closes again on a successful trial', async () => {
    let clock = 0
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => clock })

    await expect(
      breaker.execute(async () => {
        throw new Error('down')
      }),
    ).rejects.toThrow('down')
    expect(breaker.state).toBe('open')

    clock = 150 // past the cooldown
    const result = await breaker.execute(async () => 'recovered')
    expect(result).toBe('recovered')
    expect(breaker.state).toBe('closed')
  })
})
