import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useActivityStream,
  useJobs,
  useJobLogs,
  usePurgeJobs,
  useRetryJob,
  type JobSummary,
} from '../../lib/api'
import {
  Badge,
  Button,
  CenteredSpinner,
  CodeBlock,
  EmptyState,
  ErrorState,
  FormResult,
  PageHeader,
  PulseDot,
  Row,
  Select,
  Spinner,
  Table,
  Timeline,
  TimelineItem,
  cx,
} from '../../components/ui'
import { absTime, shortId, timeAgo, toneFor } from '../../lib/format'

const STATUSES = ['', 'pending', 'active', 'done', 'failed']

/**
 * Activity = the job list (one row per processed conversation). Expand a job to
 * see the agent's step trail (its logs). Live: the list refreshes as events stream.
 */
export function ActivityPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const { data, isPending, isError, error, refetch, isFetching } = useJobs({ status: status || undefined, limit: 50 })
  const purge = usePurgeJobs()

  // Live feel: refresh the list whenever a real-time event streams in.
  useActivityStream(() => void qc.invalidateQueries({ queryKey: ['jobs'] }))

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="One row per processed conversation — expand a job to trace the agent's steps."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <PulseDot /> live
            </span>
            <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? 'All statuses' : s}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void purge.mutateAsync('failed')} loading={purge.isPending}>
              Purge failed
            </Button>
            <Button size="sm" onClick={() => void purge.mutateAsync('done')} loading={purge.isPending}>
              Purge done
            </Button>
          </div>
        }
      />

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No activity yet" hint="Each inbound webhook becomes a job here; expand one to see what the agent did." />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <Table
            head={
              <>
                <th className="th"></th>
                <th className="th">Job</th>
                <th className="th">Status</th>
                <th className="th">Attempts</th>
                <th className="th">Last error</th>
                <th className="th">Updated</th>
                <th className="th"></th>
              </>
            }
          >
            {data.items.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </Table>
        </div>
      )}
    </div>
  )
}

function JobRow({ job }: { job: JobSummary }) {
  const [open, setOpen] = useState(false)
  const logs = useJobLogs(job.id, open)
  const retry = useRetryJob()

  return (
    <>
      <Row>
        <td className="td">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Expand" className="text-muted hover:text-foreground">
            <ChevronRight className={cx('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </button>
        </td>
        <td className="td">
          <span className="font-mono text-muted">{shortId(job.id)}</span> <span className="text-muted">· {job.type}</span>
        </td>
        <td className="td">
          <Badge tone={toneFor(job.status)}>{job.status}</Badge>
        </td>
        <td className="td tabular-nums text-muted">
          {job.attempts}/{job.maxAttempts}
        </td>
        <td className="td max-w-xs truncate text-red-500">{job.lastError ?? '—'}</td>
        <td className="td text-muted" title={absTime(job.updatedAt)}>
          {timeAgo(job.updatedAt)}
        </td>
        <td className="td text-right">
          {job.status === 'failed' && (
            <Button size="sm" onClick={() => void retry.mutateAsync(job.id)} loading={retry.isPending}>
              Retry
            </Button>
          )}
        </td>
      </Row>
      {open && (
        <tr>
          <td className="td bg-secondary-background" colSpan={7}>
            <JobLogsView logs={logs} />
          </td>
        </tr>
      )}
    </>
  )
}

function JobLogsView({ logs }: { logs: ReturnType<typeof useJobLogs> }) {
  if (logs.isPending) return <Spinner label="Loading steps…" />
  if (logs.isError) return <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
  const d = logs.data

  return (
    <div className="space-y-3">
      {d.conversationId !== null && (
        <div className="text-sm">
          Conversation #{d.conversationId}
          {d.investigationId !== null && (
            <Link to={`/conversations/${d.investigationId}`} className="ml-2 text-accent hover:underline">
              open conversation →
            </Link>
          )}
        </div>
      )}
      {d.lastError !== null && <FormResult tone="error">{d.lastError}</FormResult>}
      {d.entries.length === 0 ? (
        <p className="text-sm text-muted">
          No agent steps recorded{d.conversationId === null ? ' (this job isn’t linked to a conversation)' : ' yet'}.
        </p>
      ) : (
        <Timeline>
          {d.entries.map((e) => (
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
  )
}
