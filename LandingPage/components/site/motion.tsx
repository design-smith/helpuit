"use client"

import type { CSSProperties, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react"

import { useIsMobile } from "@/hooks/use-mobile"

/**
 * Motion primitives for the landing page. Every effect is gated on
 * `useReducedMotion()` so the page collapses to static when the OS asks.
 * The vocabulary is neobrutalism-native: hard, snappy "stamp" arrivals
 * (a touch of overshoot), not soft fades.
 */

type RevealVariant = "stamp" | "rise" | "left" | "right"

const VARIANTS: Record<RevealVariant, { x?: number; y?: number; scale?: number }> = {
  stamp: { x: -7, y: -7, scale: 0.96 },
  rise: { y: 22 },
  left: { x: -32 },
  right: { x: 32 },
}

// Snappy "stamp" overshoot vs. a calmer ease for rises.
const STAMP_EASE = [0.34, 1.4, 0.5, 1] as const
const RISE_EASE = [0.16, 1, 0.3, 1] as const

export function Reveal({
  children,
  variant = "rise",
  delay = 0,
  amount = 0.3,
  className,
  style,
}: {
  children: ReactNode
  variant?: RevealVariant
  delay?: number
  amount?: number
  className?: string
  style?: CSSProperties
}) {
  const reduce = useReducedMotion()
  const from = VARIANTS[variant]
  const isStamp = variant === "stamp"

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, x: from.x ?? 0, y: from.y ?? 0, scale: from.scale ?? 1 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount }}
      transition={{
        duration: isStamp ? 0.46 : 0.55,
        delay,
        ease: isStamp ? STAMP_EASE : RISE_EASE,
      }}
    >
      {children}
    </motion.div>
  )
}

/** Count from 0 → `to` when scrolled into view. */
export function CountUp({
  to,
  suffix = "",
  duration = 1.4,
  className,
}: {
  to: number
  suffix?: string
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const [val, setVal] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setVal(to)
      return
    }
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setVal(v),
    })
    return () => controls.stop()
  }, [inView, to, duration, reduce])

  return (
    <span ref={ref} className={className}>
      {Math.round(val)}
      {suffix}
    </span>
  )
}

/** Types `text` out character-by-character when in view, with a blinking caret. */
export function StreamingText({
  text,
  speed = 26,
  startDelay = 350,
  className,
  caretClassName = "text-main",
}: {
  text: string
  speed?: number
  startDelay?: number
  className?: string
  caretClassName?: string
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setN(text.length)
      return
    }
    let i = 0
    let tick: ReturnType<typeof setTimeout>
    const step = () => {
      i += 1
      setN(i)
      if (i < text.length) tick = setTimeout(step, speed)
    }
    const start = setTimeout(step, startDelay)
    return () => {
      clearTimeout(start)
      clearTimeout(tick)
    }
  }, [inView, text, speed, startDelay, reduce])

  const done = n >= text.length
  return (
    <span ref={ref} className={className}>
      {text.slice(0, n)}
      <span className={`${caretClassName} ${done ? "animate-blink" : ""}`} aria-hidden>
        ▋
      </span>
    </span>
  )
}

/** Thin page-scroll progress bar pinned to the very top. */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-main"
      style={{ scaleX }}
      aria-hidden
    />
  )
}

/** Pointer-driven 3D tilt with a hover lift (desktop, motion-on only). */
export function TiltCard({
  children,
  className,
  max = 10,
}: {
  children: ReactNode
  className?: string
  max?: number
}) {
  const reduce = useReducedMotion()
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 260, damping: 16 })
  const sry = useSpring(ry, { stiffness: 260, damping: 16 })

  if (reduce || isMobile) {
    return <div className={className}>{children}</div>
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry.set(px * max * 2)
    rx.set(-py * max * 2)
  }
  const reset = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      onPointerMove={onMove}
      onPointerLeave={reset}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      style={{
        rotateX: srx,
        rotateY: sry,
        transformPerspective: 1000,
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      {children}
    </motion.div>
  )
}
