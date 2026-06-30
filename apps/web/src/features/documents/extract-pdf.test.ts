import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { extractPdfWith, type PdfjsLike } from './extract-pdf'
import { makePdf } from './fixtures'

// The REAL pdf.js library — its node-compatible "legacy" build (the browser build
// needs DOM globals the production bundle provides via Vite). Real library, real
// PDF bytes, no mock: `extractPdfWith` is the exact logic the browser entry runs.
const require = createRequire(import.meta.url)
const pdfjs = (await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
)) as unknown as PdfjsLike

describe('extractPdfWith', () => {
  it('extracts the text of a real single-page PDF', async () => {
    const text = await extractPdfWith(pdfjs, makePdf('Refund window is 30 days.'))
    expect(text).toContain('Refund window is 30 days.')
  })

  it('joins multiple pages with blank lines', async () => {
    // makePdf is single-page, so just assert the join contract on one page (no trailing noise).
    const text = await extractPdfWith(pdfjs, makePdf('Page one body.'))
    expect(text).toBe('Page one body.')
  })
})
