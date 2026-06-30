import { describe, it, expect } from 'vitest'
import { dropboxFileToUpload } from './dropbox-import'
import { makeDocx } from './fixtures'

// The Chooser hands back a temporary download link; we fetch it and extract.
// Real bytes flow through a real Response + real mammoth extraction — only the
// network call itself is the injected seam (the live Dropbox host can't run here).

describe('dropboxFileToUpload', () => {
  it('downloads a Chosen file and builds the dropbox-sourced payload via real extraction', async () => {
    const bytes = await makeDocx(['Quarterly report', 'Revenue up 12 percent.'])
    const link = 'https://dl.dropboxusercontent.com/s/abc/Q3%20Report.docx'
    const fetchFn = (async (url: string) => {
      expect(url).toBe(link)
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      })
    }) as unknown as typeof fetch

    const doc = await dropboxFileToUpload({ id: 'id:XYZ', name: 'Q3 Report.docx', link }, fetchFn)

    expect(doc.source).toBe('dropbox')
    expect(doc.externalId).toBe('id:XYZ') // the Dropbox file id — stable across renames
    expect(doc.title).toBe('Q3 Report')
    expect(doc.text).toContain('Revenue up 12 percent.')
    expect(doc.text).not.toContain('<w:') // proves real extraction, not raw bytes
  })

  it('throws a clear, Dropbox-named error when the download fails', async () => {
    const fetchFn = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch
    await expect(
      dropboxFileToUpload({ id: 'id:1', name: 'x.md', link: 'https://dl.dropboxusercontent.com/s/x' }, fetchFn),
    ).rejects.toThrow(/dropbox/i)
  })
})
