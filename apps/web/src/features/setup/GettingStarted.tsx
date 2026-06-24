import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, CheckToggle, ListRow, Section } from '../../components/ui'
import {
  GETTING_STARTED_STEPS,
  GETTING_STARTED_STORAGE_KEY,
  loadState,
  serializeState,
  toggleStep,
  dismiss,
  completedCount,
  type GettingStartedState,
} from './getting-started'

// youtube-nocookie defers any cookies until the operator hits play.
const VIDEO_EMBED = 'https://www.youtube-nocookie.com/embed/6YS2hdV6dAo'

function readPersisted(): GettingStartedState {
  try {
    return loadState(localStorage.getItem(GETTING_STARTED_STORAGE_KEY))
  } catch {
    return { done: {}, dismissed: false }
  }
}

/**
 * Dashboard onboarding card: a guided-setup video alongside a hand-checked task
 * list. "I'm all good now" dismisses the whole card for good. Checked + dismissed
 * state persists per-browser (localStorage); it's a guide, not configuration.
 */
export function GettingStarted() {
  const [state, setState] = useState<GettingStartedState>(readPersisted)

  const persist = (next: GettingStartedState): void => {
    setState(next)
    try {
      localStorage.setItem(GETTING_STARTED_STORAGE_KEY, serializeState(next))
    } catch {
      // storage unavailable — still works in-memory for this session
    }
  }

  if (state.dismissed) return null

  const done = completedCount(state)
  const total = GETTING_STARTED_STEPS.length

  return (
    <Section
      title="Getting started"
      hint={`Watch the quick tour, then connect your tools — ${done} of ${total} done.`}
      className="mb-4"
      footer={
        <Button variant="primary" className="ml-auto" onClick={() => persist(dismiss(state))}>
          I&apos;m all good now
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          <iframe
            className="h-full w-full"
            src={VIDEO_EMBED}
            title="Helpuit setup guide"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <ul className="space-y-2">
          {GETTING_STARTED_STEPS.map((step) => {
            const checked = state.done[step.id] === true
            return (
              <li key={step.id}>
                <ListRow
                  actions={
                    <Link to={step.href} className="text-xs text-accent hover:underline">
                      Open
                    </Link>
                  }
                >
                  <CheckToggle checked={checked} onClick={() => persist(toggleStep(state, step.id))} label={step.title} />
                </ListRow>
              </li>
            )
          })}
        </ul>
      </div>
    </Section>
  )
}
