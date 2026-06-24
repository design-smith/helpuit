import { LinkButton } from '../components/ui'

export function NotFoundPage() {
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <p className="text-lg font-semibold text-ink">Page not found</p>
      <LinkButton to="/dashboard">Back to dashboard</LinkButton>
    </div>
  )
}
