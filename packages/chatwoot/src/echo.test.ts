import { describe, it, expect } from 'vitest'
import { FakeChatwootClient } from './client.js'
import { handleInbound, ECHO_REPLY } from './echo.js'

describe('handleInbound', () => {
  it('replies once to a customer message', async () => {
    const client = new FakeChatwootClient()
    const acted = await handleInbound(
      { message_type: 'incoming', content: 'help', conversation: { id: 7 } },
      client,
    )
    expect(acted).toBe(true)
    expect(client.replies).toEqual([{ conversationId: '7', content: ECHO_REPLY }])
  })

  it('does nothing for an outgoing message', async () => {
    const client = new FakeChatwootClient()
    const acted = await handleInbound(
      { message_type: 'outgoing', content: 'bot reply', conversation: { id: 7 } },
      client,
    )
    expect(acted).toBe(false)
    expect(client.replies).toHaveLength(0)
  })
})
