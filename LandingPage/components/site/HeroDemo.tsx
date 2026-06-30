"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"
import { Check, MessageSquare, MousePointer2 } from "lucide-react"

import { PulseDot } from "@/components/site/ui"
import { TiltCard } from "@/components/site/motion"

const TERMINAL = [
  "reading the conversation",
  "searching the docs",
  "reading ExportButton.tsx",
  "reproducing in a sandbox",
  "filing the GitHub issue",
]

// chatStep: 1 customer · 2 typing · 3 agent reply · 4 buttons · 5 pointer · 6 press
// term: 0..TERMINAL.length stream lines, then +1 shows "Ticket filed".

export function HeroDemo() {
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef, { amount: 0.4 })
  const [phase, setPhase] = useState<"chat" | "backend">("chat")
  const [chatStep, setChatStep] = useState(1)
  const [term, setTerm] = useState(0)

  useEffect(() => {
    if (reduce) {
      setPhase("backend")
      setChatStep(6)
      setTerm(TERMINAL.length + 1)
      return
    }
    if (!inView) return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        timers.push(setTimeout(res, ms))
      })

    async function run() {
      while (!cancelled) {
        setPhase("chat")
        setTerm(0)
        setChatStep(1)
        await wait(900)
        if (cancelled) return
        setChatStep(2) // typing
        await wait(1300)
        if (cancelled) return
        setChatStep(3) // agent reply
        await wait(1100)
        if (cancelled) return
        setChatStep(4) // buttons
        await wait(800)
        if (cancelled) return
        setChatStep(5) // pointer glides in
        await wait(750)
        if (cancelled) return
        setChatStep(6) // press
        await wait(320)
        if (cancelled) return
        setPhase("backend") // swipe right
        await wait(520)
        for (let i = 1; i <= TERMINAL.length + 1; i++) {
          if (cancelled) return
          setTerm(i)
          await wait(i === TERMINAL.length + 1 ? 400 : 460)
        }
        await wait(2500) // hold on "filed"
        if (cancelled) return
        setChatStep(1) // reset the chat off-screen before swiping back
        setPhase("chat")
        await wait(560)
      }
    }
    run()
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [reduce, inView])

  return (
    <div ref={rootRef}>
      <TiltCard className="card mx-auto w-full max-w-[400px] overflow-hidden p-0">
        <div className="overflow-hidden">
          <motion.div
            className="flex w-[200%]"
            initial={false}
            animate={{ x: phase === "chat" ? "-50%" : "0%" }}
            transition={{ duration: reduce ? 0 : 0.34, ease: [0.7, 0, 0.2, 1] }}
          >
            {/* left half = backend */}
            <div className="w-1/2 shrink-0">
              <BackendPanel term={term} reduce={!!reduce} />
            </div>
            {/* right half = chat */}
            <div className="w-1/2 shrink-0">
              <ChatPanel step={chatStep} reduce={!!reduce} />
            </div>
          </motion.div>
        </div>
      </TiltCard>
    </div>
  )
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[52px] shrink-0 items-center justify-between border-b-2 border-border px-4">{children}</div>
}

function ChatPanel({ step, reduce }: { step: number; reduce: boolean }) {
  const fromY = reduce ? false : { opacity: 0, y: 10 }
  const toY = { opacity: 1, y: 0 }
  const t = { duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] as const }
  return (
    <div className="flex h-[512px] flex-col bg-secondary-background">
      <PanelHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <div className="font-heading text-sm">Helpuit</div>
            <div className="text-[10px] text-muted">Support</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted"><PulseDot /> online</span>
      </PanelHeader>

      <div className="flex flex-1 flex-col justify-end gap-3 p-4">
        {/* customer */}
        {step >= 1 && (
          <motion.div initial={fromY} animate={toY} transition={t} className="flex justify-end">
            <div className="max-w-[80%] rounded-base border-2 border-border bg-main px-3 py-2 text-sm text-main-foreground">
              The export button does nothing.
            </div>
          </motion.div>
        )}

        {/* typing */}
        {step === 2 && (
          <motion.div initial={fromY} animate={toY} transition={t} className="flex justify-start">
            <div className="flex items-center gap-1 rounded-base border-2 border-border bg-background px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* agent reply */}
        {step >= 3 && (
          <motion.div initial={fromY} animate={toY} transition={t} className="flex justify-start">
            <div className="max-w-[88%] rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
              This one&apos;s going to need the IT experts to look at it. Can I file a ticket for you?
            </div>
          </motion.div>
        )}

        {/* buttons */}
        {step >= 4 && (
          <motion.div initial={fromY} animate={toY} transition={t} className="flex gap-2 pt-1">
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-base border-2 border-border bg-main px-3 py-2 text-sm font-heading text-main-foreground shadow-shadow transition-all"
                style={step === 6 ? { transform: "translate(4px, 4px)", boxShadow: "none" } : undefined}
              >
                File a ticket
              </button>
              {step >= 5 && (
                <motion.span
                  className="pointer-events-none absolute -bottom-2 -right-2 text-foreground"
                  initial={reduce ? false : { opacity: 0, x: 16, y: 16 }}
                  animate={{ opacity: 1, x: step === 6 ? 2 : 0, y: step === 6 ? 2 : 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <MousePointer2 className="h-5 w-5 fill-secondary-background" />
                </motion.span>
              )}
            </div>
            <button type="button" className="rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-sm font-heading text-muted">
              Not now
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function BackendPanel({ term, reduce }: { term: number; reduce: boolean }) {
  const shown = Math.min(term, TERMINAL.length)
  const filed = term > TERMINAL.length
  return (
    <div className="flex h-[512px] flex-col bg-foreground text-background">
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-background/40 bg-red-400" />
          <span className="h-3 w-3 rounded-full border-2 border-background/40 bg-amber-300" />
          <span className="h-3 w-3 rounded-full border-2 border-background/40 bg-emerald-300" />
        </div>
        <span className="font-mono text-[11px] text-background/70">investigation #4827</span>
      </PanelHeader>

      <div className="flex-1 space-y-2 p-4 font-mono text-xs leading-relaxed">
        {TERMINAL.slice(0, shown).map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-main">&gt;</span>
            <span>
              {line}
              {i === shown - 1 && !filed && <span className="ml-0.5 animate-blink text-main">▋</span>}
            </span>
          </div>
        ))}
        {filed && (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.34, 1.4, 0.5, 1] }}
            className="mt-2 inline-flex items-center gap-2 rounded-base border-2 border-border bg-emerald-300 px-2.5 py-1.5 font-heading text-foreground"
          >
            <Check className="h-4 w-4" /> Ticket filed · #4827
          </motion.div>
        )}
      </div>
    </div>
  )
}
