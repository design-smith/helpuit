import { describe, it, expect } from 'vitest'
import { parseInboundMessage } from './webhook.js'

describe('parseInboundMessage', () => {
  it('parses a customer incoming message', () => {
    const msg = parseInboundMessage({
      message_type: 'incoming',
      content: 'the save button is greyed out',
      conversation: { id: 42 },
    })
    expect(msg).toEqual({ conversationId: 42, content: 'the save button is greyed out' })
  })

  it('ignores outgoing (bot/agent) messages', () => {
    expect(
      parseInboundMessage({ message_type: 'outgoing', content: 'hi', conversation: { id: 42 } }),
    ).toBeNull()
  })

  it('ignores empty content', () => {
    expect(
      parseInboundMessage({ message_type: 'incoming', content: '   ', conversation: { id: 42 } }),
    ).toBeNull()
  })

  it('ignores messages without a conversation id', () => {
    expect(parseInboundMessage({ message_type: 'incoming', content: 'hi' })).toBeNull()
  })

  it('ignores non-object payloads', () => {
    expect(parseInboundMessage(null)).toBeNull()
    expect(parseInboundMessage('nope')).toBeNull()
  })
})
