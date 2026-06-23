import { useState, type ReactNode } from 'react'
import { Github } from 'lucide-react'
import {
  useApplySection,
  useEffectiveConfig,
  useGithubConnect,
  useSetSecret,
  useTestIdentity,
  useTestGitHub,
  useValidateChatwoot,
  useSetupChatwoot,
  useQueryRouteScaffold,
  useSetChatwootToken,
  type ApplyResult,
  type ChatwootValidation,
  type ChatwootSetupResult,
  type GitHubTestResult,
  type IdentityTestResult,
  type QueryRouteScaffoldResult,
} from '../../lib/api'
import { Badge, Card, CenteredSpinner, ErrorState, PageHeader } from '../../components/ui'
import { supabaseJwksUrl } from './identity-preset'
import { parseColumnList } from './scaffold-form'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  )
}

function useSectionForm(section: string) {
  const apply = useApplySection()
  const [result, setResult] = useState<ApplyResult | null>(null)
  const save = async (value: unknown) => setResult(await apply.mutateAsync({ section, value }))
  return { save, result, pending: apply.isPending }
}

export function ConnectionsPage() {
  const { data, isPending, isError, error, refetch } = useEffectiveConfig()
  if (isPending) return <CenteredSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div>
      <PageHeader
        title="Connections"
        subtitle="Connect your GitHub repo, Chatwoot, and customer identity. Changes here apply on the next restart."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <GithubCard github={data.config.github} />
        <ChatwootCard chatwoot={data.config.chatwoot} />
        <IdentityCard identity={data.config.identity} />
        <ChatwootTokenCard />
        <AccountDataCard />
      </div>
    </div>
  )
}

function SaveRow({ result, pending, onSave }: { result: ApplyResult | null; pending: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button className="btn-primary" onClick={onSave} disabled={pending}>
        {pending ? 'Saving…' : 'Save (restart to apply)'}
      </button>
      {result?.ok === true && <span className="text-sm text-amber-300">Saved — restart to apply</span>}
      {result?.ok === false && <span className="text-sm text-red-400">{result.issues.join('; ') || 'Invalid'}</span>}
    </div>
  )
}

function GithubCard({ github }: { github: any }) {
  const { save, result, pending } = useSectionForm('github')
  const connect = useGithubConnect()
  const test = useTestGitHub()
  const connected = github.auth === 'app'
  const [owner, setOwner] = useState<string>(github.owner ?? '')
  const [repo, setRepo] = useState<string>(github.repo ?? '')
  const [branch, setBranch] = useState<string>(github.productionBranch ?? 'main')
  const [testResult, setTestResult] = useState<GitHubTestResult | null>(null)

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Github className="h-4 w-4" />
        <h2 className="font-semibold">GitHub</h2>
        {connected ? <Badge tone="emerald">App connected</Badge> : <Badge tone="slate">token mode</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          disabled={test.isPending}
          onClick={async () => {
            setTestResult(null)
            setTestResult(await test.mutateAsync())
          }}
        >
          {test.isPending ? 'Testing…' : 'Test connection'}
        </button>
        {testResult?.ok === true && <span className="text-sm text-emerald-400">{testResult.detail}</span>}
        {testResult?.ok === false && <span className="text-sm text-red-400">{testResult.detail}</span>}
      </div>

      {connected ? (
        <div className="space-y-1 text-sm">
          <div>
            Connected as App <span className="font-mono">{github.slug ?? github.appId}</span>
            {github.installationId !== undefined && (
              <span className="text-muted"> · installation {github.installationId}</span>
            )}
          </div>
          <div className="text-muted">
            Repo: <span className="font-mono">{github.owner}/{github.repo}</span>
          </div>
          <button className="btn-ghost mt-2" onClick={() => connect.mutate()} disabled={connect.isPending}>
            Reconnect / change repo
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Recommended: connect a GitHub App — scoped to the repo you pick, short-lived tokens, webhook auto-wired.
          </p>
          <button className="btn-primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
            <Github className="h-4 w-4" /> Connect with GitHub
          </button>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Or set the repo manually (token mode)</p>
            <div className="space-y-3">
              <Field label="Owner">
                <input className="input w-56" value={owner} onChange={(e) => setOwner(e.target.value)} />
              </Field>
              <Field label="Repo">
                <input className="input w-56" value={repo} onChange={(e) => setRepo(e.target.value)} />
              </Field>
              <Field label="Production branch">
                <input className="input w-56" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </Field>
              <p className="text-xs text-muted">Set the GITHUB_TOKEN under Secrets for token mode.</p>
              <SaveRow
                result={result}
                pending={pending}
                onSave={() => save({ owner, repo, productionBranch: branch, auth: 'pat' })}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function ChatwootCard({ chatwoot }: { chatwoot: any }) {
  const { save, result, pending } = useSectionForm('chatwoot')
  const validate = useValidateChatwoot()
  const setup = useSetupChatwoot()
  const [baseUrl, setBaseUrl] = useState<string>(chatwoot?.baseUrl ?? '')
  const [accountId, setAccountId] = useState<number>(chatwoot?.accountId ?? 1)
  const [inboxId, setInboxId] = useState<number>(chatwoot?.inboxId ?? 1)
  const [token, setToken] = useState<string>('')
  const [validation, setValidation] = useState<ChatwootValidation | null>(null)
  const [setupResult, setSetupResult] = useState<ChatwootSetupResult | null>(null)

  async function onValidate() {
    const v = await validate.mutateAsync({ baseUrl, token })
    setValidation(v)
    if (v.ok) {
      if (v.accountId !== undefined) setAccountId(v.accountId)
      if (v.inboxId !== undefined) setInboxId(v.inboxId)
    }
  }

  async function onAutoSetup() {
    setSetupResult(await setup.mutateAsync({ baseUrl, token, accountId }))
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Chatwoot</h2>
      <p className="text-sm text-muted">Your Chatwoot instance + the inbox Helpuit serves. Validate your token to prefill account &amp; inbox.</p>
      <div className="space-y-3">
        <Field label="Base URL">
          <input className="input w-56" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <Field label="API access token">
          <input
            className="input w-56"
            type="password"
            placeholder="validate to prefill"
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setValidation(null)
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" onClick={onValidate} disabled={validate.isPending || token === ''}>
            {validate.isPending ? 'Validating…' : 'Validate & prefill'}
          </button>
          {validation?.ok === true && <span className="text-sm text-emerald-400">{validation.detail}</span>}
          {validation?.ok === false && <span className="text-sm text-red-400">{validation.detail}</span>}
        </div>
        <Field label="Account ID">
          <input className="input w-24 text-right" type="number" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} />
        </Field>
        <Field label="Inbox ID">
          <input className="input w-24 text-right" type="number" value={inboxId} onChange={(e) => setInboxId(Number(e.target.value))} />
        </Field>
        <p className="text-xs text-muted">Save the token under Secrets (CHATWOOT_API_TOKEN); Save below applies the URL, account &amp; inbox on restart.</p>
        <SaveRow result={result} pending={pending} onSave={() => save({ baseUrl, accountId, inboxId })} />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={onAutoSetup}
            disabled={setup.isPending || token === '' || baseUrl === ''}
          >
            {setup.isPending ? 'Setting up…' : 'Auto-setup bot + webhook'}
          </button>
          {setupResult?.ok === true && <span className="text-sm text-emerald-400">{setupResult.detail}</span>}
          {setupResult?.ok === false && <span className="text-sm text-red-400">{setupResult.detail}</span>}
          <span className="text-xs text-muted">Creates the Agent Bot + webhook in Chatwoot (idempotent). Needs HELPUIT_PUBLIC_URL.</span>
        </div>
      </div>
    </Card>
  )
}

function IdentityCard({ identity }: { identity: any }) {
  const { save, result, pending } = useSectionForm('identity')
  const secretMut = useSetSecret()
  const test = useTestIdentity()
  const [mode, setMode] = useState<string>(identity?.mode ?? 'hmac')
  const [useridClaim, setUseridClaim] = useState<string>(identity?.useridClaim ?? 'sub')
  const [jwksUrl, setJwksUrl] = useState<string>(identity?.jwksUrl ?? '')
  const [verifyUrl, setVerifyUrl] = useState<string>(identity?.verifyUrl ?? '')
  const [secretValue, setSecretValue] = useState<string>('')
  const [secretSaved, setSecretSaved] = useState(false)
  const [supabaseRef, setSupabaseRef] = useState<string>('')
  const [testResult, setTestResult] = useState<IdentityTestResult | null>(null)

  const secretKey = mode === 'hmac' ? 'IDENTITY_HMAC_SECRET' : mode === 'endpoint' ? 'IDENTITY_VERIFY_TOKEN' : null

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Identity</h2>
      <p className="text-sm text-muted">
        How Helpuit verifies who a customer is before reading their account. Applies on the next restart.
      </p>
      <div className="space-y-3">
        <Field label="Mode">
          <select className="input w-48" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="hmac">hmac (shared secret)</option>
            <option value="jwt">jwt (JWKS)</option>
            <option value="endpoint">endpoint (verify URL)</option>
          </select>
        </Field>
        <Field label="User-id claim">
          <input className="input w-48" value={useridClaim} onChange={(e) => setUseridClaim(e.target.value)} />
        </Field>
        {mode === 'jwt' && (
          <>
            <Field label="JWKS URL">
              <input className="input w-56" value={jwksUrl} onChange={(e) => setJwksUrl(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input w-40"
                placeholder="Supabase project ref"
                value={supabaseRef}
                onChange={(e) => setSupabaseRef(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={supabaseRef.trim() === ''}
                onClick={() => setJwksUrl(supabaseJwksUrl(supabaseRef))}
              >
                Use Supabase preset
              </button>
              <span className="text-xs text-muted">Fills the JWKS URL from your Supabase project ref.</span>
            </div>
          </>
        )}
        {mode === 'endpoint' && (
          <Field label="Verify URL">
            <input className="input w-56" value={verifyUrl} onChange={(e) => setVerifyUrl(e.target.value)} />
          </Field>
        )}
        <SaveRow
          result={result}
          pending={pending}
          onSave={() =>
            save({
              mode,
              useridClaim,
              ...(mode === 'jwt' ? { jwksUrl } : {}),
              ...(mode === 'endpoint' ? { verifyUrl } : {}),
            })
          }
        />
        {secretKey !== null && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-muted">
              {mode === 'hmac' ? 'Shared secret' : 'Verify token'} · {secretKey}
            </p>
            <div className="flex items-center gap-3">
              <input
                className="input w-56"
                type="password"
                placeholder="enter to set / rotate"
                value={secretValue}
                onChange={(e) => {
                  setSecretValue(e.target.value)
                  setSecretSaved(false)
                }}
              />
              <button
                className="btn-ghost"
                disabled={secretMut.isPending || secretValue === ''}
                onClick={async () => {
                  await secretMut.mutateAsync({ key: secretKey, value: secretValue })
                  setSecretValue('')
                  setSecretSaved(true)
                }}
              >
                {secretMut.isPending ? 'Saving…' : 'Set secret'}
              </button>
              {secretSaved && <span className="text-sm text-amber-300">Saved — restart to apply</span>}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <button
            type="button"
            className="btn-ghost"
            disabled={test.isPending}
            onClick={async () => {
              setTestResult(null)
              setTestResult(await test.mutateAsync())
            }}
          >
            {test.isPending ? 'Testing…' : 'Test identity'}
          </button>
          {testResult?.ok === true && <span className="text-sm text-emerald-400">{testResult.detail}</span>}
          {testResult?.ok === false && <span className="text-sm text-red-400">{testResult.detail}</span>}
          <span className="text-xs text-muted">Checks the saved identity config (verify a sample / reach JWKS / ping endpoint).</span>
        </div>
      </div>
    </Card>
  )
}

const WIDGET_SNIPPET = `// After your app verifies the customer and mints their Helpuit token:
window.$chatwoot?.setCustomAttributes({ helpuit_auth_token: helpuitToken })`

/** L2 hand-off: get the verified customer token onto a Chatwoot conversation (FCW-20). */
function ChatwootTokenCard() {
  const setToken = useSetChatwootToken()
  const [conversationId, setConversationId] = useState<string>('')
  const [authToken, setAuthToken] = useState<string>('')
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Customer token hand-off</h2>
      <p className="text-sm text-muted">
        L2 account investigation needs the customer's <em>verified</em> token on the conversation. From your
        verified-auth backend, set it here (uses the configured Chatwoot creds).
      </p>
      <div className="space-y-3">
        <Field label="Conversation ID">
          <input
            className="input w-32 text-right"
            type="number"
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
          />
        </Field>
        <Field label="Verified token">
          <input className="input w-56" type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={setToken.isPending || authToken === '' || !Number.isInteger(Number(conversationId))}
            onClick={async () => setResult(await setToken.mutateAsync({ conversationId: Number(conversationId), authToken }))}
          >
            {setToken.isPending ? 'Setting…' : 'Set token'}
          </button>
          {result?.ok === true && <span className="text-sm text-emerald-400">{result.detail}</span>}
          {result?.ok === false && <span className="text-sm text-red-400">{result.detail}</span>}
        </div>
        <div className="border-t border-border pt-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Or set it from the browser widget</p>
          <pre className="overflow-x-auto rounded bg-surface-2 p-3 text-xs">{WIDGET_SNIPPET}</pre>
        </div>
      </div>
    </Card>
  )
}

/** L2 setup: generate a copy-paste Supabase Edge Function + queryRoutes config (FCW-19). */
function AccountDataCard() {
  const scaffold = useQueryRouteScaffold()
  const [table, setTable] = useState<string>('profiles')
  const [userColumn, setUserColumn] = useState<string>('id')
  const [columns, setColumns] = useState<string>('plan, status')
  const [result, setResult] = useState<QueryRouteScaffoldResult | null>(null)
  const allowed = parseColumnList(columns)

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Account data (L2)</h2>
      <p className="text-sm text-muted">
        Generate a read-only Supabase Edge Function (+ the config to paste) so the agent can investigate a
        verified customer's account — column-allowlisted, never raw SQL.
      </p>
      <div className="space-y-3">
        <Field label="Table">
          <input className="input w-48" value={table} onChange={(e) => setTable(e.target.value)} />
        </Field>
        <Field label="User-id column">
          <input className="input w-48" value={userColumn} onChange={(e) => setUserColumn(e.target.value)} />
        </Field>
        <Field label="Allowed columns">
          <input className="input w-56" value={columns} onChange={(e) => setColumns(e.target.value)} />
        </Field>
        <button
          type="button"
          className="btn-primary"
          disabled={scaffold.isPending || table.trim() === '' || userColumn.trim() === '' || allowed.length === 0}
          onClick={async () => setResult(await scaffold.mutateAsync({ table, userColumn, allowedColumns: allowed }))}
        >
          {scaffold.isPending ? 'Generating…' : 'Generate scaffold'}
        </button>
        {result !== null && (
          <div className="space-y-3 border-t border-border pt-3">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">supabase/functions/{result.functionName}/index.ts</p>
              <pre className="max-h-72 overflow-auto rounded bg-surface-2 p-3 text-xs">{result.functionTs}</pre>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">helpuit.config.yaml</p>
              <pre className="overflow-x-auto rounded bg-surface-2 p-3 text-xs">{result.configYaml}</pre>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
