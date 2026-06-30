"use client"

import { useRef, useState } from "react"
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react"
import {
  BookOpen,
  Bug,
  Check,
  FileCode2,
  GitPullRequest,
  PlayCircle,
  UserCheck,
  type LucideIcon,
} from "lucide-react"

import { Badge, PulseDot, ProgressBar } from "@/components/site/ui"
import { Reveal } from "@/components/site/motion"
import { useIsMobile } from "@/hooks/use-mobile"

type Rung = {
  id: string
  name: string
  icon: LucideIcon
  needs: string[]
  line: string
  verdict: string
  confidence: number
  optIn?: boolean
}

const RUNGS: Rung[] = [
  { id: "L1", name: "Guidance", icon: BookOpen, needs: ["GitHub", "LLM"], line: "Read the docs and the export handler. No setup mistake.", verdict: "Climb", confidence: 0.2 },
  { id: "L2", name: "Account", icon: UserCheck, needs: ["Routes", "Identity"], line: "Plan and permissions check out. The account is healthy.", verdict: "Climb", confidence: 0.34 },
  { id: "L3a", name: "Static", icon: FileCode2, needs: ["GitHub", "Manifest"], line: "Export handler swallows a 500 from the report service.", verdict: "Hypothesis", confidence: 0.72 },
  { id: "L3b", name: "Reproduced", icon: PlayCircle, needs: ["Playwright", "Sandbox"], line: "Sandbox run catches the failed request and the 500.", verdict: "Confirmed", confidence: 0.9, optIn: true },
  { id: "L4", name: "Escalated", icon: GitPullRequest, needs: ["GitHub"], line: "Filed redacted issue #4827. Customer notified.", verdict: "Done", confidence: 1 },
]

export function InvestigationScroller() {
  const isMobile = useIsMobile()
  const reduce = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  })
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(RUNGS.length - 1, Math.max(0, Math.floor(v * RUNGS.length)))
    setStep(next)
  })

  // Mobile / no-JS-friendly: a plain stamped sequence, no pinning.
  if (isMobile) {
    return (
      <section id="ladder" className="border-b-2 border-border bg-dots">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Header />
          <CustomerRow className="mt-6" />
          <div className="mt-5 space-y-4">
            {RUNGS.map((r, i) => (
              <Reveal key={r.id} variant="stamp" delay={i * 0.05}>
                <RungCard rung={r} state="active" />
              </Reveal>
            ))}
          </div>
          <Reveal variant="stamp" delay={0.1}>
            <FiledCard className="mt-4" />
          </Reveal>
        </div>
      </section>
    )
  }

  const active = RUNGS[step]

  return (
    <section id="ladder" className="border-b-2 border-border bg-dots">
      {/* Tall track creates the scroll distance for the pinned stage. */}
      <div ref={trackRef} className="relative min-h-[400vh]">
        <div className="sticky top-16 flex min-h-[calc(100vh-4rem)] items-center md:top-20 md:min-h-[calc(100vh-5rem)]">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 md:px-8 lg:grid-cols-[0.82fr_1.18fr]">
            {/* Narrative side — swaps with the active rung */}
            <div>
              <Header />
              <div className="mt-6 min-h-[150px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active.id}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={active.optIn ? "amber" : "indigo"}>{active.id}</Badge>
                      <span className="font-heading text-xl">{active.name}</span>
                      {active.optIn && <Badge tone="amber">opt-in</Badge>}
                    </div>
                    <p className="mt-3 text-lg leading-snug text-foreground">{active.line}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              {/* Step dots */}
              <div className="mt-6 flex gap-1.5">
                {RUNGS.map((r, i) => (
                  <span
                    key={r.id}
                    className={`h-2 flex-1 rounded-base border-2 border-border transition-colors ${i <= step ? "bg-main" : "bg-secondary-background"}`}
                  />
                ))}
              </div>
            </div>

            {/* The live console */}
            <ConsolePanel step={step} confidence={active.confidence} reduce={!!reduce} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Header() {
  return (
    <>
      <Badge tone="indigo" className="uppercase tracking-wide">Watch it work</Badge>
      <h2 className="mt-4 font-heading text-3xl leading-[1.05] tracking-tight md:text-5xl">
        It climbs only<br />as far as it needs.
      </h2>
      <p className="mt-3 max-w-md text-muted">One ticket. Five rungs. Scroll to follow it.</p>
    </>
  )
}

function CustomerRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-base border-2 border-border bg-secondary-background p-3 ${className}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-base border-2 border-border bg-amber-300">
        <Bug className="h-4 w-4" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted">Customer</div>
        <div className="text-sm">&ldquo;The export button does nothing.&rdquo;</div>
      </div>
    </div>
  )
}

function ConsolePanel({ step, confidence, reduce }: { step: number; confidence: number; reduce: boolean }) {
  const active = RUNGS[step]
  const fillPct = (step / (RUNGS.length - 1)) * 100
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b-2 border-border bg-main px-4 py-3 text-main-foreground">
        <div className="flex items-center gap-2 font-heading text-sm">
          <Bug className="h-4 w-4" /> Investigation #4827
        </div>
        <span className="inline-flex items-center gap-2 text-xs">
          <PulseDot /> live
        </span>
      </div>

      <div className="space-y-5 p-5">
        <CustomerRow />

        {/* Ladder with a filling spine */}
        <div className="relative pl-7">
          <div className="absolute bottom-1 left-[9px] top-1 w-0.5 bg-border/20" />
          <motion.div
            className="absolute left-[9px] top-1 w-0.5 origin-top bg-main"
            animate={{ height: `${fillPct}%` }}
            transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
            style={{ bottom: "auto" }}
          />
          <div className="space-y-2.5">
            {RUNGS.map((r, i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo"
              const Icon = r.icon
              return (
                <div key={r.id} className="relative flex items-center gap-3">
                  <span
                    className={`absolute -left-7 flex h-[18px] w-[18px] items-center justify-center rounded-base border-2 border-border transition-colors ${
                      state === "done" ? "bg-main text-main-foreground" : state === "active" ? "bg-amber-300" : "bg-secondary-background"
                    }`}
                  >
                    {state === "done" ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
                  </span>
                  <div
                    className={`flex w-full items-center gap-2 rounded-base border-2 border-border px-3 py-2 transition-all ${
                      state === "active" ? "bg-main text-main-foreground shadow-shadow" : state === "done" ? "bg-secondary-background" : "bg-secondary-background opacity-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-heading">{r.id}</span>
                    <span className="text-sm">{r.name}</span>
                    <span className="ml-auto flex gap-1">
                      {r.needs.map((n) => (
                        <span key={n} className="hidden rounded-base border-2 border-border bg-secondary-background px-1.5 text-[10px] text-foreground sm:inline">{n}</span>
                      ))}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live stream line */}
        <div className="rounded-base border-2 border-border bg-background px-3 py-2 font-mono text-xs">
          <span className="text-muted">agent&gt;</span>{" "}
          <AnimatePresence mode="wait">
            <motion.span
              key={active.id}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              {active.line}
            </motion.span>
          </AnimatePresence>
          <span className="ml-0.5 animate-blink text-main" aria-hidden>▋</span>
        </div>

        {/* Confidence + verdict */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Confidence</span>
            <span>{Math.round(confidence * 100)}%</span>
          </div>
          <ProgressBar value={confidence} />
        </div>

        {/* Filed payoff */}
        <AnimatePresence>
          {step === RUNGS.length - 1 && (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.4, ease: [0.34, 1.4, 0.5, 1] }}
            >
              <FiledCard />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function FiledCard({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-base border-2 border-border bg-emerald-300 px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-heading">
        <GitPullRequest className="h-4 w-4" /> Issue #4827 · export 500
      </div>
      <span className="rounded-base border-2 border-border bg-secondary-background px-2 py-0.5 text-xs">filed</span>
    </div>
  )
}

function RungCard({ rung }: { rung: Rung; state?: string }) {
  const Icon = rung.icon
  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center gap-2">
        <Badge tone={rung.optIn ? "amber" : "indigo"}>{rung.id}</Badge>
        <span className="font-heading">{rung.name}</span>
        {rung.optIn && <Badge tone="amber">opt-in</Badge>}
        <span className="ml-auto">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-sm text-muted">{rung.line}</p>
    </div>
  )
}
