import { describe, it, expect } from 'vitest'
import { tunnelRequested, normalizePublicUrl, tunnelPort } from './tunnel.js'

describe('tunnelRequested', () => {
  it('is true when --tunnel is passed', () => {
    expect(tunnelRequested(['node', 'main.js', '--tunnel'], {})).toBe(true)
  })

  it('is true when HELPUIT_TUNNEL=1', () => {
    expect(tunnelRequested(['node', 'main.js'], { HELPUIT_TUNNEL: '1' })).toBe(true)
  })

  it('is false with no flag and no env', () => {
    expect(tunnelRequested(['node', 'main.js'], {})).toBe(false)
    expect(tunnelRequested(['node', 'main.js'], { HELPUIT_TUNNEL: '0' })).toBe(false)
  })
})

describe('normalizePublicUrl', () => {
  it('trims whitespace and strips trailing slashes', () => {
    expect(normalizePublicUrl('  https://x.trycloudflare.com/  ')).toBe('https://x.trycloudflare.com')
    expect(normalizePublicUrl('https://x.trycloudflare.com')).toBe('https://x.trycloudflare.com')
  })
})

describe('tunnelPort', () => {
  it('defaults to 3000', () => {
    expect(tunnelPort({})).toBe(3000)
  })

  it('uses a valid PORT', () => {
    expect(tunnelPort({ PORT: '8080' })).toBe(8080)
  })

  it('falls back to 3000 for a non-integer PORT', () => {
    expect(tunnelPort({ PORT: 'abc' })).toBe(3000)
  })
})
