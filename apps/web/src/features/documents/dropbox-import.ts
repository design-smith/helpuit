import { toUpload, SUPPORTED_EXTENSIONS, type DocUpload } from './file-import'

/** A file as the Dropbox Chooser returns it (the fields we use). */
export interface DropboxChooserFile {
  /** Stable Dropbox file id (survives renames) — our upsert key. */
  id: string
  name: string
  /** A direct download link (linkType: 'direct'), valid ~4 hours. */
  link: string
}

/**
 * Download a Chosen Dropbox file and build the ingest payload: source 'dropbox',
 * keyed by the stable Dropbox file id so a re-import refreshes in place. `fetchFn`
 * defaults to the global fetch and is a parameter so the download seam is testable.
 */
export async function dropboxFileToUpload(file: DropboxChooserFile, fetchFn: typeof fetch = fetch): Promise<DocUpload> {
  const res = await fetchFn(file.link)
  if (!res.ok) throw new Error(`Couldn't download "${file.name}" from Dropbox (HTTP ${res.status}).`)
  const blob = await res.blob()
  const downloaded = new File([blob], file.name, { type: blob.type })
  return toUpload(downloaded, { source: 'dropbox', externalId: file.id })
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser-only Chooser SDK (dropins.js). The popup auths against the operator's
// OWN Dropbox and hands files back in the browser — no server tokens. Can't run
// in the test environment; exercised manually + validated by the production build.
// ─────────────────────────────────────────────────────────────────────────────

interface DropboxChooserOptions {
  success: (files: DropboxChooserFile[]) => void
  cancel?: () => void
  linkType?: 'preview' | 'direct'
  multiselect?: boolean
  extensions?: string[]
}
interface DropboxGlobal {
  choose(options: DropboxChooserOptions): void
}
declare global {
  interface Window {
    Dropbox?: DropboxGlobal
  }
}

const DROPINS_SRC = 'https://www.dropbox.com/static/api/2/dropins.js'

/** Inject dropins.js once (with the app key) and resolve when window.Dropbox is ready. */
function loadDropins(appKey: string): Promise<DropboxGlobal> {
  return new Promise((resolve, reject) => {
    if (window.Dropbox) return resolve(window.Dropbox)
    const existing = document.getElementById('dropboxjs') as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    script.id = 'dropboxjs'
    script.src = DROPINS_SRC
    script.setAttribute('data-app-key', appKey)
    script.onload = () =>
      window.Dropbox ? resolve(window.Dropbox) : reject(new Error('Dropbox Chooser failed to initialise.'))
    script.onerror = () => reject(new Error('Could not load the Dropbox Chooser. Check the app key and network.'))
    if (existing === null) document.body.appendChild(script)
  })
}

/** Open the Dropbox Chooser; resolve with the files the operator selected (direct links). */
export async function pickFromDropbox(appKey: string): Promise<DropboxChooserFile[]> {
  const dropbox = await loadDropins(appKey)
  return new Promise((resolve) => {
    dropbox.choose({
      linkType: 'direct',
      multiselect: true,
      extensions: [...SUPPORTED_EXTENSIONS],
      success: (files) => resolve(files),
      cancel: () => resolve([]),
    })
  })
}
