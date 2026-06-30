import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useInvestigations, useTickets, useIssues, type Page } from '../../lib/api'
import {
  Badge,
  CenteredSpinner,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Row,
  Section,
  StatCard,
  Table,
} from '../../components/ui'
import { absTime, shortId, timeAgo, toneFor } from '../../lib/format'
import { GettingStarted } from '../setup/GettingStarted'

const RECENT = 5

export function DashboardPage() {
  const conversations = useInvestigations({ limit: RECENT })
  const tickets = useTickets({ limit: RECENT })
  const issues = useIssues({ limit: RECENT })

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Conversations, tickets, and issues at a glance" />
      <GettingStarted />

      {/* The three numbers that matter. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Conversations" value={count(conversations)} />
        <StatCard label="Tickets" value={count(tickets)} />
        <StatCard label="Issues" value={count(issues)} />
      </div>

      {/* Most-recent of each, each with a "View all" into its full list. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RecentSection title="Recent conversations" to="/conversations" emptyHint="Conversations appear here as they come in." query={conversations}>
          {(items) => (
            <Table
              head={
                <>
                  <th className="th">Conversation</th>
                  <th className="th">Status</th>
                  <th className="th">Classification</th>
                  <th className="th">Started</th>
                </>
              }
            >
              {items.map((inv) => (
                <Row key={inv.id}>
                  <td className="td font-mono">
                    <Link className="text-accent hover:underline" to={`/conversations/${inv.id}`}>
                      #{inv.conversationId}
                    </Link>
                  </td>
                  <td className="td">
                    <Badge tone={toneFor(inv.status)}>{inv.status}</Badge>
                  </td>
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
        </RecentSection>

        <RecentSection title="Recent tickets" to="/conversations?filter=ticket" emptyHint="Tickets are created when an investigation escalates." query={tickets}>
          {(items) => (
            <Table
              head={
                <>
                  <th className="th">Ticket</th>
                  <th className="th">Conversation</th>
                  <th className="th">GitHub issue</th>
                </>
              }
            >
              {items.map((t) => (
                <Row key={t.id}>
                  <td className="td font-mono text-muted">{shortId(t.id)}</td>
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
        </RecentSection>
      </div>

      <div className="mt-6">
        <RecentSection title="Recent issues" to="/issues" emptyHint="GitHub issues are filed when a bug is confirmed." query={issues}>
          {(items) => (
            <Table
              head={
                <>
                  <th className="th">Issue</th>
                  <th className="th">Status</th>
                  <th className="th">Investigation</th>
                  <th className="th">Filed</th>
                </>
              }
            >
              {items.map((i) => (
                <Row key={i.id}>
                  <td className="td">
                    <a className="text-accent hover:underline" href={i.issueUrl} target="_blank" rel="noreferrer">
                      #{i.issueNumber}
                    </a>
                  </td>
                  <td className="td">{i.status ? <Badge tone={toneFor(i.status)}>{i.status}</Badge> : <span className="text-muted">—</span>}</td>
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
        </RecentSection>
      </div>
    </div>
  )
}

/** The big number for a stat card — the list's full total, or a dash until it loads. */
function count<T>(query: UseQueryResult<Page<T>>): ReactNode {
  return query.data ? query.data.total : '—'
}

/** A titled card holding a short recent list with a "View all" link to the full page. */
function RecentSection<T>({
  title,
  to,
  emptyHint,
  query,
  children,
}: {
  title: string
  to: string
  emptyHint: string
  query: UseQueryResult<Page<T>>
  children: (items: T[]) => ReactNode
}) {
  return (
    <Section
      title={title}
      actions={
        <LinkButton to={to} size="sm">
          View all
        </LinkButton>
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <CenteredSpinner />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="Nothing yet" hint={emptyHint} />
      ) : (
        children(query.data.items)
      )}
    </Section>
  )
}
