import { describe, it, expect } from 'vitest'
import { withTimeout, TimeoutError } from './timeout.js'

describe('withTimeout', () => {
  it('returns the value when the operation finishes in time', async () => {
    const result = await withTimeout(async () => 'done', 1000)
    expect(result).toBe('done')
  })

  it('rejects with TimeoutError and aborts the operation when it overruns', async () => {
    let aborted = false
    const promise = withTimeout<string>(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
          })
          // never resolves on its own within the deadline
          setTimeout(() => resolve('late'), 1000)
        }),
      20,
    )

    await expect(promise).rejects.toBeInstanceOf(TimeoutError)
    expect(aborted).toBe(true)
  })
})
