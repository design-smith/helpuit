import type { ReactNode } from 'react'
import { Loader2, AlertTriangle, Inbox } from 'lucide-react'

// Static tone → classes map (full strings so Tailwind doesn't purge them).
const TONES: Record<string, string> = {
  slate: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  sky: 'bg-sky-900/40 text-sky-300 border-sky-700/40',
  amber: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  emerald: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  red: 'bg-red-950/50 text-red-300 border-red-800/50',
  indigo: 'bg-accent-soft text-indigo-200 border-indigo-700/50',
}

export function Badge({ tone = 'slate', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.slate}`}
    >
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint !== undefined && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle !== undefined && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
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
      <AlertTriangle className="h-6 w-6 text-red-400" />
      <p className="text-sm text-muted">{message}</p>
      {onRetry !== undefined && (
        <button className="btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-6 w-6 text-muted" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b border-border bg-surface-2">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card max-h-[85vh] w-full max-w-2xl overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button className="text-muted hover:text-ink" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">{children}</div>
        {footer !== undefined && (
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}
