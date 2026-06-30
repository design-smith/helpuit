import { useState, type ReactNode } from 'react'
import { Github } from 'lucide-react'
import {
  useApplySection,
  useEffectiveConfig,
  useGithubConnect,
  useSetSecret,
  useTestIdentity,
  useTestGitHub,
  useTestLlm,
  useValidateChatwoot,
  useSetupChatwoot,
  useQueryRouteScaffold,
  useSetChatwootToken,
  useToggleIntegration,
  useDisconnectConnection,
  useSupabaseConnect,
  useSupabaseProjects,
  useSupabaseTables,
  useSupabaseColumns,
  useSelectSupabaseProject,
  type ApplyResult,
  type ChatwootValidation,
  type ChatwootSetupResult,
  type GitHubTestResult,
  type IdentityTestResult,
  type LlmTestResult,
  type QueryRouteScaffoldResult,
  type EffectiveConfigView,
} from '../../lib/api'
import {
  Badge,
  Button,
  Callout,
  CenteredSpinner,
  Checkbox,
  CodeBlock,
  Disclosure,
  ErrorState,
  Field,
  FormResult,
  Input,
  PageHeader,
  Section,
  Select,
  Toggle,
} from '../../components/ui'
import { supabaseJwksUrl } from './identity-preset'
import { parseColumnList } from './scaffold-form'
import { integrationStatuses, type IntegrationStatus } from './integration-status'

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

  const statuses = integrationStatuses(data)
  const enabledMap = Object.fromEntries(statuses.map((s) => [s.id, s.enabled]))
  const advanced: Record<string, ReactNode> = {
    github: <GithubAdvanced github={data.config.github} />,
    chatwoot: <ChatwootAdvanced chatwoot={data.config.chatwoot} />,
    identity: <IdentityAdvanced identity={data.config.identity} />,
    llm: <LlmAdvanced models={data.config.models} />,
  }

  return (
    <div>
      <PageHeader
        title="Connections"
        subtitle="Connect an integration, then flip it on or off. Toggles apply live; Advanced holds manual setup + disconnect."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {statuses.map((status) => (
          <IntegrationCard key={status.id} status={status} enabledMap={enabledMap}>
            {advanced[status.id]}
          </IntegrationCard>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-heading uppercase tracking-wide text-muted">Operational helpers</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatwootTokenCard />
        <AccountDataCard data={data} />
      </div>
    </div>
  )
}

/** The card shell: account/repo summary + Connect-or-Toggle, with an Advanced disclosure. */
function IntegrationCard({
  status,
  enabledMap,
  children,
}: {
  status: IntegrationStatus
  enabledMap: Record<string, boolean>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const toggle = useToggleIntegration()
  const disconnect = useDisconnectConnection()

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-heading text-foreground">{status.label}</h3>
          {status.connected ? (
            <div className="mt-0.5 truncate text-sm text-muted">
              {status.account ?? 'connected'}
              {status.access !== undefined && <span className="font-mono"> · {status.access}</span>}
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-muted">Not connected</div>
          )}
        </div>
        <div className="shrink-0">
          {status.connected ? (
            <Toggle
              checked={status.enabled}
              disabled={status.issue !== undefined || toggle.isPending}
              label={`${status.label} on/off`}
              onChange={(next) => toggle.mutate({ ...enabledMap, [status.id]: next })}
            />
          ) : (
            <Button variant="primary" onClick={() => setOpen(true)}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {status.connected && status.issue !== undefined && (
        <Callout tone="warn">Turned off — there's an issue: {status.issue}</Callout>
      )}

      <Disclosure label="Advanced" open={open} onToggle={() => setOpen(!open)}>
        {children}
        {status.connected && (
          <div className="flex items-center gap-3 border-t-2 border-border pt-3">
            <Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate(status.id)}>
              Disconnect
            </Button>
            <span className="text-xs text-muted">Clears stored credentials. Requires a restart.</span>
          </div>
        )}
      </Disclosure>
    </div>
  )
}

function SaveRow({ result, pending, onSave }: { result: ApplyResult | null; pending: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" loading={pending} onClick={onSave}>
        Save
      </Button>
      {result?.ok === true && (
        <FormResult tone={result.mode === 'live' ? 'success' : 'warn'}>
          {result.mode === 'live' ? 'Applied' : 'Saved — restart to apply'}
        </FormResult>
      )}
      {result?.ok === false && <FormResult tone="error">{result.issues.join('; ') || 'Invalid'}</FormResult>}
    </div>
  )
}

function GithubAdvanced({ github }: { github: any }) {
  const { save, result, pending } = useSectionForm('github')
  const connect = useGithubConnect()
  const test = useTestGitHub()
  const [owner, setOwner] = useState<string>(github?.owner ?? '')
  const [repo, setRepo] = useState<string>(github?.repo ?? '')
  const [branch, setBranch] = useState<string>(github?.productionBranch ?? 'main')
  const [testResult, setTestResult] = useState<GitHubTestResult | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Recommended: connect a GitHub App — scoped to the repo you pick, short-lived tokens, webhook auto-wired.
      </p>
      <Button variant="primary" onClick={() => connect.mutate()} loading={connect.isPending}>
        <Github className="h-4 w-4" /> Connect with GitHub
      </Button>

      <div className="space-y-3 border-t-2 border-border pt-3">
        <p className="text-xs uppercase tracking-wide text-muted">Or set the repo manually (token mode)</p>
        <Field label="Owner" row>
          <Input className="w-56" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label="Repo" row>
          <Input className="w-56" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </Field>
        <Field label="Production branch" row>
          <Input className="w-56" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">Set GITHUB_TOKEN under Settings → Secrets for token mode.</p>
        <SaveRow result={result} pending={pending} onSave={() => save({ owner, repo, productionBranch: branch, auth: 'pat' })} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
        <Button
          loading={test.isPending}
          onClick={async () => {
            setTestResult(null)
            setTestResult(await test.mutateAsync())
          }}
        >
          Test connection
        </Button>
        {testResult?.ok === true && <FormResult tone="success">{testResult.detail}</FormResult>}
        {testResult?.ok === false && <FormResult tone="error">{testResult.detail}</FormResult>}
      </div>
    </div>
  )
}

function ChatwootAdvanced({ chatwoot }: { chatwoot: any }) {
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

  return (
    <div className="space-y-3">
      <Field label="Base URL" row>
        <Input className="w-56" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </Field>
      <Field label="API access token" row>
        <Input
          className="w-56"
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
        <Button onClick={onValidate} disabled={token === ''} loading={validate.isPending}>
          Validate &amp; prefill
        </Button>
        {validation?.ok === true && <FormResult tone="success">{validation.detail}</FormResult>}
        {validation?.ok === false && <FormResult tone="error">{validation.detail}</FormResult>}
      </div>
      <Field label="Account ID" row>
        <Input className="w-24 text-right" type="number" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} />
      </Field>
      <Field label="Inbox ID" row>
        <Input className="w-24 text-right" type="number" value={inboxId} onChange={(e) => setInboxId(Number(e.target.value))} />
      </Field>
      <p className="text-xs text-muted">Save the token under Settings → Secrets (CHATWOOT_API_TOKEN).</p>
      <SaveRow result={result} pending={pending} onSave={() => save({ baseUrl, accountId, inboxId })} />
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
        <Button onClick={async () => setSetupResult(await setup.mutateAsync({ baseUrl, token, accountId }))} disabled={token === '' || baseUrl === ''} loading={setup.isPending}>
          Auto-setup bot + webhook
        </Button>
        {setupResult?.ok === true && <FormResult tone="success">{setupResult.detail}</FormResult>}
        {setupResult?.ok === false && <FormResult tone="error">{setupResult.detail}</FormResult>}
        <span className="text-xs text-muted">Creates the Agent Bot + webhook in Chatwoot (idempotent). Needs HELPUIT_PUBLIC_URL.</span>
      </div>
    </div>
  )
}

function IdentityAdvanced({ identity }: { identity: any }) {
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

/** The provider's single API-key secret (multi-cred providers are set under Secrets). */
const LLM_SECRET: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
}

function LlmAdvanced({ models }: { models: any }) {
  const { save, result, pending } = useSectionForm('models')
  const secretMut = useSetSecret()
  const test = useTestLlm()
  const [provider, setProvider] = useState<string>(models?.provider ?? 'anthropic')
  const [keyValue, setKeyValue] = useState<string>('')
  const [secretSaved, setSecretSaved] = useState(false)
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)
  const keyName = LLM_SECRET[provider]

  return (
    <div className="space-y-3">
      <Field label="Provider" row>
        <Select className="w-56" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="anthropic">anthropic</option>
          <option value="openai">openai</option>
          <option value="deepseek">deepseek</option>
          <option value="bedrock">bedrock</option>
          <option value="openai-compatible">openai-compatible</option>
        </Select>
      </Field>
      <SaveRow result={result} pending={pending} onSave={() => save({ provider, tiers: models?.tiers })} />

      {keyName !== undefined ? (
        <div className="space-y-2 border-t-2 border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-muted">API key · {keyName}</p>
          <div className="flex items-center gap-3">
            <Input
              className="w-56"
              type="password"
              placeholder="enter to set / rotate"
              value={keyValue}
              onChange={(e) => {
                setKeyValue(e.target.value)
                setSecretSaved(false)
              }}
            />
            <Button
              disabled={keyValue === ''}
              loading={secretMut.isPending}
              onClick={async () => {
                await secretMut.mutateAsync({ key: keyName, value: keyValue })
                setKeyValue('')
                setSecretSaved(true)
              }}
            >
              Set key
            </Button>
            {secretSaved && <FormResult tone="warn">Saved — restart to apply</FormResult>}
          </div>
        </div>
      ) : (
        <p className="border-t-2 border-border pt-3 text-xs text-muted">
          {provider} needs multiple credentials — set them under Settings → Secrets.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
        <Button
          loading={test.isPending}
          onClick={async () => {
            setTestResult(null)
            setTestResult(await test.mutateAsync())
          }}
        >
          Test LLM
        </Button>
        {testResult?.ok === true && <FormResult tone="success">{testResult.detail}</FormResult>}
        {testResult?.ok === false && <FormResult tone="error">{testResult.detail}</FormResult>}
      </div>
      <p className="text-xs text-muted">Fine-tune per-tier models on the Configuration tab.</p>
    </div>
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
    <Section
      title="Customer token hand-off"
      hint={
        <>
          L2 account investigation needs the customer's <em>verified</em> token on the conversation. From your
          verified-auth backend, set it here (uses the configured Chatwoot creds).
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Conversation ID" row>
          <Input className="w-32 text-right" type="number" value={conversationId} onChange={(e) => setConversationId(e.target.value)} />
        </Field>
        <Field label="Verified token" row>
          <Input className="w-56" type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={authToken === '' || !Number.isInteger(Number(conversationId))}
            loading={setToken.isPending}
            onClick={async () => setResult(await setToken.mutateAsync({ conversationId: Number(conversationId), authToken }))}
          >
            Set token
          </Button>
          {result?.ok === true && <FormResult tone="success">{result.detail}</FormResult>}
          {result?.ok === false && <FormResult tone="error">{result.detail}</FormResult>}
        </div>
        <div className="border-t-2 border-border pt-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Or set it from the browser widget</p>
          <CodeBlock>{WIDGET_SNIPPET}</CodeBlock>
        </div>
      </div>
    </Section>
  )
}

/** L2 setup: generate a copy-paste Supabase Edge Function + queryRoutes config (FCW-19). */
/**
 * L2 account-data source. One-click Supabase connect (OAuth → pick project/table)
 * is primary; a Postgres connection string + the legacy Edge-Function scaffold live
 * under Advanced. All reads are column-allowlisted + scoped to the verified user.
 */
function AccountDataCard({ data }: { data: EffectiveConfigView }) {
  const ad = (data.config.accountData ?? { source: 'none', columns: [] }) as {
    source?: string
    table?: string
    columns?: string[]
    supabase?: { projectRef?: string }
  }
  const isSet = (key: string) => data.secrets.find((s) => s.key === key)?.set ?? false
  const oauthConnected = isSet('SUPABASE_OAUTH_ACCESS_TOKEN')
  const clientConfigured = isSet('SUPABASE_OAUTH_CLIENT_ID')
  const configured =
    (ad.source === 'supabase' && ad.supabase?.projectRef !== undefined) || (ad.source === 'postgres' && isSet('ACCOUNT_DB_URL'))

  const connect = useSupabaseConnect()
  const disconnect = useDisconnectConnection()
  const [advanced, setAdvanced] = useState(false)

  if (configured) {
    return (
      <Section title="Account data" hint="The agent reads the verified customer's row — column-allowlisted, never raw SQL.">
        <div className="space-y-3">
          <div className="text-sm">
            {ad.source === 'supabase' ? (
              <>
                <Badge tone="emerald">Supabase</Badge> project <span className="font-mono">{ad.supabase?.projectRef}</span>
              </>
            ) : (
              <>
                <Badge tone="emerald">Postgres</Badge> direct connection
              </>
            )}
            {ad.table !== undefined && (
              <div className="mt-1 text-muted">
                table <span className="font-mono">{ad.table}</span> · {(ad.columns ?? []).join(', ')}
              </div>
            )}
          </div>
          <Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate('accountData')}>
            Disconnect
          </Button>
        </div>
      </Section>
    )
  }

  if (oauthConnected) {
    return (
      <Section title="Account data — choose a project" hint="Pick the project + table the agent may read for account questions.">
        <SupabaseProjectPicker />
      </Section>
    )
  }

  return (
    <Section title="Account data (L2)" hint="Let the agent read a verified customer's account row to explain account-state issues.">
      <div className="space-y-3">
        {clientConfigured ? (
          <Button variant="primary" loading={connect.isPending} onClick={() => connect.mutate()}>
            Connect Supabase
          </Button>
        ) : (
          <Callout tone="info">
            Set <span className="font-mono">SUPABASE_OAUTH_CLIENT_ID</span> + <span className="font-mono">SUPABASE_OAUTH_CLIENT_SECRET</span>{' '}
            under Settings → Secrets to enable one-click Supabase connect — or use a connection string below.
          </Callout>
        )}
        <Disclosure label="Use a connection string / manual setup" open={advanced} onToggle={() => setAdvanced(!advanced)}>
          <PostgresUrlForm />
          <div className="border-t-2 border-border pt-3">
            <LegacyScaffold />
          </div>
        </Disclosure>
      </div>
    </Section>
  )
}

/** After OAuth: pick the project → table → user-id column → readable columns. */
function SupabaseProjectPicker() {
  const projects = useSupabaseProjects(true)
  const select = useSelectSupabaseProject()
  const [ref, setRef] = useState('')
  const [table, setTable] = useState('')
  const [userColumn, setUserColumn] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const tables = useSupabaseTables(ref, ref !== '')
  const cols = useSupabaseColumns(ref, table, table !== '')

  if (projects.isPending) return <CenteredSpinner />
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />

  const toggleCol = (c: string) =>
    setColumns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  return (
    <div className="space-y-3">
      <Field label="Project" row>
        <Select
          className="w-64"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value)
            setTable('')
            setUserColumn('')
            setColumns([])
          }}
        >
          <option value="">Select…</option>
          {projects.data.map((p) => (
            <option key={p.ref} value={p.ref}>
              {p.name} ({p.ref})
            </option>
          ))}
        </Select>
      </Field>
      {ref !== '' && (
        <Field label="Table" row>
          <Select
            className="w-64"
            value={table}
            onChange={(e) => {
              setTable(e.target.value)
              setUserColumn('')
              setColumns([])
            }}
          >
            <option value="">{tables.isPending ? 'Loading…' : 'Select…'}</option>
            {(tables.data ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {table !== '' && (
        <>
          <Field label="User-id column" row>
            <Select className="w-64" value={userColumn} onChange={(e) => setUserColumn(e.target.value)}>
              <option value="">{cols.isPending ? 'Loading…' : 'Select…'}</option>
              {(cols.data ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Readable columns</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(cols.data ?? []).map((c) => (
                <Checkbox key={c} label={c} checked={columns.includes(c)} onChange={() => toggleCol(c)} />
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            disabled={userColumn === '' || columns.length === 0}
            loading={select.isPending}
            onClick={async () => setResult(await select.mutateAsync({ ref, table, userColumn, columns }))}
          >
            Use this project
          </Button>
          {result?.ok === true && <FormResult tone="warn">Saved — restart to apply</FormResult>}
          {result?.ok === false && <FormResult tone="error">{result.detail}</FormResult>}
        </>
      )}
    </div>
  )
}

/** Fallback: connect any Postgres directly via a connection string. */
function PostgresUrlForm() {
  const setSecret = useSetSecret()
  const apply = useApplySection()
  const [url, setUrl] = useState('')
  const [table, setTable] = useState('')
  const [userColumn, setUserColumn] = useState('')
  const [columns, setColumns] = useState('')
  const [saved, setSaved] = useState(false)
  const allowed = parseColumnList(columns)

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted">Postgres connection string</p>
      <Field label="Connection string" row>
        <Input className="w-72" type="password" placeholder="postgresql://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Table" row>
        <Input className="w-48" value={table} onChange={(e) => setTable(e.target.value)} />
      </Field>
      <Field label="User-id column" row>
        <Input className="w-48" value={userColumn} onChange={(e) => setUserColumn(e.target.value)} />
      </Field>
      <Field label="Allowed columns" row>
        <Input className="w-56" placeholder="plan, status" value={columns} onChange={(e) => setColumns(e.target.value)} />
      </Field>
      <Button
        variant="primary"
        disabled={url === '' || table.trim() === '' || userColumn.trim() === '' || allowed.length === 0}
        loading={setSecret.isPending || apply.isPending}
        onClick={async () => {
          await setSecret.mutateAsync({ key: 'ACCOUNT_DB_URL', value: url })
          await apply.mutateAsync({ section: 'accountData', value: { source: 'postgres', table, userColumn, columns: allowed } })
          setSaved(true)
        }}
      >
        Save
      </Button>
      {saved && <FormResult tone="warn">Saved — restart to apply</FormResult>}
    </div>
  )
}

/** Legacy: generate a read-only Edge Function for the customer to deploy themselves. */
function LegacyScaffold() {
  const scaffold = useQueryRouteScaffold()
  const [table, setTable] = useState<string>('profiles')
  const [userColumn, setUserColumn] = useState<string>('id')
  const [columns, setColumns] = useState<string>('plan, status')
  const [result, setResult] = useState<QueryRouteScaffoldResult | null>(null)
  const allowed = parseColumnList(columns)

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted">Or generate an Edge Function to deploy yourself</p>
      <Field label="Table" row>
        <Input className="w-48" value={table} onChange={(e) => setTable(e.target.value)} />
      </Field>
      <Field label="User-id column" row>
        <Input className="w-48" value={userColumn} onChange={(e) => setUserColumn(e.target.value)} />
      </Field>
      <Field label="Allowed columns" row>
        <Input className="w-56" value={columns} onChange={(e) => setColumns(e.target.value)} />
      </Field>
      <Button
        disabled={table.trim() === '' || userColumn.trim() === '' || allowed.length === 0}
        loading={scaffold.isPending}
        onClick={async () => setResult(await scaffold.mutateAsync({ table, userColumn, allowedColumns: allowed }))}
      >
        Generate scaffold
      </Button>
      {result !== null && (
        <div className="space-y-3 border-t-2 border-border pt-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">supabase/functions/{result.functionName}/index.ts</p>
            <CodeBlock scroll>{result.functionTs}</CodeBlock>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">helpuit.config.yaml</p>
            <CodeBlock>{result.configYaml}</CodeBlock>
          </div>
        </div>
      )}
    </div>
  )
}
