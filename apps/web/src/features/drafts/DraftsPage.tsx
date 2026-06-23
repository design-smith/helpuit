import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { useDrafts, usePublishDraft, useRejectDraft, type Draft } from '../../lib/api'
import { Badge, CenteredSpinner, EmptyState, ErrorState, Modal, PageHeader, Table } from '../../components/ui'
import { shortId, timeAgo } from '../../lib/format'

export function DraftsPage() {
  const { data, isPending, isError, error, refetch } = useDrafts('pending')
  const [active, setActive] = useState<Draft | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const publish = usePublishDraft()
  const reject = useRejectDraft()
  const [actionError, setActionError] = useState<string | null>(null)

  function close() {
    setActive(null)
    setConfirmPublish(false)
    setActionError(null)
  }

  async function doPublish() {
    if (active === null) return
    setActionError(null)
    try {
      const res = await publish.mutateAsync(active.id)
      if (res.status !== 'published') {
        setActionError(`Could not publish (${res.status}).`)
        return
      }
      close()
    } catch {
      setActionError('Publish failed — the issue was not filed. Try again.')
    }
  }

  async function doReject() {
    if (active === null) return
    try {
      await reject.mutateAsync({ id: active.id })
      close()
    } catch {
      setActionError('Reject failed.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Draft issues"
        subtitle="Escalations awaiting your approval before they reach GitHub"
      />

      {isPending ? (
        <CenteredSpinner />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No pending drafts" hint="With autopublish=draft, suspected bugs land here for review." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Title</th>
              <th className="th">Severity</th>
              <th className="th">Investigation</th>
              <th className="th">Created</th>
              <th className="th"></th>
            </>
          }
        >
          {data.items.map((d) => (
            <tr key={d.id} className="hover:bg-surface-2">
              <td className="td max-w-md truncate">{d.title}</td>
              <td className="td">
                <Badge tone={d.severity === 'high' ? 'red' : d.severity === 'medium' ? 'amber' : 'slate'}>
                  {d.severity}
                </Badge>
              </td>
              <td className="td font-mono">
                <Link className="text-accent hover:underline" to={`/investigations/${d.investigationId}`}>
                  {shortId(d.investigationId)}
                </Link>
              </td>
              <td className="td text-muted">{timeAgo(d.createdAt)}</td>
              <td className="td text-right">
                <button className="btn-ghost" onClick={() => setActive(d)}>
                  Review
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={active !== null}
        title={active?.title ?? 'Draft'}
        onClose={close}
        footer={
          <>
            {actionError !== null && <span className="mr-auto text-sm text-red-400">{actionError}</span>}
            <button className="btn-danger" onClick={doReject} disabled={reject.isPending}>
              Reject
            </button>
            {confirmPublish ? (
              <button className="btn-primary" onClick={doPublish} disabled={publish.isPending}>
                {publish.isPending ? 'Filing…' : 'Confirm — file on GitHub'}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => setConfirmPublish(true)}>
                Approve & publish
              </button>
            )}
          </>
        }
      >
        {active !== null && (
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {active.labels.map((l) => (
                <Badge key={l} tone="indigo">
                  {l}
                </Badge>
              ))}
            </div>
            <div className="prose-sm rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-ink">
              <Markdown remarkPlugins={[remarkGfm]}>{active.body}</Markdown>
            </div>
            <p className="mt-3 text-xs text-muted">
              Publishing files this issue on GitHub (redaction is enforced at the boundary). Rejecting discards it.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
