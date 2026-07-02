import { describe, expect, it } from 'vitest'
import { parseInboundMessage } from './webhook.js'

const endUser = {
  ticket_id: 123,
  comment: '<p>the export button does nothing</p>',
  is_public: true,
  author_role: 'end-user',
  requester_email: 'user@example.com',
}

describe('zendesk parseInboundMessage', () => {
  it('parses a public end-user comment (HTML stripped, ticket id as conversation id)', () => {
    expect(parseInboundMessage(endUser)).toEqual({ conversationId: '123', content: 'the export button does nothing' })
  })

  it('accepts string-valued is_public / ticket_id (trigger placeholders render as strings)', () => {
    expect(parseInboundMessage({ ...endUser, is_public: 'true', ticket_id: '77' })).toEqual({
      conversationId: '77',
      content: 'the export button does nothing',
    })
  })

  it('ignores our own agent/admin comments and internal notes (loop-safety)', () => {
    expect(parseInboundMessage({ ...endUser, author_role: 'agent' })).toBeNull()
    expect(parseInboundMessage({ ...endUser, author_role: 'admin' })).toBeNull()
    expect(parseInboundMessage({ ...endUser, is_public: false })).toBeNull()
  })

  it('ignores empty content, missing ticket, or a non-object', () => {
    expect(parseInboundMessage({ ...endUser, comment: '   ' })).toBeNull()
    expect(parseInboundMessage({ ...endUser, ticket_id: undefined })).toBeNull()
    expect(parseInboundMessage(null)).toBeNull()
  })
})
