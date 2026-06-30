import { Link, useSearchParams } from 'react-router-dom'
import { useInvestigations } from '../../lib/api'
import { Badge, Button, CenteredSpinner, EmptyState, ErrorState, PageHeader, Row, Select, Table } from '../../components/ui'
import { absTime, timeAgo, toneFor } from '../../lib/format'

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Ongoing (open)' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved_pending_customer_update', label: 'Awaiting customer' },
  { value: 'resolved', label: 'Solved' },
  { value: 'needs_founder', label: 'Needs founder' },
]

const CHIPS = [
  { key: 'ticket', label: 'Became a ticket' },
  { key: 'openIssue', label: 'Open issue' },
  { key: 'pendingDraft', label: 'Needs draft review' },
] as const

/** Unified Conversations list: every customer conversation with status + relation filters. */
export function ConversationsListPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const active = (key: string) => params.get(key) === 'true'

  const filter = {
    status: status || undefined,
    ticket: active('ticket') ? true : undefined,
    openIssue: active('openIssue') ? true : undefined,
    pendingDraft: active('pendingDraft') ? true : undefined,
    limit: 100,
  }
  const { data, isPending, isError, error, refetch } = useInvestigations(filter)

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div>
      <PageHeader title="Conversations" subtitle={data ? `${data.total} total` : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="w-56" value={status} onChange={(e) => setParam('status', e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {CHIPS.map((chip) => (
          <Button
            key={chip.key}
            variant={active(chip.key) ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setParam(chip.key, active(chip.key) ? '' : 'true')}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No conversations" hint="Customer messages from Chatwoot open a conversation here." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Conversation</th>
              <th className="th">Status</th>
              <th className="th">Classification</th>
              <th className="th">Flags</th>
              <th className="th">Last activity</th>
            </>
          }
        >
          {data.items.map((c) => (
            <Row key={c.id}>
              <td className="td font-mono">
                <Link className="text-accent hover:underline" to={`/conversations/${c.id}`}>
                  #{c.conversationId}
                </Link>
              </td>
              <td className="td">
                <Badge tone={toneFor(c.status)}>{c.status}</Badge>
              </td>
              <td className="td">
                {c.classification ? <Badge tone={toneFor(c.classification)}>{c.classification}</Badge> : <span className="text-muted">—</span>}
              </td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  {c.hasTicket && <Badge tone="sky">ticket</Badge>}
                  {c.hasOpenIssue && <Badge tone="amber">open issue</Badge>}
                  {c.pendingDraft && <Badge tone="indigo">draft</Badge>}
                </div>
              </td>
              <td className="td text-muted" title={absTime(c.updatedAt)}>
                {timeAgo(c.updatedAt)}
              </td>
            </Row>
          ))}
        </Table>
      )}
    </div>
  )
}
