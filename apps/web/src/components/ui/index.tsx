import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Loader2, AlertTriangle, CheckCircle2, Circle, Inbox, type LucideIcon } from 'lucide-react'

/**
 * THE design system — neobrutalism (thick black borders, hard offset shadows, bold
 * flat fills, chunky type, press-to-translate hover). Every page composes from these
 * primitives; no page defines its own controls or status colors. Visual tokens live
 * in `tailwind.config.js` (`main`/`background`/`secondary-background`/`foreground`/
 * `border` + `boxShadowX/Y` + `radius-base` + `font-base/heading`) and `index.css`
 * (CSS vars + the `.btn*`/`.input`/`.card`/`.th`/`.td` base classes). The full
 * vendored neobrutalism library lives beside this file in `components/ui/*` for
 * direct use; this barrel is the console's reskinned, stable surface over it.
 */

/** Join class fragments, dropping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens — status → tone. Bold flat fills + black text (the border is in the base).
// ─────────────────────────────────────────────────────────────────────────────

/** Badge tones — bold flat fill + black text; the `border-2 border-border` is in the base. */
const BADGE_TONES: Record<string, string> = {
  slate: 'bg-secondary-background text-foreground',
  sky: 'bg-sky-300 text-foreground',
  amber: 'bg-amber-300 text-foreground',
  emerald: 'bg-emerald-300 text-foreground',
  red: 'bg-red-400 text-foreground',
  indigo: 'bg-main text-main-foreground',
}

/** Inline message tone → text color (success/error/warn feedback under forms). */
export type MessageTone = 'success' | 'error' | 'warn' | 'muted'
const MESSAGE_TONES: Record<MessageTone, string> = {
  success: 'text-green-700',
  error: 'text-red-700',
  warn: 'text-amber-700',
  muted: 'text-muted',
}

/** Callout/banner tone → bold fill (the `border-2 border-border` is in the base). */
export type CalloutTone = 'info' | 'warn' | 'error' | 'success'
const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: 'bg-secondary-background text-foreground',
  warn: 'bg-amber-300 text-foreground',
  error: 'bg-red-400 text-foreground',
  success: 'bg-emerald-300 text-foreground',
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('card p-4', className)}>{children}</div>
}

/** A titled card: header (title + hint + actions) → body → optional footer row. */
export function Section({
  title,
  hint,
  icon,
  actions,
  footer,
  className = '',
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
    <Card className={cx('space-y-4', className)}>
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-heading text-foreground">{title}</h1>
        {subtitle !== undefined && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Forms
// ─────────────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'ghost' | 'danger'
export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'
  return (
    <button
      type={props.type ?? 'button'}
      className={cx(variantClass, size === 'sm' && 'btn-sm', className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...props} />
}

/** A react-router `Link` that looks like a {@link Button} (for navigation actions). */
export function LinkButton({
  to,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'
  return (
    <Link to={to} className={cx(variantClass, size === 'sm' && 'btn-sm', className)}>
      {children}
    </Link>
  )
}

export function Textarea({
  mono = false,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea className={cx('input', mono && 'font-mono text-xs', className)} {...props} />
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({
  label,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cx('flex items-center gap-2 text-sm text-foreground', className)}>
      <input type="checkbox" className="h-5 w-5 rounded-base border-2 border-border accent-main" {...props} />
      {label !== undefined && label}
    </label>
  )
}

/** An icon-based checkable item (ringed circle → green check) with a strike-through label. */
export function CheckToggle({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={checked} className="flex items-center gap-3 text-left">
      {checked ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted" />
      )}
      <span className={cx('text-sm', checked ? 'text-muted line-through' : 'text-foreground')}>{label}</span>
    </button>
  )
}

/** Labelled control. Stacked by default; `row` puts the label and control on one line. */
export function Field({
  label,
  hint,
  htmlFor,
  row = false,
  className = '',
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
      <label className={cx('flex items-center justify-between gap-4', className)}>
        <span className="text-sm text-muted">{label}</span>
        {children}
      </label>
    )
  }
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-heading text-muted">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Inline success/error/warn message under a form action. Renders nothing when empty. */
export function FormResult({ tone = 'muted', className = '', children }: { tone?: MessageTone; className?: string; children?: ReactNode }) {
  if (children === undefined || children === null || children === false || children === '') return null
  return <p className={cx('text-sm font-base', MESSAGE_TONES[tone], className)}>{children}</p>
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback / status
// ─────────────────────────────────────────────────────────────────────────────

export function Badge({ tone = 'slate', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 text-xs font-base',
        BADGE_TONES[tone] ?? BADGE_TONES.slate,
      )}
    >
      {children}
    </span>
  )
}

/** A bordered, tone-coloured banner (restart-required, required-secrets, etc.). */
export function Callout({
  tone = 'info',
  className = '',
  children,
}: {
  tone?: CalloutTone
  className?: string
  children: ReactNode
}) {
  return <div className={cx('rounded-base border-2 border-border p-3 text-sm font-base', CALLOUT_TONES[tone], className)}>{children}</div>
}

/** A flush, full-width tone bar (e.g. the top-of-page "restart required" notice). */
export function Banner({ tone = 'warn', className = '', children }: { tone?: CalloutTone; className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 border-border px-6 py-2 text-sm font-base', CALLOUT_TONES[tone], className)}>
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

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label !== undefined && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function CenteredSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-6 w-6 text-red-600" />
      <p className="text-sm text-muted">{message}</p>
      {onRetry !== undefined && <Button onClick={onRetry}>Retry</Button>}
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

/** The pulsing "live" dot used by real-time feeds. */
export function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-border bg-green-500" />
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data display
// ─────────────────────────────────────────────────────────────────────────────

export function Table({ head, children, className = '' }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('card overflow-hidden', className)}>
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

/** A clickable-feel table row with the standard hover. */
export function Row({ className = '', children, ...props }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx('hover:bg-background', className)} {...props}>
      {children}
    </tr>
  )
}

/** A label → value pair (uppercase muted label over its value). */
export function Detail({ label, className = '', children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

/** A bordered list row: content on the left, optional actions on the right. */
export function ListRow({ actions, className = '', children }: { actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 rounded-base border-2 border-border bg-secondary-background px-3 py-2.5', className)}>
      <div className="min-w-0">{children}</div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Monospace block for JSON/code/log snippets. `scroll` caps height + scrolls. */
export function CodeBlock({ scroll = false, className = '', children }: { scroll?: boolean; className?: string; children: ReactNode }) {
  return (
    <pre
      className={cx(
        'overflow-x-auto rounded-base border-2 border-border bg-secondary-background p-3 text-xs text-foreground',
        scroll && 'max-h-72 overflow-auto',
        className,
      )}
    >
      {children}
    </pre>
  )
}

/** A track + accent fill. `value` is 0..1. */
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  return (
    <div className={cx('h-4 overflow-hidden rounded-base border-2 border-border bg-secondary-background', className)}>
      <div className="h-full bg-main" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative space-y-4 border-l-2 border-border pl-5">{children}</ol>
}

export function TimelineItem({ children }: { children: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[0.95rem] top-1 h-3 w-3 -translate-x-1/2 rounded-base border-2 border-border bg-main" />
      {children}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay
// ─────────────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose} role="presentation">
      <div className="card max-h-[85vh] w-full max-w-2xl overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
          <h2 className="font-heading text-foreground">{title}</h2>
          <button className="text-foreground hover:text-main" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">{children}</div>
        {footer !== undefined && <div className="flex justify-end gap-2 border-t-2 border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

/** Sidebar nav link with the standard active state + optional count badge. */
export function NavItem({ to, icon: Icon, label, badge }: { to: string; icon: LucideIcon; label: string; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-base border-2 px-2.5 py-2 text-sm font-base transition-all',
          isActive
            ? 'border-border bg-main text-main-foreground shadow-shadow'
            : 'border-transparent text-foreground hover:border-border hover:bg-secondary-background',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {badge !== undefined && badge !== null && badge !== false && (
        <span className="ml-auto rounded-base border-2 border-border bg-amber-300 px-1.5 text-xs text-foreground">{badge}</span>
      )}
    </NavLink>
  )
}

/** A sidebar action styled like a {@link NavItem} (e.g. Sign out) but driven by onClick. */
export function NavButton({ icon: Icon, label, onClick, className = '' }: { icon: LucideIcon; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-2.5 rounded-base border-2 border-transparent px-2.5 py-2 text-sm font-base text-foreground transition-all hover:border-border hover:bg-secondary-background',
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
