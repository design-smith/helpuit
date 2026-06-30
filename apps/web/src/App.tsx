import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'
import { ApiError, setUnauthorizedHandler } from './lib/api'
import { AppShell } from './app/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { HomePage } from './features/setup/HomePage'
import { ConversationsListPage } from './features/conversations/ConversationsListPage'
import { ConversationDetailPage } from './features/conversations/ConversationDetailPage'
import { IssuesListPage } from './features/issues/IssuesListPage'
import { ActivityPage } from './features/activity/ActivityPage'
import { SettingsLayout } from './features/settings/SettingsLayout'
import { ConfigurationPage } from './features/settings/ConfigurationPage'
import { SecretsPage } from './features/settings/SecretsPage'
import { TestingPage } from './features/settings/TestingPage'
import { ConnectionsPage } from './features/settings/ConnectionsPage'
import { DocumentsPage } from './features/documents/DocumentsPage'
import { ManifestPage } from './features/settings/ManifestPage'
import { NotFoundPage } from './features/NotFoundPage'

/** Old /investigations/:id deep links → the conversation detail (same id). */
function RedirectInvestigation() {
  const { id = '' } = useParams()
  return <Navigate to={`/conversations/${id}`} replace />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'conversations', element: <ConversationsListPage /> },
      { path: 'conversations/:id', element: <ConversationDetailPage /> },
      { path: 'issues', element: <IssuesListPage /> },
      { path: 'activity', element: <ActivityPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="connections" replace /> },
          { path: 'connections', element: <ConnectionsPage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'configuration', element: <ConfigurationPage /> },
          { path: 'manifest', element: <ManifestPage /> },
          { path: 'secrets', element: <SecretsPage /> },
          { path: 'testing', element: <TestingPage /> },
        ],
      },
      // Back-compat redirects for the consolidated pages (bookmarks, banners, stale tabs).
      { path: 'investigations', element: <Navigate to="/conversations" replace /> },
      { path: 'investigations/:id', element: <RedirectInvestigation /> },
      { path: 'tickets', element: <Navigate to="/conversations?ticket=true" replace /> },
      { path: 'drafts', element: <Navigate to="/conversations?pendingDraft=true" replace /> },
      { path: 'jobs', element: <Navigate to="/activity" replace /> },
      { path: 'alerts', element: <Navigate to="/activity" replace /> },
      { path: 'connections', element: <Navigate to="/settings/connections" replace /> },
      { path: 'manifest', element: <Navigate to="/settings/manifest" replace /> },
      { path: 'secrets', element: <Navigate to="/settings/secrets" replace /> },
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
