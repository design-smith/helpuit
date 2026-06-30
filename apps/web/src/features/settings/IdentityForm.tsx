import { useState } from 'react'
import {
  useApplySection,
  useEffectiveConfig,
  useSetSecret,
  useTestIdentity,
  type ApplyResult,
  type IdentityTestResult,
} from '../../lib/api'
import { Button, Field, FormResult, Input, Select, Spinner } from '../../components/ui'
import { supabaseJwksUrl } from './identity-preset'

/**
 * The customer-identity verifier configuration (mode + key/URL + secret + a live
 * "Test identity" check) — the single source of truth for this setup. Used INLINE
 * in the dashboard's Getting-started card AND as the persistent editor on the
 * Connections tab. Self-contained: reads the current `identity` section from the
 * effective config so it can be dropped in anywhere with no prop threading.
 */
export function IdentityForm() {
  const config = useEffectiveConfig()
  if (config.isPending) return <Spinner label="Loading…" />
  if (config.isError) return <FormResult tone="error">Couldn't load configuration.</FormResult>
  return <IdentityFormInner identity={config.data.config.identity} />
}

/** The identity form initialised from an already-loaded `identity` config section. */
export function IdentityFormInner({ identity }: { identity: any }) {
  const apply = useApplySection()
  const secretMut = useSetSecret()
  const test = useTestIdentity()
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [mode, setMode] = useState<string>(identity?.mode ?? 'hmac')
  const [useridClaim, setUseridClaim] = useState<string>(identity?.useridClaim ?? 'sub')
  const [jwksUrl, setJwksUrl] = useState<string>(identity?.jwksUrl ?? '')
  const [verifyUrl, setVerifyUrl] = useState<string>(identity?.verifyUrl ?? '')
  const [secretValue, setSecretValue] = useState<string>('')
  const [secretSaved, setSecretSaved] = useState(false)
  const [supabaseRef, setSupabaseRef] = useState<string>('')
  const [testResult, setTestResult] = useState<IdentityTestResult | null>(null)

  const secretKey = mode === 'hmac' ? 'IDENTITY_HMAC_SECRET' : mode === 'endpoint' ? 'IDENTITY_VERIFY_TOKEN' : null

  async function save(): Promise<void> {
    setResult(
      await apply.mutateAsync({
        section: 'identity',
        value: {
          mode,
          useridClaim,
          ...(mode === 'jwt' ? { jwksUrl } : {}),
          ...(mode === 'endpoint' ? { verifyUrl } : {}),
        },
      }),
    )
  }

  return (
    <div className="space-y-3">
      <Field label="Mode" row>
        <Select className="w-48" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="hmac">hmac (shared secret)</option>
          <option value="jwt">jwt (JWKS)</option>
          <option value="endpoint">endpoint (verify URL)</option>
        </Select>
      </Field>
      <Field label="User-id claim" row>
        <Input className="w-48" value={useridClaim} onChange={(e) => setUseridClaim(e.target.value)} />
      </Field>
      {mode === 'jwt' && (
        <>
          <Field label="JWKS URL" row>
            <Input className="w-56" value={jwksUrl} onChange={(e) => setJwksUrl(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-40" placeholder="Supabase project ref" value={supabaseRef} onChange={(e) => setSupabaseRef(e.target.value)} />
            <Button disabled={supabaseRef.trim() === ''} onClick={() => setJwksUrl(supabaseJwksUrl(supabaseRef))}>
              Use Supabase preset
            </Button>
          </div>
        </>
      )}
      {mode === 'endpoint' && (
        <Field label="Verify URL" row>
          <Input className="w-56" value={verifyUrl} onChange={(e) => setVerifyUrl(e.target.value)} />
        </Field>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" loading={apply.isPending} onClick={() => void save()}>
          Save
        </Button>
        {result?.ok === true && (
          <FormResult tone={result.mode === 'live' ? 'success' : 'warn'}>
            {result.mode === 'live' ? 'Applied' : 'Saved — restart to apply'}
          </FormResult>
        )}
        {result?.ok === false && <FormResult tone="error">{result.issues.join('; ') || 'Invalid'}</FormResult>}
      </div>

      {secretKey !== null && (
        <div className="space-y-2 border-t-2 border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-muted">
            {mode === 'hmac' ? 'Shared secret' : 'Verify token'} · {secretKey}
          </p>
          <div className="flex items-center gap-3">
            <Input
              className="w-56"
              type="password"
              placeholder="enter to set / rotate"
              value={secretValue}
              onChange={(e) => {
                setSecretValue(e.target.value)
                setSecretSaved(false)
              }}
            />
            <Button
              disabled={secretValue === ''}
              loading={secretMut.isPending}
              onClick={async () => {
                await secretMut.mutateAsync({ key: secretKey, value: secretValue })
                setSecretValue('')
                setSecretSaved(true)
              }}
            >
              Set secret
            </Button>
            {secretSaved && <FormResult tone="warn">Saved — restart to apply</FormResult>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
        <Button
          loading={test.isPending}
          onClick={async () => {
            setTestResult(null)
            setTestResult(await test.mutateAsync())
          }}
        >
          Test identity
        </Button>
        {testResult?.ok === true && <FormResult tone="success">{testResult.detail}</FormResult>}
        {testResult?.ok === false && <FormResult tone="error">{testResult.detail}</FormResult>}
      </div>
    </div>
  )
}
