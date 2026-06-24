import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useInvestigations } from '../../lib/api'
import { Badge, CenteredSpinner, EmptyState, ErrorState, PageHeader, Row, Select, Table } from '../../components/ui'
import { absTime, shortId, timeAgo, toneFor } from '../../lib/format'

const STATUSES = ['', 'open', 'escalated', 'resolved', 'resolved_pending_customer_update', 'needs_founder']

export function InvestigationsListPage() {
  const [status, setStatus] = useState('')
  const { data, isPending, isError, error, refetch, isFetching } = useInvestigations({
    status: status || undefined,
    limit: 50,
  })

  return (
    <div>
      <PageHeader
        title="Investigations"
        subtitle={data ? `${data.total} total` : undefined}
        actions={
          <Select className="w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </Select>
        }
      />

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No investigations" hint="Inbound customer messages create investigations here." />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <Table
            head={
              <>
                <th className="th">ID</th>
                <th className="th">Status</th>
                <th className="th">Level</th>
                <th className="th">Classification</th>
                <th className="th">Confidence</th>
                <th className="th">Conversation</th>
                <th className="th">Updated</th>
              </>
            }
          >
            {data.items.map((inv) => (
              <Row key={inv.id}>
                <td className="td font-mono">
                  <Link className="text-accent hover:underline" to={`/investigations/${inv.id}`}>
                    {shortId(inv.id)}
                  </Link>
                </td>
                <td className="td">
                  <Badge tone={toneFor(inv.status)}>{inv.status}</Badge>
                </td>
                <td className="td text-muted">{inv.level}</td>
                <td className="td">
                  {inv.classification ? <Badge tone={toneFor(inv.classification)}>{inv.classification}</Badge> : '—'}
                </td>
                <td className="td tabular-nums text-muted">
                  {inv.confidence !== null ? `${Math.round(inv.confidence * 100)}%` : '—'}
                </td>
                <td className="td tabular-nums text-muted">#{inv.conversationId}</td>
                <td className="td text-muted" title={absTime(inv.updatedAt)}>
                  {timeAgo(inv.updatedAt)}
                </td>
              </Row>
            ))}
          </Table>
        </div>
      )}
    </div>
  )
}
