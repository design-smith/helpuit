import { toUpload, type DocUpload } from './file-import'

/** A file as the Google Picker returns it (the fields we use). */
export interface DriveFile {
  /** Stable Drive file id (survives renames) — our upsert key. */
  id: string
  name: string
  mimeType: string
}

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'

/**
 * Decide how to fetch a picked Drive file's text bytes:
 * - Native Google Docs can't be downloaded — export them to plain text (and give
 *   the result a .txt name so the extractor treats it as text).
 * - Other native Google types (Sheets, Slides, …) can't be exported to a doc we
 *   ground on; refuse with a clear, type-naming error.
 * - Uploaded/binary files (PDF, DOCX, txt, md) download as-is via `?alt=media`.
 */
export function driveDownload(file: DriveFile): { url: string; filename: string } {
  const id = encodeURIComponent(file.id)
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return {
      url: `${DRIVE_FILES}/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      filename: ensureExtension(file.name, '.txt'),
    }
  }
  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    throw new Error(`Can't import "${file.name}" — ${file.mimeType} isn't a supported document. Use a Google Doc, PDF, Word, or text file.`)
  }
  return { url: `${DRIVE_FILES}/${id}?alt=media`, filename: file.name }
}

/** Append `ext` only if the name doesn't already end with it (case-insensitive). */
function ensureExtension(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`
}

/**
 * Download (or export) a picked Drive file with the operator's OAuth access token
 * and build the ingest payload: source 'gdrive', keyed by the stable Drive file id
 * so a re-import refreshes in place. `fetchFn` is a parameter so the network seam
 * is testable; the access token is obtained client-side (never stored server-side).
 */
export async function driveFileToUpload(
  file: DriveFile,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<DocUpload> {
  const { url, filename } = driveDownload(file)
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Couldn't download "${file.name}" from Google Drive (HTTP ${res.status}).`)
  const blob = await res.blob()
  const downloaded = new File([blob], filename, { type: blob.type })
  return toUpload(downloaded, { source: 'gdrive', externalId: file.id })
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser-only Picker SDK: Google Identity Services (token) + gapi Picker. The
// operator consents in a popup against their OWN Google account; the access token
// stays in the browser (never stored server-side). Can't run in the test
// environment; exercised manually + validated by the production build.
// ─────────────────────────────────────────────────────────────────────────────

interface GooglePickedDoc {
  id: string
  name: string
  mimeType: string
}
interface TokenClient {
  requestAccessToken(): void
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (resp: { access_token?: string; error?: string }) => void
  }): TokenClient
}
interface DocsViewLike {
  setIncludeFolders(v: boolean): DocsViewLike
}
interface PickerBuilderLike {
  setOAuthToken(token: string): PickerBuilderLike
  setDeveloperKey(key: string): PickerBuilderLike
  addView(view: DocsViewLike): PickerBuilderLike
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilderLike
  build(): { setVisible(v: boolean): void }
}
interface GooglePickerNs {
  PickerBuilder: new () => PickerBuilderLike
  DocsView: new () => DocsViewLike
  Action: { PICKED: string; CANCEL: string }
  Response: { ACTION: string; DOCUMENTS: string }
}
interface GapiLike {
  load(api: string, cb: () => void): void
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 }; picker?: GooglePickerNs }
    gapi?: GapiLike
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'
/** Read-only Drive access; the operator consents per-session in the popup. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) !== null) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}. Check the network and that the key is valid.`))
    document.body.appendChild(script)
  })
}

/** Obtain a Drive access token via the Google Identity Services popup. */
async function getAccessToken(clientId: string): Promise<string> {
  await loadScript(GIS_SRC)
  const oauth2 = window.google?.accounts?.oauth2
  if (oauth2 === undefined) throw new Error('Google Identity Services failed to load.')
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) =>
        resp.access_token !== undefined
          ? resolve(resp.access_token)
          : reject(new Error(resp.error ?? 'Google sign-in was cancelled.')),
    })
    client.requestAccessToken()
  })
}

async function loadPicker(): Promise<GooglePickerNs> {
  await loadScript(GAPI_SRC)
  if (window.gapi === undefined) throw new Error('Google API script failed to load.')
  await new Promise<void>((resolve) => window.gapi!.load('picker', () => resolve()))
  if (window.google?.picker === undefined) throw new Error('Google Picker failed to initialise.')
  return window.google.picker
}

export interface DrivePick {
  accessToken: string
  files: DriveFile[]
}

/** Open the Google Picker; resolve with the operator's access token + picked files. */
export async function pickFromGoogleDrive(apiKey: string, clientId: string): Promise<DrivePick> {
  const accessToken = await getAccessToken(clientId)
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView().setIncludeFolders(false)
    new picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .addView(view)
      .setCallback((data) => {
        const action = data[picker.Response.ACTION]
        if (action === picker.Action.PICKED) {
          const docs = (data[picker.Response.DOCUMENTS] as GooglePickedDoc[] | undefined) ?? []
          resolve({ accessToken, files: docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })) })
        } else if (action === picker.Action.CANCEL) {
          resolve({ accessToken, files: [] })
        }
      })
      .build()
      .setVisible(true)
  })
}
