/**
 * The client-side "universal adapter" for grounding-doc ingest: turn a browser
 * `File` into the payload that `POST /admin/docs` already accepts. This slice
 * handles text/markdown (passthrough); PDF/DOCX extraction lands in a later slice
 * behind the same interface.
 */

/** Extensions we can extract to text in the browser (text passthrough, PDF, DOCX). */
export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf', '.docx'] as const

/** The `accept` attribute for the file input / dropzone (extensions + known mimes). */
export const UPLOAD_ACCEPT = `${SUPPORTED_EXTENSIONS.join(
  ',',
)},text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

/** Whether this file is one we can extract text from in this slice. */
export function isSupportedUpload(file: File): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))
}

/** Where an imported doc came from (the client-side producers). */
export type UploadSource = 'upload' | 'dropbox' | 'gdrive' | 'sharepoint'

/** The payload `POST /admin/docs` accepts for an imported grounding doc. */
export interface DocUpload {
  title: string
  text: string
  source: UploadSource
  /** Stable per-source id (filename for uploads, provider file id for pickers) — the upsert key. */
  externalId: string
}

/**
 * Extract a supported file's text in the browser and build the ingest payload for
 * a given source. The `externalId` is the stable upsert key, so re-importing the
 * same file refreshes it in place rather than duplicating; the title defaults to
 * the filename without its extension unless the caller overrides it.
 */
export async function toUpload(
  file: File,
  opts: { source: UploadSource; externalId: string; title?: string },
): Promise<DocUpload> {
  if (!isSupportedUpload(file)) {
    throw new Error(`Can't read ${extensionOf(file.name) || 'this file'} — upload a .txt, .md, .pdf, or .docx file.`)
  }
  const text = (await extractText(file)).trim()
  if (text === '') throw new Error(`${file.name} is empty — nothing to ground on.`)
  return { title: opts.title ?? stripExtension(file.name), text, source: opts.source, externalId: opts.externalId }
}

/** Build the ingest payload for an uploaded file (filename is the stable externalId). */
export function fileToDoc(file: File): Promise<DocUpload> {
  return toUpload(file, { source: 'upload', externalId: file.name })
}

/**
 * Extract a supported file's text. PDF/DOCX extractors are heavy (pdf.js, mammoth)
 * so they're loaded lazily — code-split out of the main bundle and only fetched
 * when an operator actually uploads that format. Text/markdown is a passthrough.
 */
async function extractText(file: File): Promise<string> {
  switch (extensionOf(file.name)) {
    case '.pdf':
      return (await import('./extract-pdf')).extractPdf(file)
    case '.docx':
      return (await import('./extract-docx')).extractDocx(file)
    default:
      return file.text()
  }
}
