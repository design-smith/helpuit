import { useState, type ReactNode } from 'react'
import { Github } from 'lucide-react'
import {
  useApplySection,
  useEffectiveConfig,
  useGithubInstall,
  useGithubRepos,
  useSelectGithubRepo,
  useConnectGithubApp,
  useSetSecret,
  useTestGitHub,
  useTestLlm,
  useValidateChatwoot,
  useSetupChatwoot,
  useQueryRouteScaffold,
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
  LinkButton,
  Modal,
  PageHeader,
  Section,
  Select,
  Spinner,
  Textarea,
  Toggle,
} from '../../components/ui'
import { parseColumnList } from './scaffold-form'
import { integrationStatuses, availableLlmProviders, type IntegrationStatus } from './integration-status'

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
  }

  return (
    <div>
      <PageHeader
        title="Connections"
        subtitle="Connect an integration, then flip it on or off. Toggles apply live; Advanced holds manual setup + disconnect."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {statuses.map((status) =>
          status.id === 'llm' ? (
            <LlmCard key={status.id} status={status} view={data} />
          ) : (
            <IntegrationCard key={status.id} status={status} enabledMap={enabledMap}>
              {advanced[status.id]}
            </IntegrationCard>
          ),
        )}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-heading uppercase tracking-wide text-muted">Operational helpers</h2>
      <div className="grid gap-4 lg:grid-cols-2">
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
  const install = useGithubInstall()
  const selectRepo = useSelectGithubRepo()
  const test = useTestGitHub()
  const hasApp = Boolean(github?.appId ?? github?.slug)
  const repos = useGithubRepos(hasApp)
  const currentRepo = github?.owner && github?.repo ? `${github.owner}/${github.repo}` : ''
  const [owner, setOwner] = useState<string>(github?.owner ?? '')
  const [repo, setRepo] = useState<string>(github?.repo ?? '')
  const [branch, setBranch] = useState<string>(github?.productionBranch ?? 'main')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [extOpen, setExtOpen] = useState(false)
  const [testResult, setTestResult] = useState<GitHubTestResult | null>(null)

  return (
    <div className="space-y-4">
      {/* GitHub App: create once, then reuse to add/reconfigure repos (never a new app). */}
      <div className="space-y-2">
        <p className="text-sm text-muted">
          {hasApp
            ? 'A GitHub App is connected. Add or reconfigure repositories — the same app is reused, never recreated.'
            : 'Recommended: connect a GitHub App — scoped to the repos you pick, short-lived tokens, webhook auto-wired.'}
        </p>
        <Button variant="primary" onClick={() => install.mutate()} loading={install.isPending}>
          <Github className="h-4 w-4" /> {hasApp ? 'Add / reconfigure repositories' : 'Connect with GitHub'}
        </Button>
        {hasApp && (
          <div className="text-xs text-muted">
            App <span className="font-mono text-foreground">{github.slug ?? github.appId}</span>
            {github.installationId !== undefined && <> · installation #{github.installationId}</>}
          </div>
        )}
      </div>

      {/* Repo picker — the operator chooses the exact repo from the installation. */}
      {hasApp && (
        <div className="space-y-2 border-t-2 border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-muted">Repository to use</p>
          {repos.isPending ? (
            <Spinner label="Loading repositories…" />
          ) : repos.isError ? (
            <FormResult tone="error">Couldn't list repositories — finish installing the app above, then reopen.</FormResult>
          ) : repos.data.length === 0 ? (
            <FormResult tone="warn">No repositories granted yet — use “Add / reconfigure repositories” and grant access.</FormResult>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-72"
                value={repos.data.some((r) => r.fullName === currentRepo) ? currentRepo : ''}
                disabled={selectRepo.isPending}
                onChange={(e) => {
                  const choice = repos.data.find((r) => r.fullName === e.target.value)
                  if (choice !== undefined) void selectRepo.mutateAsync({ owner: choice.owner, repo: choice.repo })
                }}
              >
                <option value="">Select a repository…</option>
                {repos.data.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                  </option>
                ))}
              </Select>
              {selectRepo.isPending && <Spinner />}
              {selectRepo.data?.status === 'ok' && <FormResult tone="warn">Saved — restart to apply</FormResult>}
            </div>
          )}
        </div>
      )}

      {/* Bring an existing, externally-created GitHub App. */}
      <div className="border-t-2 border-border pt-3">
        <Disclosure label="Use an existing GitHub App (paste credentials)" open={extOpen} onToggle={() => setExtOpen(!extOpen)}>
          <ExistingAppForm />
        </Disclosure>
      </div>

      {/* Manual PAT mode. */}
      <div className="border-t-2 border-border pt-3">
        <Disclosure label="Set the repo manually (token mode)" open={tokenOpen} onToggle={() => setTokenOpen(!tokenOpen)}>
          <div className="space-y-3">
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
        </Disclosure>
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

/** Link a GitHub App created outside Helpuit: App id + private key (PEM) + installation id. */
function ExistingAppForm() {
  const connectApp = useConnectGithubApp()
  const [appId, setAppId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [installationId, setInstallationId] = useState('')
  const [slug, setSlug] = useState('')
  const ready = appId.trim() !== '' && privateKey.trim() !== '' && Number.isInteger(Number(installationId))

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        From your app's settings on GitHub (Developer settings → GitHub Apps). The private key (.pem) is sealed in the
        vault; the rest is non-secret config.
      </p>
      <Field label="App ID" row>
        <Input className="w-56" value={appId} onChange={(e) => setAppId(e.target.value)} />
      </Field>
      <Field label="Installation ID" row>
        <Input className="w-56" type="number" value={installationId} onChange={(e) => setInstallationId(e.target.value)} />
      </Field>
      <Field label="App slug (optional)" row>
        <Input className="w-56" placeholder="for the install/reconfigure link" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <Field label="Private key (PEM)">
        <Textarea
          mono
          rows={4}
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;…&#10;-----END RSA PRIVATE KEY-----"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!ready}
          loading={connectApp.isPending}
          onClick={() =>
            void connectApp.mutateAsync({
              appId: appId.trim(),
              privateKey,
              installationId: Number(installationId),
              slug: slug.trim() === '' ? undefined : slug.trim(),
            })
          }
        >
          Link app
        </Button>
        {connectApp.data?.status === 'ok' && <FormResult tone="warn">Linked — pick a repo above, then restart to apply.</FormResult>}
        {connectApp.data?.status === 'invalid' && <FormResult tone="error">{connectApp.data.message ?? 'Invalid input.'}</FormResult>}
      </div>
    </div>
  )
}

function ChatwootAdvanced({ chatwoot }: { chatwoot: any }) {
  const { save, result, pending } = useSectionForm('chatwoot')
  const setSecret = useSetSecret()
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
      <Callout tone="info" className="text-xs">
        Where to get it: in Chatwoot, click your <strong>avatar (bottom-left)</strong> →{' '}
        <strong>Profile Settings</strong> → scroll to <strong>Access Token</strong> → copy. You must be an{' '}
        <strong>Administrator</strong> (agents can't see the token, and creating the bot/webhook needs admin rights).
        This is <em>not</em> an inbox identifier or website token. Paste it above, then <strong>Validate &amp; prefill</strong>.
      </Callout>
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
      <SaveRow
        result={result}
        pending={pending || setSecret.isPending}
        onSave={async () => {
          if (token !== '') await setSecret.mutateAsync({ key: 'CHATWOOT_API_TOKEN', value: token })
          save({ baseUrl, accountId, inboxId })
        }}
      />
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

/**
 * The LLM provider card: there's nothing to "connect" — you add a provider's key
 * under Secrets, then SELECT it here. The dropdown lists only providers whose key
 * is set, so it doubles as "which providers are available". Selecting one applies
 * live. Per-tier models are tuned on the Configuration tab.
 */
function LlmCard({ status, view }: { status: IntegrationStatus; view: EffectiveConfigView }) {
  const apply = useApplySection()
  const test = useTestLlm()
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const available = availableLlmProviders(view)
  const provider = (view.config.models?.provider as string | undefined) ?? ''

  async function selectProvider(next: string): Promise<void> {
    await apply.mutateAsync({ section: 'models', value: { provider: next, tiers: view.config.models?.tiers } })
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-heading text-foreground">{status.label}</h3>
          <div className="mt-0.5 truncate text-sm text-muted">
            {status.connected ? (
              <>
                {status.account}
                {status.access !== undefined && <span className="font-mono"> · {status.access}</span>}
              </>
            ) : (
              'No provider selected'
            )}
          </div>
        </div>
        <div className="shrink-0">
          {available.length > 0 ? (
            <Select
              className="w-44"
              value={available.includes(provider) ? provider : ''}
              disabled={apply.isPending}
              onChange={(e) => void selectProvider(e.target.value)}
            >
              {!available.includes(provider) && <option value="">Select provider…</option>}
              {available.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            <Button variant="primary" onClick={() => setShowSetup(true)}>
              Connect
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={showSetup}
        title="Connect an LLM provider"
        onClose={() => setShowSetup(false)}
        footer={
          <>
            <LinkButton to="/settings/secrets" variant="primary">
              Go to Secrets
            </LinkButton>
            <Button onClick={() => setShowSetup(false)}>Close</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Helpuit reaches your model through a provider key. Add one and the provider becomes selectable here.</p>
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              In <span className="font-mono">Settings → Secrets</span>, set a provider key, for example{' '}
              <span className="font-mono">ANTHROPIC_API_KEY</span>.
            </li>
            <li>
              Other options: <span className="font-mono">OPENAI_API_KEY</span>, <span className="font-mono">DEEPSEEK_API_KEY</span>,
              AWS Bedrock credentials, or an OpenAI-compatible base URL and key.
            </li>
            <li>Come back here and pick the provider from the dropdown.</li>
          </ol>
        </div>
      </Modal>

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
        <Button
          loading={test.isPending}
          disabled={!status.connected}
          onClick={async () => {
            setTestResult(null)
            setTestResult(await test.mutateAsync())
          }}
        >
          Test LLM
        </Button>
        {testResult?.ok === true && <FormResult tone="success">{testResult.detail}</FormResult>}
        {testResult?.ok === false && <FormResult tone="error">{testResult.detail}</FormResult>}
        <span className="text-xs text-muted">Keys are managed under Secrets. Per-tier models on the Configuration tab.</span>
      </div>
    </div>
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
  const [showSetup, setShowSetup] = useState(false)

  // One cohesive card (like the GitHub card): a clear status, a Disconnect that's
  // available in ANY connected state — including OAuth-connected-but-not-yet-configured,
  // so you can always back out — and the connect flow when nothing is wired.
  const connected = configured || oauthConnected

  // The redirect now goes back to wherever you OPEN the console (this origin), so it's
  // stable if you use a stable URL. It must be registered verbatim on the OAuth app,
  // or authorize fails with "redirect_uri not allowed".
  const redirectUri = `${window.location.origin}/admin/connect/supabase/callback`
  const ephemeralTunnel = window.location.host.includes('trycloudflare.com')

  return (
    <Section
      title="Database"
      hint="Let the agent read a verified customer's account row — column-allowlisted, never raw SQL — to explain account-state issues."
      actions={
        connected ? (
          <Button variant="danger" size="sm" loading={disconnect.isPending} onClick={() => disconnect.mutate('accountData')}>
            Disconnect
          </Button>
        ) : undefined
      }
    >
      {configured ? (
        <div className="space-y-1 text-sm">
          {ad.source === 'supabase' ? (
            <div>
              <Badge tone="emerald">Supabase</Badge> project <span className="font-mono">{ad.supabase?.projectRef}</span>
            </div>
          ) : (
            <div>
              <Badge tone="emerald">Postgres</Badge> direct connection
            </div>
          )}
          {ad.table !== undefined && (
            <div className="text-muted">
              table <span className="font-mono">{ad.table}</span> · {(ad.columns ?? []).join(', ')}
            </div>
          )}
          <p className="pt-1 text-xs text-muted">Disconnect (top right) to switch projects or change the source.</p>
        </div>
      ) : oauthConnected ? (
        <div className="space-y-3">
          <div className="text-sm">
            <Badge tone="sky">Authorized</Badge> Connected to Supabase — pick the project and table to read.
          </div>
          <SupabaseProjectPicker />
          <p className="text-xs text-muted">
            Wrong account, or stuck? Disconnect (top right) and start over — or use a manual connection string instead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Button
              variant="primary"
              loading={connect.isPending}
              onClick={() => (clientConfigured ? connect.mutate() : setShowSetup(true))}
            >
              Connect Supabase
            </Button>
            {!clientConfigured && (
              <p className="text-xs text-muted">First time? We&apos;ll walk you through the one-time setup.</p>
            )}
          </div>
          <Disclosure label="Use a connection string / manual setup" open={advanced} onToggle={() => setAdvanced(!advanced)}>
            <PostgresUrlForm />
            <div className="border-t-2 border-border pt-3">
              <LegacyScaffold />
            </div>
          </Disclosure>
        </div>
      )}

      <Modal
        open={showSetup}
        title="Connect Supabase: one-time setup"
        onClose={() => setShowSetup(false)}
        footer={
          <>
            <LinkButton to="/settings/secrets" variant="primary">
              Go to Secrets
            </LinkButton>
            <Button onClick={() => setShowSetup(false)}>Close</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>One-click connect uses a Supabase OAuth app. Register it once and this button takes you straight through next time.</p>
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              In Supabase, open <span className="font-mono">Organization settings → OAuth Apps</span> and add an application.
            </li>
            <li>
              Grant these scopes (so Helpuit can read your schema + project key):{' '}
              <strong>Projects: Read</strong>, <strong>Database: Write</strong>, <strong>Secrets: Read</strong>.
            </li>
            <li>
              Set the app's redirect URL to <strong>exactly</strong> this — the page you're on right now:
              <CodeBlock>{redirectUri}</CodeBlock>
              {ephemeralTunnel && (
                <Callout tone="warn" className="mt-1">
                  You're on a temporary <span className="font-mono">trycloudflare.com</span> tunnel — its hostname
                  changes every restart, so this URL won't match next time and Supabase will reject it with{' '}
                  <span className="font-mono">redirect_uri not allowed</span>. Open the console at a{' '}
                  <strong>stable</strong> URL instead — e.g. <span className="font-mono">http://localhost:3000</span>{' '}
                  (Supabase allows http://localhost) — and register that one. Or skip OAuth and use the manual
                  connection string below.
                </Callout>
              )}
            </li>
            <li>
              Copy the app&apos;s <strong>Client ID</strong> and <strong>Client secret</strong>.
            </li>
            <li>
              In <span className="font-mono">Settings → Secrets</span>, set{' '}
              <span className="font-mono">SUPABASE_OAUTH_CLIENT_ID</span> and{' '}
              <span className="font-mono">SUPABASE_OAUTH_CLIENT_SECRET</span>.
            </li>
            <li>
              Come back here and click <strong>Connect Supabase</strong>.
            </li>
          </ol>
          <Callout tone="info">Prefer not to use OAuth? Close this and use the manual setup option below.</Callout>
        </div>
      </Modal>
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
      {ref !== '' && (tables.isError || cols.isError) && (
        <Callout tone="warn">
          Couldn't read this project from Supabase. Your OAuth app is most likely missing a scope — grant{' '}
          <strong>Database: Write</strong> (to list tables/columns) and <strong>Secrets: Read</strong> (to read the
          project API key) in Supabase → Organization settings → OAuth Apps, then disconnect and reconnect. Or use the
          manual connection string below.
        </Callout>
      )}
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
