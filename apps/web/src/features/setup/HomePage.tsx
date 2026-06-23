import { useReadiness } from '../../lib/api'
import { CenteredSpinner } from '../../components/ui'
import { DashboardPage } from '../dashboard/DashboardPage'
import { SetupChecklist } from './SetupChecklist'
import { buildSetupChecklist, selectHome } from './checklist'

/**
 * The console home (FCW-08). Until the agent is ready it shows the readiness-driven
 * Setup checklist; once ready it flips to the operational dashboard. If readiness
 * can't be read (e.g. no supervisor wired), it falls back to the dashboard rather
 * than blocking the operator.
 */
export function HomePage() {
  const { data, isLoading, isError } = useReadiness()

  if (isLoading) return <CenteredSpinner label="Checking setup…" />
  if (isError || data === undefined) return <DashboardPage />

  return selectHome(data) === 'dashboard' ? <DashboardPage /> : <SetupChecklist items={buildSetupChecklist(data)} />
}
