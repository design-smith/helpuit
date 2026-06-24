import { useState } from 'react'
import { usePaused, usePauseConversation, useResumeConversation } from '../../lib/api'
import { Button, CenteredSpinner, EmptyState, ErrorState, Field, Input, ListRow, PageHeader, Section } from '../../components/ui'
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

      <Section title="Pause a conversation" className="mb-6">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Conversation ID" className="w-40">
            <Input value={convId} onChange={(e) => setConvId(e.target.value)} placeholder="e.g. 42" inputMode="numeric" />
          </Field>
          <Field label="Note (optional)" className="flex-1">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="handling manually" />
          </Field>
          <Button variant="primary" onClick={doPause} disabled={convId === ''} loading={pause.isPending}>
            Pause
          </Button>
        </div>
      </Section>

      {paused.isPending ? (
        <CenteredSpinner />
      ) : paused.isError ? (
        <ErrorState error={paused.error} onRetry={() => void paused.refetch()} />
      ) : paused.data.length === 0 ? (
        <EmptyState title="No paused conversations" hint="The agent is handling everything autonomously." />
      ) : (
        <div className="space-y-2">
          {paused.data.map((c) => (
            <ListRow
              key={c.conversationId}
              actions={
                <Button onClick={() => void resume.mutateAsync(c.conversationId)} loading={resume.isPending}>
                  Resume
                </Button>
              }
            >
              <div className="font-medium text-ink">Conversation #{c.conversationId}</div>
              <div className="text-xs text-muted" title={absTime(c.updatedAt)}>
                {c.note ? `${c.note} · ` : ''}paused {timeAgo(c.updatedAt)}
              </div>
            </ListRow>
          ))}
        </div>
      )}
    </div>
  )
}
