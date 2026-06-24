import { Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Search,
  Ticket,
  FileText,
  PauseCircle,
  SlidersHorizontal,
  KeyRound,
  Plug,
  Boxes,
  ListChecks,
  Bell,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useLogout, usePaused, useRestartStatus, useRestartNow } from '../lib/api'
import { Banner, Button, NavButton, NavItem } from '../components/ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}
interface NavSection {
  heading: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  { heading: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    heading: 'Work',
    items: [
      { to: '/investigations', label: 'Investigations', icon: Search },
      { to: '/tickets', label: 'Tickets', icon: Ticket },
      { to: '/drafts', label: 'Drafts', icon: FileText },
      { to: '/conversations', label: 'Takeover', icon: PauseCircle },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/jobs', label: 'Jobs', icon: ListChecks },
      { to: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    heading: 'Settings',
    items: [
      { to: '/connections', label: 'Connections', icon: Plug },
      { to: '/settings', label: 'Configuration', icon: SlidersHorizontal },
      { to: '/manifest', label: 'Manifest', icon: Boxes },
      { to: '/secrets', label: 'Secrets', icon: KeyRound },
    ],
  },
]

export function AppShell() {
  const navigate = useNavigate()
  const logout = useLogout()
  const paused = usePaused()
  const pausedCount = paused.data?.length ?? 0
  const restart = useRestartStatus()
  const restartNow = useRestartNow()

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
            H
          </div>
          <span className="font-semibold tracking-tight">Helpuit</span>
        </div>
        <nav className="flex-1 space-y-6 px-3 py-2">
          {NAV.map((section) => (
            <div key={section.heading}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {section.heading}
              </div>
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  badge={item.to === '/conversations' && pausedCount > 0 ? pausedCount : undefined}
                />
              ))}
            </div>
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
        {restart.data?.pending === true && (
          <Banner tone="warn">
            <span>
              Restart required to apply saved changes:{' '}
              <span className="font-mono text-amber-100">
                {restart.data.reasons.map((r) => r.replace(':', ' ')).join(', ') || 'pending'}
              </span>
            </span>
            <Button size="sm" loading={restartNow.isPending} onClick={() => restartNow.mutate()}>
              Restart now
            </Button>
          </Banner>
        )}
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
