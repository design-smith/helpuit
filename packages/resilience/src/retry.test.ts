import { describe, it, expect } from 'vitest'
import { withRetry } from './retry.js'

describe('withRetry', () => {
  it('retries a transient failure and returns the eventual success', async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) throw new Error('transient')
        return 'ok'
      },
      { retries: 3, baseMs: 1 },
    )

    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  it('gives up after exhausting retries and throws the last error', async () => {
    let attempts = 0
    const promise = withRetry(
      async () => {
        attempts++
        throw new Error('always down')
      },
      { retries: 2, baseMs: 1 },
    )

    await expect(promise).rejects.toThrow('always down')
    expect(attempts).toBe(3) // initial + 2 retries
  })

  it('does not retry an error classified non-retryable', async () => {
    let attempts = 0
    const promise = withRetry(
      async () => {
        attempts++
        throw new Error('400 bad request')
      },
      { retries: 5, baseMs: 1, isRetryable: (e) => !String((e as Error).message).includes('400') },
    )

    await expect(promise).rejects.toThrow('400')
    expect(attempts).toBe(1) // failed fast, no retries
  })
})
