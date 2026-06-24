import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
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
    <section className="card mb-4 p-4 lg:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">Getting started</h2>
        <p className="mt-0.5 text-sm text-muted">
          Watch the quick tour, then connect your tools — {done} of {total} done.
        </p>
      </div>

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
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => persist(toggleStep(state, step.id))}
                  aria-pressed={checked}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {checked ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted" />
                  )}
                  <span className={`text-sm ${checked ? 'text-muted line-through' : 'text-ink'}`}>{step.title}</span>
                </button>
                <Link to={step.href} className="shrink-0 text-xs text-accent hover:underline">
                  Open
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="button" className="btn-primary" onClick={() => persist(dismiss(state))}>
          I&apos;m all good now
        </button>
      </div>
    </section>
  )
}
