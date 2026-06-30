import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useAudit,
  useDrafts,
  useEvidence,
  useInvestigation,
  usePaused,
  usePauseConversation,
  usePublishDraft,
  useRejectDraft,
  useResumeConversation,
  useSpend,
  useTranscript,
} from '../../lib/api'
import {
  Badge,
  Button,
  Card,
  CenteredSpinner,
  CodeBlock,
  Detail,
  ErrorState,
  FormResult,
  LinkButton,
  PageHeader,
  Section,
  Spinner,
  Timeline,
  TimelineItem,
} from '../../components/ui'
import { absTime, shortId, timeAgo, tokens, toneFor } from '../../lib/format'

export function ConversationDetailPage() {
  const { id = '' } = useParams()
  const detail = useInvestigation(id)
  const transcript = useTranscript(id)
  const audit = useAudit(id)
  const evidence = useEvidence(id)
  const spend = useSpend(id)

  if (detail.isPending) return <CenteredSpinner />
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />

  const inv = detail.data.investigation

  return (
    <div>
      <PageHeader
        title={`Conversation #${inv.conversationId}`}
        subtitle={`Investigation ${shortId(inv.id)}`}
        actions={<LinkButton to="/conversations">← All conversations</LinkButton>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <Detail label="Status">
            <Badge tone={toneFor(inv.status)}>{inv.status}</Badge>
          </Detail>
        </Card>
        <Card>
          <Detail label="Level">{inv.level}</Detail>
        </Card>
        <Card>
          <Detail label="Classification">
            {inv.classification ? (
              <Badge tone={toneFor(inv.classification)}>{inv.classification}</Badge>
            ) : (
              <span className="text-muted">—</span>
            )}
            {inv.confidence !== null && <span className="ml-2 text-xs text-muted">{Math.round(inv.confidence * 100)}%</span>}
          </Detail>
        </Card>
        <Card>
          <Detail label="Started">
            <span title={absTime(inv.createdAt)}>{timeAgo(inv.createdAt)}</span>
          </Detail>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Transcript id={id} query={transcript} />

          <div>
            <h2 className="mb-3 text-sm font-heading text-foreground">Agent trail</h2>
            {audit.isPending ? (
              <Spinner />
            ) : audit.isError ? (
              <ErrorState error={audit.error} />
            ) : audit.data.length === 0 ? (
              <Card className="text-sm text-muted">No agent activity yet.</Card>
            ) : (
              <Timeline>
                {audit.data.map((e) => (
                  <TimelineItem key={e.id}>
                    <div className="flex items-center gap-2">
                      <Badge tone="indigo">{e.type}</Badge>
                      <span className="text-xs text-muted" title={absTime(e.at)}>
                        {timeAgo(e.at)}
                      </span>
                    </div>
                    {e.data !== null && Object.keys(e.data).length > 0 && (
                      <CodeBlock className="mt-1">{JSON.stringify(e.data, null, 2)}</CodeBlock>
                    )}
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <TakeoverControl conversationId={inv.conversationId} />
          <DraftReview investigationId={id} />

          <div>
            <h2 className="mb-2 text-sm font-heading text-foreground">GitHub</h2>
            {detail.data.githubLinks.length === 0 ? (
              <Card className="text-sm text-muted">No linked issues.</Card>
            ) : (
              <Card className="space-y-1">
                {detail.data.githubLinks.map((l) => (
                  <a key={l.id} className="block text-sm text-accent hover:underline" href={l.issueUrl} target="_blank" rel="noreferrer">
                    #{l.issueNumber}
                    {l.status !== null && <span className="ml-2 text-xs text-muted">{l.status}</span>}
                  </a>
                ))}
              </Card>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-heading text-foreground">Spend</h2>
            <Card>
              {spend.isPending ? (
                <Spinner />
              ) : spend.isError ? (
                <span className="text-sm text-muted">—</span>
              ) : (
                <>
                  <div className="text-2xl font-heading text-foreground">{tokens(spend.data.total)}</div>
                  <div className="text-xs text-muted">
                    {spend.data.attributed ? `${spend.data.items.length} entries` : 'tokens (global scope)'}
                  </div>
                </>
              )}
            </Card>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-heading text-foreground">Evidence</h2>
            {evidence.isPending ? (
              <Spinner />
            ) : evidence.isError ? (
              <ErrorState error={evidence.error} />
            ) : evidence.data.length === 0 ? (
              <Card className="text-sm text-muted">No evidence captured.</Card>
            ) : (
              <Card className="space-y-2">
                {evidence.data.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span>{a.type}</span>
                    <Badge tone={a.redactionStatus === 'redacted' ? 'emerald' : 'amber'}>{a.redactionStatus}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Live transcript pulled from Chatwoot — degrades cleanly when unavailable. */
function Transcript({ id, query }: { id: string; query: ReturnType<typeof useTranscript> }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-heading text-foreground">Conversation</h2>
        <span className="text-xs text-muted">live from Chatwoot</span>
        <Button size="sm" className="ml-auto" loading={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.available !== true ? (
        <Card className="text-sm text-muted">{query.data.detail ?? 'Transcript unavailable.'}</Card>
      ) : (query.data.messages ?? []).length === 0 ? (
        <Card className="text-sm text-muted">No messages.</Card>
      ) : (
        <Card className="max-h-[28rem] space-y-3 overflow-y-auto">
          {(query.data.messages ?? []).map((m, idx) => (
            <div key={`${id}-${idx}`} className={m.author === 'agent' ? 'pl-8' : m.author === 'system' ? 'opacity-70' : 'pr-8'}>
              <div className="flex items-center gap-2">
                <Badge tone={m.author === 'customer' ? 'sky' : m.author === 'agent' ? 'emerald' : 'slate'}>{m.author}</Badge>
                <span className="text-xs text-muted" title={absTime(m.at)}>
                  {timeAgo(m.at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{m.text}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

/** Pause/resume the agent on this conversation (founder takeover, inline). */
function TakeoverControl({ conversationId }: { conversationId: number }) {
  const paused = usePaused()
  const pause = usePauseConversation()
  const resume = useResumeConversation()
  const isPaused = (paused.data ?? []).some((c) => c.conversationId === conversationId)

  return (
    <Section title="Takeover">
      {isPaused ? (
        <div className="flex items-center gap-3">
          <Badge tone="amber">paused</Badge>
          <Button onClick={() => void resume.mutateAsync(conversationId)} loading={resume.isPending}>
            Resume agent
          </Button>
        </div>
      ) : (
        <Button
          variant="danger"
          onClick={() => void pause.mutateAsync({ id: conversationId })}
          loading={pause.isPending}
        >
          Pause agent (take over)
        </Button>
      )}
    </Section>
  )
}

/** Inline review of any draft awaiting approval for this conversation. */
function DraftReview({ investigationId }: { investigationId: string }) {
  const drafts = useDrafts('pending')
  const publish = usePublishDraft()
  const reject = useRejectDraft()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mine = (drafts.data?.items ?? []).filter((d) => d.investigationId === investigationId)
  if (mine.length === 0) return null

  return (
    <Section title="Draft review" hint="Awaiting your approval before it reaches GitHub.">
      <div className="space-y-4">
        {mine.map((d) => (
          <div key={d.id} className="space-y-2 border-t-2 border-border pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <Badge tone={d.severity === 'high' ? 'red' : d.severity === 'medium' ? 'amber' : 'slate'}>{d.severity}</Badge>
              <span className="text-sm font-heading text-foreground">{d.title}</span>
            </div>
            <div className="prose-sm max-h-48 overflow-y-auto rounded-base border-2 border-border bg-secondary-background p-2 text-sm text-foreground">
              <Markdown remarkPlugins={[remarkGfm]}>{d.body}</Markdown>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" loading={reject.isPending} onClick={() => void reject.mutateAsync({ id: d.id })}>
                Reject
              </Button>
              {confirm === d.id ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={publish.isPending}
                  onClick={async () => {
                    setError(null)
                    try {
                      const res = await publish.mutateAsync(d.id)
                      if (res.status !== 'published') setError(`Could not publish (${res.status}).`)
                    } catch {
                      setError('Publish failed — not filed.')
                    }
                    setConfirm(null)
                  }}
                >
                  Confirm — file on GitHub
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setConfirm(d.id)}>
                  Approve &amp; publish
                </Button>
              )}
            </div>
          </div>
        ))}
        {error !== null && <FormResult tone="error">{error}</FormResult>}
      </div>
    </Section>
  )
}
