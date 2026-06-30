import { describe, it, expect } from 'vitest'
import { restartBanner, restartFinished } from './restart-banner'

describe('restartBanner', () => {
  it('is hidden before the status has loaded', () => {
    expect(restartBanner(undefined, false)).toEqual({ kind: 'hidden' })
  })

  it('is hidden when nothing is pending', () => {
    expect(restartBanner({ pending: false, reasons: [] }, false)).toEqual({ kind: 'hidden' })
  })

  it('prompts with reasons when a restart-class change is staged', () => {
    expect(restartBanner({ pending: true, reasons: ['secret:GITHUB_TOKEN'] }, false)).toEqual({
      kind: 'pending',
      reasons: ['secret:GITHUB_TOKEN'],
    })
  })

  it('shows progress (no button) once a restart is in flight, even while the status still reads pending', () => {
    // The server is bouncing; its last-seen flag is stale. We must NOT show the
    // "Restart now" button again or the operator will keep clicking it.
    expect(restartBanner({ pending: true, reasons: ['secret:X'] }, true)).toEqual({ kind: 'restarting' })
    expect(restartBanner(undefined, true)).toEqual({ kind: 'restarting' })
  })
})

describe('restartFinished', () => {
  it('is true once the server is back and has cleared the flag (pending:false)', () => {
    expect(restartFinished({ pending: false, reasons: [] }, true)).toBe(true)
  })

  it('is false while the restart is still in flight (server down or flag not yet cleared)', () => {
    expect(restartFinished({ pending: true, reasons: ['secret:X'] }, true)).toBe(false)
    expect(restartFinished(undefined, true)).toBe(false)
  })

  it('is false when no restart was requested', () => {
    expect(restartFinished({ pending: false, reasons: [] }, false)).toBe(false)
  })
})
