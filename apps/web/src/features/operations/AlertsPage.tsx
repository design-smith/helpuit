import { useAlertHistory } from '../../lib/api'
import { Badge, CenteredSpinner, EmptyState, ErrorState, PageHeader, Row, Table } from '../../components/ui'
import { absTime, timeAgo } from '../../lib/format'

const KIND_LABEL: Record<string, string> = {
  budget: 'Budget',
  repro_failure: 'Repro failure',
  escalation_spike: 'Escalation spike',
}

export function AlertsPage() {
  const { data, isPending, isError, error, refetch } = useAlertHistory()

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Operational alerts that have fired (budget, reproduction, escalations)" />
      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title="No alerts fired" hint="Threshold breaches (spend, repro failures, escalation spikes) appear here." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Severity</th>
              <th className="th">Kind</th>
              <th className="th">Message</th>
              <th className="th">When</th>
            </>
          }
        >
          {data.map((a) => (
            <Row key={a.id}>
              <td className="td">
                <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity}</Badge>
              </td>
              <td className="td">{KIND_LABEL[a.kind] ?? a.kind}</td>
              <td className="td">{a.message}</td>
              <td className="td text-muted" title={absTime(a.at)}>
                {timeAgo(a.at)}
              </td>
            </Row>
          ))}
        </Table>
      )}
    </div>
  )
}
