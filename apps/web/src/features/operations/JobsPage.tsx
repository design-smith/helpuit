import { useState } from 'react'
import { useJobs, usePurgeJobs, useRetryJob } from '../../lib/api'
import { Badge, CenteredSpinner, EmptyState, ErrorState, PageHeader, Table } from '../../components/ui'
import { absTime, shortId, timeAgo, toneFor } from '../../lib/format'

const STATUSES = ['', 'pending', 'active', 'done', 'failed']

export function JobsPage() {
  const [status, setStatus] = useState('')
  const { data, isPending, isError, error, refetch, isFetching } = useJobs({ status: status || undefined, limit: 50 })
  const retry = useRetryJob()
  const purge = usePurgeJobs()

  return (
    <div>
      <PageHeader
        title="Jobs & dead-letter"
        subtitle={data ? `${data.total} total` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? 'All statuses' : s}
                </option>
              ))}
            </select>
            <button className="btn-ghost" onClick={() => void purge.mutateAsync('failed')} disabled={purge.isPending}>
              Purge failed
            </button>
            <button className="btn-ghost" onClick={() => void purge.mutateAsync('done')} disabled={purge.isPending}>
              Purge done
            </button>
          </div>
        }
      />

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No jobs" hint="Inbound webhooks enqueue investigation jobs here." />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <Table
            head={
              <>
                <th className="th">Job</th>
                <th className="th">Type</th>
                <th className="th">Status</th>
                <th className="th">Attempts</th>
                <th className="th">Last error</th>
                <th className="th">Updated</th>
                <th className="th"></th>
              </>
            }
          >
            {data.items.map((j) => (
              <tr key={j.id} className="hover:bg-surface-2">
                <td className="td font-mono text-muted">{shortId(j.id)}</td>
                <td className="td">{j.type}</td>
                <td className="td">
                  <Badge tone={toneFor(j.status)}>{j.status}</Badge>
                </td>
                <td className="td tabular-nums text-muted">
                  {j.attempts}/{j.maxAttempts}
                </td>
                <td className="td max-w-xs truncate text-red-300/80">{j.lastError ?? '—'}</td>
                <td className="td text-muted" title={absTime(j.updatedAt)}>
                  {timeAgo(j.updatedAt)}
                </td>
                <td className="td text-right">
                  {j.status === 'failed' && (
                    <button
                      className="btn-ghost"
                      onClick={() => void retry.mutateAsync(j.id)}
                      disabled={retry.isPending}
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  )
}
