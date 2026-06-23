import { useState } from 'react'
import { usePaused, usePauseConversation, useResumeConversation } from '../../lib/api'
import { Card, CenteredSpinner, EmptyState, ErrorState, PageHeader } from '../../components/ui'
import { absTime, timeAgo } from '../../lib/format'

export function ConversationsPage() {
  const paused = usePaused()
  const pause = usePauseConversation()
  const resume = useResumeConversation()
  const [convId, setConvId] = useState('')
  const [note, setNote] = useState('')

  async function doPause() {
    const id = Number(convId)
    if (!Number.isInteger(id)) return
    await pause.mutateAsync({ id, note: note || undefined })
    setConvId('')
    setNote('')
  }

  return (
    <div>
      <PageHeader
        title="Founder takeover"
        subtitle="Paused conversations — the agent stays silent until you resume"
      />

      <Card className="mb-6">
        <div className="mb-2 text-sm font-semibold">Pause a conversation</div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Conversation ID</label>
            <input
              className="input w-40"
              value={convId}
              onChange={(e) => setConvId(e.target.value)}
              placeholder="e.g. 42"
              inputMode="numeric"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="handling manually" />
          </div>
          <button className="btn-primary" onClick={doPause} disabled={convId === '' || pause.isPending}>
            Pause
          </button>
        </div>
      </Card>

      {paused.isPending ? (
        <CenteredSpinner />
      ) : paused.isError ? (
        <ErrorState error={paused.error} onRetry={() => void paused.refetch()} />
      ) : paused.data.length === 0 ? (
        <EmptyState title="No paused conversations" hint="The agent is handling everything autonomously." />
      ) : (
        <div className="space-y-2">
          {paused.data.map((c) => (
            <Card key={c.conversationId} className="flex items-center justify-between">
              <div>
                <div className="font-medium">Conversation #{c.conversationId}</div>
                <div className="text-xs text-muted" title={absTime(c.updatedAt)}>
                  {c.note ? `${c.note} · ` : ''}paused {timeAgo(c.updatedAt)}
                </div>
              </div>
              <button
                className="btn-ghost"
                onClick={() => void resume.mutateAsync(c.conversationId)}
                disabled={resume.isPending}
              >
                Resume
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
