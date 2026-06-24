import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../../lib/api'
import { Button, Field, FormResult, Input } from '../../components/ui'

export function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const login = useLogin()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login.mutateAsync(token)
      navigate('/dashboard')
    } catch {
      setError('Invalid admin token')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
            H
          </div>
          <div>
            <div className="font-semibold text-ink">Helpuit Console</div>
            <div className="text-xs text-muted">Operator sign-in</div>
          </div>
        </div>
        <Field label="Admin token">
          <Input
            type="password"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="HELPUIT_ADMIN_TOKEN"
          />
        </Field>
        {error !== null && (
          <FormResult tone="error" className="mt-2">
            {error}
          </FormResult>
        )}
        <Button variant="primary" type="submit" className="mt-4 w-full" disabled={token === ''} loading={login.isPending}>
          Sign in
        </Button>
        <p className="mt-3 text-center text-xs text-muted">
          The token is set as <span className="font-mono">HELPUIT_ADMIN_TOKEN</span> in your env.
        </p>
      </form>
    </div>
  )
}
