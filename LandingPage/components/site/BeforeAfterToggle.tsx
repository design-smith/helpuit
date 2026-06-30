"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, GitPullRequest, MessageSquare, X } from "lucide-react"

type Line = { who: string; text: string; tone?: "muted" | "main" }

const WITHOUT: Line[] = [
  { who: "Customer", text: "The export button does nothing." },
  { who: "Support", text: "Can you send a screenshot?", tone: "muted" },
  { who: "Engineering", text: "Can't reproduce on my end.", tone: "muted" },
]

const WITH: Line[] = [
  { who: "Customer", text: "The export button does nothing." },
  { who: "Helpuit", text: "Checked docs, code, and the account.", tone: "main" },
  { who: "Helpuit", text: "Reproduced it. Caught a 500 on export.", tone: "main" },
]

export function BeforeAfterToggle() {
  const [on, setOn] = useState(true)
  const reduce = useReducedMotion()
  const lines = on ? WITH : WITHOUT

  return (
    <div className="card overflow-hidden p-0">
      {/* Segmented toggle */}
      <div className="grid grid-cols-2 border-b-2 border-border">
        <button
          type="button"
          onClick={() => setOn(false)}
          aria-pressed={!on}
          className={`px-4 py-3 text-sm font-heading transition-colors ${!on ? "bg-red-400 text-foreground" : "bg-secondary-background text-muted hover:text-foreground"}`}
        >
          Without Helpuit
        </button>
        <button
          type="button"
          onClick={() => setOn(true)}
          aria-pressed={on}
          className={`border-l-2 border-border px-4 py-3 text-sm font-heading transition-colors ${on ? "bg-main text-main-foreground" : "bg-secondary-background text-muted hover:text-foreground"}`}
        >
          With Helpuit
        </button>
      </div>

      <div className="min-h-[270px] space-y-3 p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={on ? "with" : "without"}
            initial={reduce ? false : { opacity: 0, x: on ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: on ? -16 : 16 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {lines.map((l, i) => (
              <div key={i} className="flex items-start gap-3 rounded-base border-2 border-border bg-secondary-background p-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-base border-2 border-border ${l.tone === "main" ? "bg-main text-main-foreground" : "bg-secondary-background"}`}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">{l.who}</div>
                  <div className="text-sm">{l.text}</div>
                </div>
              </div>
            ))}

            {on ? (
              <div className="flex items-center justify-between gap-3 rounded-base border-2 border-border bg-emerald-300 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-heading">
                  <GitPullRequest className="h-4 w-4" /> Issue #4827 filed · customer notified
                </span>
                <span className="inline-flex items-center gap-1 rounded-base border-2 border-border bg-secondary-background px-2 py-0.5 text-xs">
                  <Check className="h-3 w-3" /> ~2 min
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-base border-2 border-border bg-red-400 px-3 py-2.5">
                <span className="text-sm font-heading">Still open · no repro</span>
                <span className="inline-flex items-center gap-1 rounded-base border-2 border-border bg-secondary-background px-2 py-0.5 text-xs">
                  <X className="h-3 w-3" /> 3 days
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
