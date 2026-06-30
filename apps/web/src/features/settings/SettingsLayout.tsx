import { Outlet } from 'react-router-dom'
import { Tabs } from '../../components/ui'

// One Settings page; each former page is now a tab. URL-synced so tabs are
// deep-linkable and the browser back button works.
const TABS = [
  { to: '/settings/connections', label: 'Connections' },
  { to: '/settings/documents', label: 'Documents' },
  { to: '/settings/configuration', label: 'Configuration' },
  { to: '/settings/manifest', label: 'Manifest' },
  { to: '/settings/secrets', label: 'Secrets' },
  { to: '/settings/testing', label: 'Testing' },
]

export function SettingsLayout() {
  return (
    <div>
      <Tabs items={TABS} />
      <div className="mt-5">
        <Outlet />
      </div>
    </div>
  )
}
