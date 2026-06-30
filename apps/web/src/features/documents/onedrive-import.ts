import { toUpload, type DocUpload } from './file-import'

/** A file as the OneDrive picker hands it to us (after parsing). */
export interface OneDriveFile {
  /** Stable OneDrive/SharePoint item id (survives renames) — our upsert key. */
  id: string
  name: string
  /** A short-lived, pre-authenticated direct download URL (no token needed). */
  downloadUrl: string
}

/** A raw item from the OneDrive picker's `action: 'download'` response. */
export interface OneDriveRawItem {
  id: string
  name: string
  '@microsoft.graph.downloadUrl'?: string
}

/**
 * Parse a picked item into an {@link OneDriveFile}. With `action: 'download'` each
 * file carries a pre-authenticated `@microsoft.graph.downloadUrl`; an item without
 * one (e.g. a folder) can't be ingested — reject it by name.
 */
export function toOneDriveFile(item: OneDriveRawItem): OneDriveFile {
  const downloadUrl = item['@microsoft.graph.downloadUrl']
  if (typeof downloadUrl !== 'string' || downloadUrl === '') {
    throw new Error(`"${item.name}" has no download link — pick a file, not a folder.`)
  }
  return { id: item.id, name: item.name, downloadUrl }
}

/**
 * Download a picked OneDrive/SharePoint file via its pre-authed URL and build the
 * ingest payload: source 'sharepoint', keyed by the stable item id so a re-import
 * refreshes in place. `fetchFn` is a parameter so the download seam is testable.
 */
export async function onedriveFileToUpload(file: OneDriveFile, fetchFn: typeof fetch = fetch): Promise<DocUpload> {
  const res = await fetchFn(file.downloadUrl)
  if (!res.ok) throw new Error(`Couldn't download "${file.name}" from OneDrive/SharePoint (HTTP ${res.status}).`)
  const blob = await res.blob()
  const downloaded = new File([blob], file.name, { type: blob.type })
  return toUpload(downloaded, { source: 'sharepoint', externalId: file.id })
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser-only File Picker (OneDrive.js v7.2). One MS app id covers OneDrive
// (personal + business) and SharePoint; `action: 'download'` returns files with a
// pre-authenticated download URL, so no token handling is needed on our side. The
// operator consents in a popup against their OWN account. Can't run in the test
// environment; exercised manually + validated by the production build.
// ─────────────────────────────────────────────────────────────────────────────

interface OneDriveGlobal {
  open(options: {
    clientId: string
    action: 'download'
    multiSelect?: boolean
    advanced?: { redirectUri?: string; filter?: string }
    success: (result: { value?: OneDriveRawItem[] }) => void
    cancel?: () => void
    error?: (error: unknown) => void
  }): void
}
declare global {
  interface Window {
    OneDrive?: OneDriveGlobal
  }
}

const ONEDRIVE_SRC = 'https://js.live.net/v7.2/OneDrive.js'

function loadOneDrive(): Promise<OneDriveGlobal> {
  return new Promise((resolve, reject) => {
    if (window.OneDrive !== undefined) return resolve(window.OneDrive)
    const fail = () => reject(new Error('Could not load the OneDrive picker. Check the app id and network.'))
    const ready = () => (window.OneDrive !== undefined ? resolve(window.OneDrive) : fail())
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ONEDRIVE_SRC}"]`)
    if (existing !== null) {
      existing.addEventListener('load', ready, { once: true })
      existing.addEventListener('error', fail, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = ONEDRIVE_SRC
    script.onload = ready
    script.onerror = fail
    document.body.appendChild(script)
  })
}

/** Open the OneDrive/SharePoint picker; resolve with the files the operator selected. */
export async function pickFromOneDrive(clientId: string): Promise<OneDriveFile[]> {
  const onedrive = await loadOneDrive()
  return new Promise((resolve, reject) => {
    onedrive.open({
      clientId,
      action: 'download',
      multiSelect: true,
      advanced: { redirectUri: window.location.origin },
      success: (result) => {
        try {
          resolve((result.value ?? []).map(toOneDriveFile))
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Could not read the picked files.'))
        }
      },
      cancel: () => resolve([]),
      error: (err) => reject(err instanceof Error ? err : new Error('OneDrive picker error.')),
    })
  })
}
