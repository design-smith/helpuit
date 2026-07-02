import { describe, expect, it } from 'vitest'
import { parseInboundMessage, extractExternalId } from './webhook.js'

const replied = (part: { body: string; author: { type: string } }) => ({
  type: 'notification_event',
  topic: 'conversation.user.replied',
  data: { item: { id: '123', conversation_parts: { conversation_parts: [part] } } },
})

describe('intercom parseInboundMessage', () => {
  it('parses a customer reply into a normalized message (HTML stripped)', () => {
    const msg = parseInboundMessage(
      replied({ body: '<p>the export button does nothing</p>', author: { type: 'user' } }),
    )
    expect(msg).toEqual({ conversationId: '123', content: 'the export button does nothing' })
  })

  it('parses the opening message on conversation.user.created', () => {
    const msg = parseInboundMessage({
      type: 'notification_event',
      topic: 'conversation.user.created',
      data: { item: { id: '55', source: { body: 'help', author: { type: 'lead' } } } },
    })
    expect(msg).toEqual({ conversationId: '55', content: 'help' })
  })

  it('ignores our own admin/bot replies (loop-safety)', () => {
    expect(parseInboundMessage(replied({ body: 'on it', author: { type: 'admin' } }))).toBeNull()
    expect(parseInboundMessage(replied({ body: 'beep', author: { type: 'bot' } }))).toBeNull()
  })

  it('ignores non-customer topics and empty content', () => {
    expect(
      parseInboundMessage({ topic: 'conversation.admin.replied', data: { item: { id: '1' } } }),
    ).toBeNull()
    expect(parseInboundMessage(replied({ body: '   ', author: { type: 'user' } }))).toBeNull()
    expect(parseInboundMessage(null)).toBeNull()
  })
})

describe('intercom extractExternalId', () => {
  const withContacts = (contacts: Array<Record<string, unknown>>) => ({
    topic: 'conversation.user.replied',
    data: { item: { id: '123', contacts: { contacts } } },
  })

  it('returns the customer contact external_id (the merchant-side user id)', () => {
    expect(extractExternalId(withContacts([{ type: 'contact', id: 'ic1', external_id: 'user-1' }]))).toBe('user-1')
  })

  it('returns undefined when no contact carries an external_id (anonymous / IV off)', () => {
    expect(extractExternalId(withContacts([{ type: 'contact', id: 'ic1' }]))).toBeUndefined()
    expect(extractExternalId({ topic: 'conversation.user.replied', data: { item: { id: '1' } } })).toBeUndefined()
    expect(extractExternalId(null)).toBeUndefined()
  })
})
