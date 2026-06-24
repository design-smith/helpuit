import { CheckCircle2, Circle, CircleDashed } from 'lucide-react'
import { Card, LinkButton, PageHeader } from '../../components/ui'
import type { SetupItem, SetupStatus } from './checklist'

const ICON = { done: CheckCircle2, todo: Circle, optional: CircleDashed }
const TONE: Record<SetupStatus, string> = {
  done: 'text-emerald-500',
  todo: 'text-amber-500',
  optional: 'text-muted',
}

/**
 * The Setup checklist (FCW-08): one rung per required area plus optional rungs,
 * each showing live status and linking to the page that fixes it. Pure
 * presentation over {@link SetupItem}s built from `/admin/readiness`.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const remaining = items.filter((i) => i.status === 'todo').length
  const subtitle =
    remaining === 0
      ? 'Everything required is connected — optional rungs remain when you’re ready.'
      : `${remaining} step${remaining === 1 ? '' : 's'} left before your agent is ready.`

  return (
    <div>
      <PageHeader title="Set up Helpuit" subtitle={subtitle} />
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = ICON[item.status]
          return (
            <Card key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[item.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{item.title}</span>
                    {item.status === 'optional' && <span className="text-xs uppercase tracking-wide text-muted">optional</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                  {item.unmet.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {item.unmet.map((message) => (
                        <li key={message} className="text-xs text-muted">
                          • {message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {item.status !== 'done' && (
                  <LinkButton to={item.href} variant={item.status === 'optional' ? 'ghost' : 'primary'} className="shrink-0">
                    {item.status === 'optional' ? 'Add' : 'Fix'}
                  </LinkButton>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
