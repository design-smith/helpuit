import { useState } from 'react'
import { useDeleteSecret, useEffectiveConfig, useSetSecret, type SecretCatalogEntry } from '../../lib/api'
import { Badge, Card, CenteredSpinner, ErrorState, PageHeader } from '../../components/ui'
import { groupSecrets } from './secret-groups'

function SecretRow({ entry }: { entry: SecretCatalogEntry }) {
  const [value, setValue] = useState('')
  const set = useSetSecret()
  const del = useDeleteSecret()
  const [saved, setSaved] = useState(false)

  async function onSet() {
    if (value === '') return
    await set.mutateAsync({ key: entry.key, value })
    setValue('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
      <div className="w-72 shrink-0">
        <div className="font-mono text-sm">{entry.key}</div>
        <div className="mt-0.5 flex gap-1.5">
          {entry.set ? (
            <Badge tone="emerald">set · {entry.source}</Badge>
          ) : (
            <Badge tone="slate">unset</Badge>
          )}
          {entry.required && !entry.set && <Badge tone="amber">required</Badge>}
        </div>
      </div>
      <input
        className="input flex-1"
        type="password"
        placeholder={entry.set ? 'Replace value…' : 'Enter value…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn-primary" onClick={onSet} disabled={value === '' || set.isPending}>
        {entry.set ? 'Replace' : 'Set'}
      </button>
      {entry.set && (
        <button
          className="btn-ghost"
          onClick={() => void del.mutateAsync(entry.key)}
          disabled={del.isPending}
        >
          Clear
        </button>
      )}
      {saved && <span className="text-sm text-emerald-400">saved ✓</span>}
    </div>
  )
}

export function SecretsPage() {
  const { data, isPending, isError, error, refetch } = useEffectiveConfig()
  if (isPending) return <CenteredSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  // Group by the feature that uses each secret, hiding feature-gated groups
  // (reproduction sandboxes, account-data query routes) unless that feature is on.
  const groups = groupSecrets(data.secrets, {
    reproductionEnabled: data.config.policy?.playwrightEnabled === true,
    accountDataEnabled: data.config.queryRoutes !== undefined,
  })
  const visible = groups.flatMap((g) => g.secrets)
  const requiredUnset = visible.filter((s) => s.required && !s.set)

  return (
    <div>
      <PageHeader
        title="Secrets"
        subtitle="Encrypted at rest. Stored secrets are never shown back — only set or replaced."
      />

      {data.restart.pending && (
        <div className="card mb-4 border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          <strong>Restart required</strong> — secret changes are saved (encrypted) and take effect on the next
          restart. Pending: {data.restart.reasons.join(', ')}
        </div>
      )}

      {requiredUnset.length > 0 && (
        <Card className="mb-4 border-amber-700/40">
          <h2 className="mb-1 font-semibold text-amber-200">Required but unset</h2>
          <p className="mb-2 text-xs text-muted">
            These are needed for the matching capability to work. The app still runs without them.
          </p>
          {requiredUnset.map((s) => (
            <SecretRow key={s.key} entry={s} />
          ))}
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.id} className="mb-4">
          <h2 className="font-semibold">{group.title}</h2>
          <p className="mb-2 text-xs text-muted">{group.usedBy}</p>
          {group.secrets.map((s) => (
            <SecretRow key={s.key} entry={s} />
          ))}
        </Card>
      ))}

      {data.structuralIssues.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-1 font-semibold">Config notes</h2>
          <ul className="list-inside list-disc text-sm text-muted">
            {data.structuralIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
