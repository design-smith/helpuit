import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ApiError, setUnauthorizedHandler } from './lib/api'
import { AppShell } from './app/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { HomePage } from './features/setup/HomePage'
import { InvestigationsListPage } from './features/investigations/InvestigationsListPage'
import { InvestigationDetailPage } from './features/investigations/InvestigationDetailPage'
import { TicketsListPage } from './features/tickets/TicketsListPage'
import { DraftsPage } from './features/drafts/DraftsPage'
import { ConversationsPage } from './features/conversations/ConversationsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SecretsPage } from './features/settings/SecretsPage'
import { ConnectionsPage } from './features/settings/ConnectionsPage'
import { ManifestPage } from './features/settings/ManifestPage'
import { JobsPage } from './features/operations/JobsPage'
import { AlertsPage } from './features/operations/AlertsPage'
import { NotFoundPage } from './features/NotFoundPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'investigations', element: <InvestigationsListPage /> },
      { path: 'investigations/:id', element: <InvestigationDetailPage /> },
      { path: 'tickets', element: <TicketsListPage /> },
      { path: 'drafts', element: <DraftsPage /> },
      { path: 'conversations', element: <ConversationsPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'manifest', element: <ManifestPage /> },
      { path: 'secrets', element: <SecretsPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

// Any request that 401s sends the operator back to the login screen.
setUnauthorizedHandler(() => {
  if (window.location.pathname !== '/login') void router.navigate('/login')
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
