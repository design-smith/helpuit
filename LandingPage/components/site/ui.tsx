import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { AlertTriangle, CheckCircle2, Inbox, Loader2, type LucideIcon } from "lucide-react"

/**
 * THE design system — neobrutalism (thick black borders, hard offset shadows,
 * bold flat fills, chunky type, press-to-translate hover). This barrel is a
 * Next-adapted copy of the operator console's stable surface
 * (apps/web/src/components/ui/index.tsx): react-router links become plain
 * anchors, and interactive-only helpers are dropped. Visual tokens live in
 * app/globals.css, alongside the base button, input, card and table classes.
 */

/** Join class fragments, dropping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

// ─── Tokens — status → tone. Bold flat fills + black text (border is in the base) ───

const BADGE_TONES: Record<string, string> = {
  slate: "bg-secondary-background text-foreground",
  sky: "bg-sky-300 text-foreground",
  amber: "bg-amber-300 text-foreground",
  emerald: "bg-emerald-300 text-foreground",
  red: "bg-red-400 text-foreground",
  indigo: "bg-main text-main-foreground",
}

export type CalloutTone = "info" | "warn" | "error" | "success"
const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: "bg-secondary-background text-foreground",
  warn: "bg-amber-300 text-foreground",
  error: "bg-red-400 text-foreground",
  success: "bg-emerald-300 text-foreground",
}

// ─── Layout ───

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cx("card p-4", className)}>{children}</div>
}

/** A titled card: header (title + hint + actions) → body → optional footer row. */
export function Section({
  title,
  hint,
  icon,
  actions,
  footer,
  className = "",
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cx("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-foreground">
            {icon}
            {title}
          </h2>
          {hint !== undefined && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
      {footer !== undefined && <div className="flex items-center gap-3 border-t-2 border-border pt-3">{footer}</div>}
    </Card>
  )
}

// ─── Controls ───

export type ButtonVariant = "primary" | "ghost" | "danger"
function variantClass(variant: ButtonVariant): string {
  return variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost"
}

export function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      type={props.type ?? "button"}
      className={cx(variantClass(variant), size === "sm" && "btn-sm", className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/** An anchor that looks like a {@link Button} (for navigation / external links). */
export function LinkButton({
  href,
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <a href={href} className={cx(variantClass(variant), size === "sm" && "btn-sm", className)} {...props}>
      {children}
    </a>
  )
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...props} />
}

export function Textarea({
  mono = false,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea className={cx("input", mono && "font-mono text-xs", className)} {...props} />
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("input", className)} {...props}>
      {children}
    </select>
  )
}

/** Labelled control. Stacked by default; `row` puts the label and control on one line. */
export function Field({
  label,
  hint,
  htmlFor,
  row = false,
  className = "",
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  row?: boolean
  className?: string
  children: ReactNode
}) {
  if (row) {
    return (
      <label className={cx("flex items-center justify-between gap-4", className)}>
        <span className="text-sm text-muted">{label}</span>
        {children}
      </label>
    )
  }
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-heading text-muted">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

// ─── Feedback / status ───

export function Badge({ tone = "slate", className = "", children }: { tone?: string; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 text-xs font-base",
        BADGE_TONES[tone] ?? BADGE_TONES.slate,
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A bordered, tone-coloured banner (info / warn / error / success). */
export function Callout({
  tone = "info",
  className = "",
  children,
}: {
  tone?: CalloutTone
  className?: string
  children: ReactNode
}) {
  return <div className={cx("rounded-base border-2 border-border p-3 text-sm font-base", CALLOUT_TONES[tone], className)}>{children}</div>
}

/** A flush, full-width tone bar. */
export function Banner({ tone = "warn", className = "", children }: { tone?: CalloutTone; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 border-border px-6 py-2 text-sm font-base", CALLOUT_TONES[tone], className)}>
      {children}
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-heading text-foreground">{value}</div>
      {hint !== undefined && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-6 w-6 text-muted" />
      <p className="text-sm font-heading text-foreground">{title}</p>
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-6 w-6 text-red-600" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}

/** The pulsing "live" dot used by real-time feeds. */
export function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-border bg-green-500" />
    </span>
  )
}

// ─── Data display ───

export function Table({ head, children, className = "" }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b-2 border-border bg-main text-main-foreground">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y-2 divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function Row({ className = "", children, ...props }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx("hover:bg-background", className)} {...props}>
      {children}
    </tr>
  )
}

/** A label → value pair (uppercase muted label over its value). */
export function Detail({ label, className = "", children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

/** A bordered list row: content on the left, optional actions on the right. */
export function ListRow({ actions, className = "", children }: { actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex items-center justify-between gap-3 rounded-base border-2 border-border bg-secondary-background px-3 py-2.5", className)}>
      <div className="min-w-0">{children}</div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Monospace block for JSON/code/log snippets. `scroll` caps height + scrolls. */
export function CodeBlock({ scroll = false, className = "", children }: { scroll?: boolean; className?: string; children: ReactNode }) {
  return (
    <pre
      className={cx(
        "overflow-x-auto rounded-base border-2 border-border bg-secondary-background p-3 text-xs text-foreground",
        scroll && "max-h-72 overflow-auto",
        className,
      )}
    >
      {children}
    </pre>
  )
}

/** A track + accent fill. `value` is 0..1. */
export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  return (
    <div className={cx("h-4 overflow-hidden rounded-base border-2 border-border bg-secondary-background", className)}>
      <div className="h-full bg-main" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Timeline({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ol className={cx("relative space-y-6 border-l-2 border-border pl-6", className)}>{children}</ol>
}

export function TimelineItem({ children }: { children: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[1.2rem] top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-base border-2 border-border bg-main" />
      {children}
    </li>
  )
}

/** A standalone icon chip (bordered square with a flat fill) for feature cards. */
export function IconChip({ icon: Icon, tone = "indigo", className = "" }: { icon: LucideIcon; tone?: string; className?: string }) {
  return (
    <span className={cx("inline-flex h-11 w-11 items-center justify-center rounded-base border-2 border-border shadow-shadow", BADGE_TONES[tone] ?? BADGE_TONES.indigo, className)}>
      <Icon className="h-5 w-5" />
    </span>
  )
}
