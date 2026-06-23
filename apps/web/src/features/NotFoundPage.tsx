import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <p className="text-lg font-semibold">Page not found</p>
      <Link className="btn-ghost" to="/dashboard">
        Back to dashboard
      </Link>
    </div>
  )
}
