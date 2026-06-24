import { useState } from 'react'
import { useDeleteSecret, useEffectiveConfig, useSetSecret, type SecretCatalogEntry } from '../../lib/api'
import { Badge, Button, Callout, CenteredSpinner, ErrorState, FormResult, Input, PageHeader, Section } from '../../components/ui'
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
        <div className="font-mono text-sm text-ink">{entry.key}</div>
        <div className="mt-0.5 flex gap-1.5">
          {entry.set ? <Badge tone="emerald">set · {entry.source}</Badge> : <Badge tone="slate">unset</Badge>}
          {entry.required && !entry.set && <Badge tone="amber">required</Badge>}
        </div>
      </div>
      <Input
        className="flex-1"
        type="password"
        placeholder={entry.set ? 'Replace value…' : 'Enter value…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button variant="primary" onClick={onSet} disabled={value === ''} loading={set.isPending}>
        {entry.set ? 'Replace' : 'Set'}
      </Button>
      {entry.set && (
        <Button onClick={() => void del.mutateAsync(entry.key)} loading={del.isPending}>
          Clear
        </Button>
      )}
      {saved && <FormResult tone="success">saved ✓</FormResult>}
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
        <Callout tone="warn" className="mb-4">
          <strong>Restart required</strong> — secret changes are saved (encrypted) and take effect on the next
          restart. Pending: {data.restart.reasons.join(', ')}
        </Callout>
      )}

      {requiredUnset.length > 0 && (
        <Section
          title="Required but unset"
          hint="These are needed for the matching capability to work. The app still runs without them."
          className="mb-4"
        >
          <div>
            {requiredUnset.map((s) => (
              <SecretRow key={s.key} entry={s} />
            ))}
          </div>
        </Section>
      )}

      {groups.map((group) => (
        <Section key={group.id} title={group.title} hint={group.usedBy} className="mb-4">
          <div>
            {group.secrets.map((s) => (
              <SecretRow key={s.key} entry={s} />
            ))}
          </div>
        </Section>
      ))}

      {data.structuralIssues.length > 0 && (
        <Section title="Config notes" className="mt-4">
          <ul className="list-inside list-disc text-sm text-muted">
            {data.structuralIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
