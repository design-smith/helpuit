import { describe, expect, it } from 'vitest'
import { FakeChatwootClient, parseInboundMessage } from '@helpuit/chatwoot'
import { PlatformRegistry, type SupportAdapter } from './platform-registry.js'

const chatwootAdapter = (): SupportAdapter => ({
  platform: 'chatwoot',
  parse: parseInboundMessage,
  client: new FakeChatwootClient(),
})

describe('PlatformRegistry', () => {
  it('resolves a connection id to its adapter', () => {
    const reg = new PlatformRegistry([['chatwoot', chatwootAdapter()]])
    expect(reg.get('chatwoot')?.platform).toBe('chatwoot')
  })

  it('returns undefined for an unknown connection', () => {
    const reg = new PlatformRegistry([['chatwoot', chatwootAdapter()]])
    expect(reg.get('nope')).toBeUndefined()
  })

  it('keeps multiple simultaneous connections independent', () => {
    const a = chatwootAdapter()
    const b = chatwootAdapter()
    const reg = new PlatformRegistry([
      ['cw-1', a],
      ['cw-2', b],
    ])
    expect(reg.get('cw-1')?.client).toBe(a.client)
    expect(reg.get('cw-2')?.client).toBe(b.client)
    expect(reg.get('cw-1')?.client).not.toBe(reg.get('cw-2')?.client)
  })
})
