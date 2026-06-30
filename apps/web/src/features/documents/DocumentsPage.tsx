import { useState } from 'react'
import { Upload, FileText, Trash2, Cloud, HardDrive, FolderUp } from 'lucide-react'
import { useDocs, useImportDoc, useDeleteDoc, useEffectiveConfig, useApplySection } from '../../lib/api'
import {
  Badge,
  Button,
  Callout,
  cx,
  Disclosure,
  EmptyState,
  ErrorState,
  Field,
  FormResult,
  Input,
  PageHeader,
  Section,
  Spinner,
} from '../../components/ui'
import { timeAgo, absTime } from '../../lib/format'
import { fileToDoc, type DocUpload, UPLOAD_ACCEPT } from './file-import'
import { dropboxFileToUpload, pickFromDropbox } from './dropbox-import'
import { driveFileToUpload, pickFromGoogleDrive } from './gdrive-import'
import { onedriveFileToUpload, pickFromOneDrive } from './onedrive-import'

/** Provider/source → badge tone (upload is the only producer in this slice). */
const SOURCE_TONE: Record<string, string> = {
  upload: 'slate',
  gdrive: 'sky',
  dropbox: 'indigo',
  sharepoint: 'amber',
  repo: 'emerald',
}

interface ImportSummary {
  ok: number
  errors: string[]
}

export function DocumentsPage() {
  const docs = useDocs()
  const config = useEffectiveConfig()
  const importDoc = useImportDoc()
  const deleteDoc = useDeleteDoc()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  /** Which unconfigured provider's setup form is revealed (null = none). */
  const [setupOpen, setSetupOpen] = useState<'dropbox' | 'gdrive' | 'sharepoint' | null>(null)

  const docsConfig = config.data?.config?.docs as Record<string, unknown> | undefined
  const dropboxAppKey = docsConfig?.dropboxAppKey as string | undefined
  const googleApiKey = docsConfig?.googleApiKey as string | undefined
  const googleClientId = docsConfig?.googleClientId as string | undefined
  const microsoftClientId = docsConfig?.microsoftClientId as string | undefined

  async function onDelete(id: string): Promise<void> {
    try {
      await deleteDoc.mutateAsync(id)
    } finally {
      setConfirmId(null)
    }
  }

  /** Run each producer → import, aggregating per-item success/failure into one summary. */
  async function runImports(items: Array<{ label: string; produce: () => Promise<DocUpload> }>): Promise<void> {
    if (items.length === 0) return
    setBusy(true)
    setSummary(null)
    let ok = 0
    const errors: string[] = []
    for (const item of items) {
      try {
        await importDoc.mutateAsync(await item.produce())
        ok += 1
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Couldn't import ${item.label}.`)
      }
    }
    setBusy(false)
    setSummary({ ok, errors })
  }

  function handleFiles(selected: FileList | File[]): Promise<void> {
    return runImports(Array.from(selected).map((file) => ({ label: file.name, produce: () => fileToDoc(file) })))
  }

  async function handleDropbox(appKey: string): Promise<void> {
    let picked
    try {
      picked = await pickFromDropbox(appKey)
    } catch (err) {
      setSummary({ ok: 0, errors: [err instanceof Error ? err.message : 'Dropbox Chooser failed to open.'] })
      return
    }
    await runImports(picked.map((file) => ({ label: file.name, produce: () => dropboxFileToUpload(file) })))
  }

  async function handleGoogle(apiKey: string, clientId: string): Promise<void> {
    let pick
    try {
      pick = await pickFromGoogleDrive(apiKey, clientId)
    } catch (err) {
      setSummary({ ok: 0, errors: [err instanceof Error ? err.message : 'Google Picker failed to open.'] })
      return
    }
    await runImports(
      pick.files.map((file) => ({ label: file.name, produce: () => driveFileToUpload(file, pick.accessToken) })),
    )
  }

  async function handleOneDrive(clientId: string): Promise<void> {
    let picked
    try {
      picked = await pickFromOneDrive(clientId)
    } catch (err) {
      setSummary({ ok: 0, errors: [err instanceof Error ? err.message : 'OneDrive picker failed to open.'] })
      return
    }
    await runImports(picked.map((file) => ({ label: file.name, produce: () => onedriveFileToUpload(file) })))
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Upload product docs to ground L1 answers. Re-uploading a file by the same name refreshes it in place."
      />

      <Section
        title="Upload"
        hint="Text, Markdown, PDF, and Word files (.txt, .md, .pdf, .docx). Grounds answers immediately — no restart."
        className="mb-4"
      >
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFiles(e.dataTransfer.files)
          }}
          className={cx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-base border-2 border-dashed border-border p-10 text-center transition-colors',
            dragging ? 'bg-main/10' : 'bg-secondary-background',
          )}
        >
          <Upload className="h-6 w-6 text-muted" />
          <span className="text-sm font-heading text-foreground">Drop a .txt, .md, .pdf, or .docx file here, or click to browse</span>
          <span className="text-xs text-muted">PDF and Word text is extracted in your browser. Multiple files import one by one.</span>
          <input
            type="file"
            accept={UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files ?? [])
              e.target.value = ''
            }}
          />
        </label>

        <div className="mt-4 space-y-3 border-t-2 border-border pt-4">
          <p className="text-xs font-heading uppercase tracking-wide text-muted">Or import from a connected source</p>

          {/* Always-visible provider buttons: a configured one opens its picker; an
              unconfigured one reveals its setup form below. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                dropboxAppKey !== undefined
                  ? void handleDropbox(dropboxAppKey)
                  : setSetupOpen(setupOpen === 'dropbox' ? null : 'dropbox')
              }
            >
              <Cloud className="h-4 w-4" />
              Dropbox
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                googleApiKey !== undefined && googleClientId !== undefined
                  ? void handleGoogle(googleApiKey, googleClientId)
                  : setSetupOpen(setupOpen === 'gdrive' ? null : 'gdrive')
              }
            >
              <HardDrive className="h-4 w-4" />
              Google Drive
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                microsoftClientId !== undefined
                  ? void handleOneDrive(microsoftClientId)
                  : setSetupOpen(setupOpen === 'sharepoint' ? null : 'sharepoint')
              }
            >
              <FolderUp className="h-4 w-4" />
              OneDrive / SharePoint
            </Button>
          </div>
          <p className="text-xs text-muted">
            Pick files from a connected source — they're fetched and extracted in your browser. Not connected yet?
            Click a button to set it up.
          </p>

          {setupOpen === 'dropbox' && dropboxAppKey === undefined && (
            <DropboxSetup currentDocs={docsConfig} disabled={config.isPending} open onToggle={() => setSetupOpen(null)} />
          )}
          {setupOpen === 'gdrive' && !(googleApiKey !== undefined && googleClientId !== undefined) && (
            <GoogleSetup currentDocs={docsConfig} disabled={config.isPending} open onToggle={() => setSetupOpen(null)} />
          )}
          {setupOpen === 'sharepoint' && microsoftClientId === undefined && (
            <OneDriveSetup currentDocs={docsConfig} disabled={config.isPending} open onToggle={() => setSetupOpen(null)} />
          )}
        </div>

        {busy && (
          <div className="mt-3">
            <Spinner label="Importing…" />
          </div>
        )}

        {summary !== null && !busy && (
          <div className="mt-3 space-y-1">
            {summary.ok > 0 && <FormResult tone="success">Imported {summary.ok} document{summary.ok === 1 ? '' : 's'} ✓</FormResult>}
            {summary.errors.map((message, i) => (
              <FormResult key={i} tone="error">
                {message}
              </FormResult>
            ))}
          </div>
        )}
      </Section>

      <Section title="Imported documents" hint="Everything grounding L1 guidance right now.">
        {docs.isPending ? (
          <Spinner label="Loading…" />
        ) : docs.isError ? (
          <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
        ) : docs.data.length === 0 ? (
          <EmptyState title="No documents yet" hint="Upload a file above to ground L1 answers." />
        ) : (
          <div className="space-y-2">
            {docs.data.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-base border-2 border-border bg-secondary-background px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-base text-foreground">{doc.title ?? doc.externalId ?? 'Untitled'}</div>
                    {doc.externalId !== null && doc.externalId !== doc.title && (
                      <div className="truncate text-xs text-muted">{doc.externalId}</div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={SOURCE_TONE[doc.source ?? 'upload'] ?? 'slate'}>{doc.source ?? 'upload'}</Badge>
                  <span className="text-xs text-muted" title={absTime(doc.createdAt)}>
                    {timeAgo(doc.createdAt)}
                  </span>
                  {confirmId === doc.id ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deleteDoc.isPending}
                        onClick={() => void onDelete(doc.id)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConfirmId(doc.id)}
                      aria-label={`Delete ${doc.title ?? doc.externalId ?? 'document'}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {importDoc.isError && (
        <Callout tone="error" className="mt-4">
          {importDoc.error instanceof Error ? importDoc.error.message : 'Import failed.'}
        </Callout>
      )}

      {deleteDoc.isError && (
        <Callout tone="error" className="mt-4">
          {deleteDoc.error instanceof Error ? deleteDoc.error.message : 'Delete failed.'}
        </Callout>
      )}
    </div>
  )
}

/**
 * Inline setup for Dropbox import: saves the public app key into the `docs` config
 * section (surfaced unmasked to the browser; it's not a secret). Sends the full
 * section so sibling fields (repoPaths) are preserved.
 */
function DropboxSetup({
  currentDocs,
  disabled,
  open,
  onToggle,
}: {
  currentDocs: Record<string, unknown> | undefined
  disabled: boolean
  open: boolean
  onToggle: () => void
}) {
  const apply = useApplySection()
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(): Promise<void> {
    if (key.trim() === '') return
    const res = await apply.mutateAsync({ section: 'docs', value: { ...(currentDocs ?? {}), dropboxAppKey: key.trim() } })
    if (res.ok) {
      setSaved(true)
      setKey('')
    }
  }

  return (
    <Disclosure label="Set up Dropbox import" open={open} onToggle={onToggle}>
      <Field
        label="Dropbox app key"
        hint="Create an app at dropbox.com/developers (Chooser/Saver), then paste its public App key. It's safe to expose in the browser — not a secret."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-72"
            value={key}
            placeholder="e.g. a1b2c3d4e5f6g7h"
            onChange={(e) => {
              setKey(e.target.value)
              setSaved(false)
            }}
          />
          <Button variant="primary" onClick={() => void save()} disabled={disabled || key.trim() === ''} loading={apply.isPending}>
            Save
          </Button>
          {saved && <FormResult tone="success">Saved — Dropbox import is now enabled ✓</FormResult>}
          {apply.data?.ok === false && <FormResult tone="error">{apply.data.issues.join('; ') || 'Could not save.'}</FormResult>}
        </div>
      </Field>
    </Disclosure>
  )
}

/**
 * Inline setup for Google Drive import: saves the public API key + OAuth client id
 * into the `docs` config section (both browser-exposed, not secrets). Sends the
 * full section so siblings (repoPaths, dropboxAppKey) are preserved.
 */
function GoogleSetup({
  currentDocs,
  disabled,
  open,
  onToggle,
}: {
  currentDocs: Record<string, unknown> | undefined
  disabled: boolean
  open: boolean
  onToggle: () => void
}) {
  const apply = useApplySection()
  const [apiKey, setApiKey] = useState('')
  const [clientId, setClientId] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(): Promise<void> {
    if (apiKey.trim() === '' || clientId.trim() === '') return
    const res = await apply.mutateAsync({
      section: 'docs',
      value: { ...(currentDocs ?? {}), googleApiKey: apiKey.trim(), googleClientId: clientId.trim() },
    })
    if (res.ok) {
      setSaved(true)
      setApiKey('')
      setClientId('')
    }
  }

  const ready = apiKey.trim() !== '' && clientId.trim() !== ''
  return (
    <Disclosure label="Set up Google Drive import" open={open} onToggle={onToggle}>
      <Field
        label="Google API key + OAuth client id"
        hint="From a Google Cloud project with the Picker API enabled. Both are public client identifiers (origin-restricted) — safe to expose in the browser, not secrets."
      >
        <div className="space-y-2">
          <Input className="w-full max-w-md" value={apiKey} placeholder="API key (AIza…)" onChange={(e) => { setApiKey(e.target.value); setSaved(false) }} />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full max-w-md"
              value={clientId}
              placeholder="OAuth client id (…apps.googleusercontent.com)"
              onChange={(e) => { setClientId(e.target.value); setSaved(false) }}
            />
            <Button variant="primary" onClick={() => void save()} disabled={disabled || !ready} loading={apply.isPending}>
              Save
            </Button>
            {saved && <FormResult tone="success">Saved — Google Drive import is now enabled ✓</FormResult>}
            {apply.data?.ok === false && <FormResult tone="error">{apply.data.issues.join('; ') || 'Could not save.'}</FormResult>}
          </div>
        </div>
      </Field>
    </Disclosure>
  )
}

/**
 * Inline setup for OneDrive/SharePoint import: saves the public Microsoft app
 * (client) id into the `docs` config section (browser-exposed, not a secret). One
 * app id covers both OneDrive and SharePoint. Sends the full section so siblings
 * are preserved.
 */
function OneDriveSetup({
  currentDocs,
  disabled,
  open,
  onToggle,
}: {
  currentDocs: Record<string, unknown> | undefined
  disabled: boolean
  open: boolean
  onToggle: () => void
}) {
  const apply = useApplySection()
  const [clientId, setClientId] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(): Promise<void> {
    if (clientId.trim() === '') return
    const res = await apply.mutateAsync({ section: 'docs', value: { ...(currentDocs ?? {}), microsoftClientId: clientId.trim() } })
    if (res.ok) {
      setSaved(true)
      setClientId('')
    }
  }

  return (
    <Disclosure label="Set up OneDrive / SharePoint import" open={open} onToggle={onToggle}>
      <Field
        label="Microsoft app (client) id"
        hint="Register an app in the Azure portal (with your console origin as a redirect URI). The client id is a public identifier — safe to expose in the browser, not a secret. One id covers OneDrive and SharePoint."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-full max-w-md"
            value={clientId}
            placeholder="Application (client) id"
            onChange={(e) => {
              setClientId(e.target.value)
              setSaved(false)
            }}
          />
          <Button variant="primary" onClick={() => void save()} disabled={disabled || clientId.trim() === ''} loading={apply.isPending}>
            Save
          </Button>
          {saved && <FormResult tone="success">Saved — OneDrive/SharePoint import is now enabled ✓</FormResult>}
          {apply.data?.ok === false && <FormResult tone="error">{apply.data.issues.join('; ') || 'Could not save.'}</FormResult>}
        </div>
      </Field>
    </Disclosure>
  )
}
