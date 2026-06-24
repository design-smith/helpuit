import { Link } from 'react-router-dom'
import { useTickets } from '../../lib/api'
import { Badge, CenteredSpinner, EmptyState, ErrorState, PageHeader, Row, Table } from '../../components/ui'
import { shortId } from '../../lib/format'

export function TicketsListPage() {
  const { data, isPending, isError, error, refetch } = useTickets({ limit: 50 })

  return (
    <div>
      <PageHeader title="Tickets" subtitle={data ? `${data.total} total` : undefined} />
      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No tickets" hint="Tickets are created when an investigation escalates." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Ticket</th>
              <th className="th">Investigation</th>
              <th className="th">Conversation</th>
              <th className="th">GitHub issue</th>
            </>
          }
        >
          {data.items.map((t) => (
            <Row key={t.id}>
              <td className="td font-mono text-muted">{shortId(t.id)}</td>
              <td className="td font-mono">
                <Link className="text-accent hover:underline" to={`/investigations/${t.investigationId}`}>
                  {shortId(t.investigationId)}
                </Link>
              </td>
              <td className="td tabular-nums text-muted">#{t.conversationId}</td>
              <td className="td">
                {t.issueNumber !== null ? (
                  <Badge tone="emerald">#{t.issueNumber}</Badge>
                ) : (
                  <span className="text-muted">unlinked</span>
                )}
              </td>
            </Row>
          ))}
        </Table>
      )}
    </div>
  )
}
