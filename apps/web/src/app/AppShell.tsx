import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  MessagesSquare,
  CircleDot,
  Activity,
  SlidersHorizontal,
  Bell,
  LogOut,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { useAlertHistory, useLogout, usePaused, useRestartStatus, useRestartNow } from '../lib/api'
import { Badge, Banner, Button, Logo, NavButton, NavItem } from '../components/ui'
import { timeAgo } from '../lib/format'
import { restartBanner, restartFinished } from './restart-banner'

interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
}

// Flat nav — no section headings.
const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/issues', label: 'Issues', icon: CircleDot },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
]

function severityTone(severity: string): string {
  return severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'slate'
}

/** Top-bar alerts bell: recent threshold breaches in a dropdown panel. */
function AlertsBell() {
  const alerts = useAlertHistory()
  const [open, setOpen] = useState(false)
  const items = alerts.data ?? []

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Alerts"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-base border-2 border-border bg-secondary-background transition-all hover:shadow-shadow"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-base border-2 border-border bg-amber-300 px-1 text-[11px] text-foreground">
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-base border-2 border-border bg-secondary-background shadow-shadow">
          <div className="border-b-2 border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Alerts
          </div>
          {items.length === 0 ? (
            <p className="p-3 text-sm text-muted">No alerts.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.slice(0, 20).map((a) => (
                <li key={a.id} className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0">
                  <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{a.message}</div>
                    <div className="text-xs text-muted">
                      {a.kind} · {timeAgo(a.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const logout = useLogout()
  const paused = usePaused()
  const pausedCount = paused.data?.length ?? 0
  const restart = useRestartStatus()
  const restartNow = useRestartNow()
  const qc = useQueryClient()
  const [restarting, setRestarting] = useState(false)

  // After "Restart now" the server bounces and clears the flag on boot. Poll the
  // status fast so the banner clears the moment it's back — not on the next 20s tick.
  useEffect(() => {
    if (!restarting) return
    const poll = setInterval(() => void qc.invalidateQueries({ queryKey: ['restart-status'] }), 2_000)
    const giveUp = setTimeout(() => setRestarting(false), 60_000)
    return () => {
      clearInterval(poll)
      clearTimeout(giveUp)
    }
  }, [restarting, qc])

  useEffect(() => {
    if (restartFinished(restart.data, restarting)) setRestarting(false)
  }, [restart.data, restarting])

  const banner = restartBanner(restart.data, restarting)
  const triggerRestart = () => {
    setRestarting(true)
    restartNow.mutate()
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-border bg-surface">
        <div className="flex items-center px-5 py-4">
          <Logo className="h-7 w-auto select-none" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              badge={item.to === '/conversations' && pausedCount > 0 ? pausedCount : undefined}
            />
          ))}
        </nav>
        <NavButton
          icon={LogOut}
          label="Sign out"
          className="m-3"
          onClick={() => {
            void logout.mutateAsync().catch(() => {})
            navigate('/login')
          }}
        />
      </aside>
      <main className="flex-1 overflow-y-auto">
        {banner.kind === 'restarting' ? (
          <Banner tone="warn">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Restarting to apply changes… the console reconnects automatically.
            </span>
          </Banner>
        ) : banner.kind === 'pending' ? (
          <Banner tone="warn">
            <span>
              Restart required to apply saved changes:{' '}
              <span className="font-mono text-amber-100">
                {banner.reasons.map((r) => r.replace(':', ' ')).join(', ') || 'pending'}
              </span>
            </span>
            <Button size="sm" loading={restartNow.isPending} onClick={triggerRestart}>
              Restart now
            </Button>
          </Banner>
        ) : null}
        <div className="flex items-center justify-end border-b border-border px-6 py-2">
          <AlertsBell />
        </div>
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
