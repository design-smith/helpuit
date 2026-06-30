import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useIssues, useRefreshIssues } from '../../lib/api'
import { Badge, Button, CenteredSpinner, EmptyState, ErrorState, FormResult, PageHeader, Row, Select, Table } from '../../components/ui'
import { shortId, timeAgo, absTime } from '../../lib/format'

const FILTERS = [
  { value: 'open', label: 'Needs solving (open)' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
]

export function IssuesListPage() {
  const [filter, setFilter] = useState<'open' | 'closed' | ''>('open')
  const { data, isPending, isError, error, refetch, isFetching } = useIssues({
    status: filter === '' ? undefined : filter,
    limit: 50,
  })
  const refresh = useRefreshIssues()
  const [synced, setSynced] = useState<number | null>(null)

  return (
    <div>
      <PageHeader
        title="Issues"
        subtitle={data ? `${data.total} ${filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : 'total'}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Select className="w-48" value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'closed' | '')}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Button
              loading={refresh.isPending || isFetching}
              onClick={async () => {
                const res = await refresh.mutateAsync()
                setSynced(res.synced)
                await refetch()
              }}
            >
              Refresh from GitHub
            </Button>
          </div>
        }
      />

      {synced !== null && (
        <FormResult tone="success" className="mb-3">
          Synced {synced} issue{synced === 1 ? '' : 's'} from GitHub.
        </FormResult>
      )}

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'Nothing needs solving' : 'No issues'}
          hint="GitHub issues are filed when a bug is confirmed. Refresh to pull the latest open/closed state."
        />
      ) : (
        <Table
          head={
            <>
              <th className="th">Issue</th>
              <th className="th">Status</th>
              <th className="th">Conversation</th>
              <th className="th">Filed</th>
            </>
          }
        >
          {data.items.map((i) => (
            <Row key={i.id}>
              <td className="td">
                <a className="text-accent hover:underline" href={i.issueUrl} target="_blank" rel="noreferrer">
                  #{i.issueNumber}
                </a>
              </td>
              <td className="td">
                <Badge tone={i.status === 'closed' ? 'emerald' : i.status === 'open' ? 'amber' : 'slate'}>
                  {i.status ?? 'unsynced'}
                </Badge>
              </td>
              <td className="td font-mono">
                <Link className="text-accent hover:underline" to={`/conversations/${i.investigationId}`}>
                  {shortId(i.investigationId)}
                </Link>
              </td>
              <td className="td text-muted" title={absTime(i.createdAt)}>
                {timeAgo(i.createdAt)}
              </td>
            </Row>
          ))}
        </Table>
      )}
    </div>
  )
}
