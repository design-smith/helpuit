/** A sender/recipient actor on a message. actorId prefixes: V- visitor, A- agent, S- system/app, E- email contact. */
export interface HubSpotActor {
  actorId?: string
  name?: string
}

/** A message on a Conversations thread. `direction` INCOMING = from the customer. */
export interface HubSpotMessage {
  id?: string
  type?: string
  text?: string
  richText?: string
  direction?: 'INCOMING' | 'OUTGOING'
  createdAt?: string
  /** The channel this message arrived on — echoed back when replying. */
  channelId?: string
  channelAccountId?: string
  senders?: HubSpotActor[]
}

/** A Conversations thread (inbox conversation). */
export interface HubSpotThread {
  id?: string
  latestMessageTimestamp?: string
}

/** Connection config: private-app token (Bearer) + the actor replies are sent as. */
export interface HubSpotConfig {
  accessToken: string
  /** The agent/app actor id replies are attributed to, e.g. "A-12345". */
  senderActorId: string
  /** API base; defaults to https://api.hubapi.com. */
  baseUrl?: string
}
