import { useParams } from 'react-router-dom'
import { useAudit, useEvidence, useInvestigation, useSpend } from '../../lib/api'
import {
  Badge,
  Card,
  CenteredSpinner,
  CodeBlock,
  Detail,
  ErrorState,
  LinkButton,
  PageHeader,
  Spinner,
  Timeline,
  TimelineItem,
} from '../../components/ui'
import { absTime, shortId, timeAgo, tokens, toneFor } from '../../lib/format'

export function InvestigationDetailPage() {
  const { id = '' } = useParams()
  const detail = useInvestigation(id)
  const audit = useAudit(id)
  const evidence = useEvidence(id)
  const spend = useSpend(id)

  if (detail.isPending) return <CenteredSpinner />
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />

  const inv = detail.data.investigation

  return (
    <div>
      <PageHeader
        title={`Investigation ${shortId(inv.id)}`}
        subtitle={`Conversation #${inv.conversationId}`}
        actions={<LinkButton to="/investigations">← All</LinkButton>}
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
          <Detail label="Created">
            <span title={absTime(inv.createdAt)}>{timeAgo(inv.createdAt)}</span>
          </Detail>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Audit timeline */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink">Audit trail</h2>
          {audit.isPending ? (
            <Spinner />
          ) : audit.isError ? (
            <ErrorState error={audit.error} />
          ) : audit.data.length === 0 ? (
            <Card className="text-sm text-muted">No audit events.</Card>
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

        {/* Side: links, spend, evidence */}
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">GitHub</h2>
            {detail.data.githubLinks.length === 0 ? (
              <Card className="text-sm text-muted">No linked issues.</Card>
            ) : (
              <Card className="space-y-1">
                {detail.data.githubLinks.map((l) => (
                  <a
                    key={l.id}
                    className="block text-sm text-accent hover:underline"
                    href={l.issueUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{l.issueNumber}
                  </a>
                ))}
              </Card>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Spend</h2>
            <Card>
              {spend.isPending ? (
                <Spinner />
              ) : spend.isError ? (
                <span className="text-sm text-muted">—</span>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-ink">{tokens(spend.data.total)}</div>
                  <div className="text-xs text-muted">
                    {spend.data.attributed
                      ? `${spend.data.items.length} entries`
                      : 'tokens (global scope — per-investigation attribution lands later)'}
                  </div>
                </>
              )}
            </Card>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Evidence</h2>
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
                <p className="pt-1 text-xs text-muted">
                  Content is encrypted at rest and may contain unredacted data — fetched individually on demand.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
