import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { keys, useActivityStream, useOverview, type ActivityEvent } from '../../lib/api'
import { Badge, Card, CenteredSpinner, ErrorState, PageHeader, ProgressBar, PulseDot, Row, StatCard, Table } from '../../components/ui'
import { absTime, shortId, timeAgo, tokens, toneFor } from '../../lib/format'
import { GettingStarted } from '../setup/GettingStarted'

function LiveFeed() {
  const [events, setEvents] = useState<Array<ActivityEvent & { seq: number }>>([])
  const qc = useQueryClient()
  useActivityStream((event) => {
    setEvents((prev) => [{ ...event, seq: (prev[0]?.seq ?? 0) + 1 }, ...prev].slice(0, 12))
    // a real-time event means the numbers changed — refresh the overview now
    void qc.invalidateQueries({ queryKey: keys.overview })
  })

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <PulseDot />
        <span className="text-xs uppercase tracking-wide text-muted">Live activity</span>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Waiting for activity… (incoming messages and outcomes appear here in real time)</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.seq} className="flex items-center gap-2 text-sm">
              <Badge tone={e.type === 'received' ? 'sky' : toneFor(e.data?.outcome)}>
                {e.type === 'received' ? 'message in' : (e.data?.outcome ?? 'outcome')}
              </Badge>
              {e.data?.conversationId !== undefined && (
                <span className="text-muted">conversation #{e.data.conversationId}</span>
              )}
              <span className="ml-auto text-xs text-muted">{timeAgo(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data)
  const total = entries.reduce((s, [, n]) => s + n, 0)
  return (
    <Card>
      <div className="mb-3 text-xs uppercase tracking-wide text-muted">{title}</div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, n]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-sm">
                <Badge tone={toneFor(key)}>{key}</Badge>
              </span>
              <ProgressBar value={total ? n / total : 0} className="flex-1" />
              <span className="w-8 text-right text-sm tabular-nums text-muted">{n}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live operational overview · refreshes every 12s" />
      {/* Onboarding guidance renders independently of the (network-bound) overview below. */}
      <GettingStarted />
      <DashboardOverview />
    </div>
  )
}

function DashboardOverview() {
  const { data, isPending, isError, error, refetch } = useOverview()

  if (isPending) return <CenteredSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const reproPct = Math.round(data.reproduction.successRate * 100)

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Investigations" value={data.investigations.total} />
        <StatCard label="Issues linked" value={data.escalations.issuesLinked} />
        <StatCard label="Tokens spent" value={tokens(data.spend.totalTokens)} />
        <StatCard label="Repro success" value={`${reproPct}%`} hint={`${data.reproduction.attempts} attempts`} />
        <StatCard label="Paused convos" value={data.control.pausedConversations} />
        <StatCard
          label="Queue"
          value={data.queue.pending + data.queue.active}
          hint={`${data.queue.failed} failed · ${data.queue.done} done`}
        />
      </div>

      <div className="mt-4">
        <LiveFeed />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Breakdown title="By status" data={data.investigations.byStatus} />
        <Breakdown title="By classification" data={data.investigations.byClassification} />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Recent investigations</h2>
        {data.investigations.recent.length === 0 ? (
          <div className="card p-6 text-sm text-muted">No investigations yet.</div>
        ) : (
          <Table
            head={
              <>
                <th className="th">ID</th>
                <th className="th">Status</th>
                <th className="th">Level</th>
                <th className="th">Classification</th>
                <th className="th">Created</th>
              </>
            }
          >
            {data.investigations.recent.map((inv) => (
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
                <td className="td text-muted" title={absTime(inv.createdAt)}>
                  {timeAgo(inv.createdAt)}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </div>
    </>
  )
}
