/**
 * PDF text extraction with pdf.js. The heavy library + its web worker are loaded
 * lazily (code-split) so they never weigh down the main bundle, and only when an
 * operator actually uploads a PDF.
 */

/** The slice of the pdf.js module surface we use — satisfied by the real library. */
export interface PdfjsLike {
  getDocument(src: { data: ArrayBuffer | Uint8Array; isEvalSupported?: boolean }): PdfLoadingTaskLike
  GlobalWorkerOptions?: { workerSrc: string }
}
interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentLike>
  /** Releases pdf.js's worker/transport + buffers. Must be called or the worker leaks. */
  destroy(): Promise<void>
}
interface PdfDocumentLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
}
interface PdfPageLike {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>
}

/**
 * Core extraction: walk every page, join its text items, and separate pages with
 * blank lines. Pure of any environment concern — pass it the real pdf.js module
 * and the document bytes. This is exactly what the browser entry below runs.
 */
export async function extractPdfWith(pdfjs: PdfjsLike, data: ArrayBuffer | Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data, isEvalSupported: false })
  const doc = await task.promise
  try {
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
    return pages.filter((p) => p !== '').join('\n\n').trim()
  } finally {
    await task.destroy()
  }
}

/**
 * Browser entry: load pdf.js + its bundled worker (Vite resolves `?url` to a hashed
 * asset URL), then extract. Kept separate from {@link extractPdfWith} so the test
 * suite can exercise the real extraction logic in Node without the browser worker.
 */
export async function extractPdf(file: File): Promise<string> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfjsLike & { GlobalWorkerOptions: { workerSrc: string } }
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return extractPdfWith(pdfjs, await file.arrayBuffer())
}
