import { useState } from 'react'
import { useManifest, useSaveManifest, type FeatureManifest, type ManifestSaveResult } from '../../lib/api'
import { Button, Callout, Card, CenteredSpinner, ErrorState, FormResult, PageHeader, Textarea } from '../../components/ui'

const EMPTY: FeatureManifest = { ref: 'main', features: [] }

function ManifestEditor({ initial }: { initial: FeatureManifest }) {
  const save = useSaveManifest()
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ManifestSaveResult | null>(null)

  async function onSave() {
    setParseError(null)
    setResult(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`)
      return
    }
    setResult(await save.mutateAsync(parsed))
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs text-muted">
        Each feature maps a product area to its routes, components, endpoints, docs, and keywords. Correct the
        auto-drafted heuristics here; changes apply on the next restart.
      </p>
      <Textarea mono rows={22} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={save.isPending} onClick={onSave}>
          Save (restart to apply)
        </Button>
        {result?.ok === true && <FormResult tone="warn">Saved — restart to apply</FormResult>}
        {parseError !== null && <FormResult tone="error">{parseError}</FormResult>}
      </div>
      {result?.ok === false && (
        <Callout tone="error">
          <ul className="list-inside list-disc">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Callout>
      )}
    </Card>
  )
}

export function ManifestPage() {
  const { data, isPending, isError, error, refetch } = useManifest()
  if (isPending) return <CenteredSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div>
      <PageHeader
        title="Feature manifest"
        subtitle="Review and correct the auto-drafted manifest the agent grounds investigations in."
      />
      <ManifestEditor initial={data ?? EMPTY} />
    </div>
  )
}
