import { describe, it, expect } from 'vitest'
import { driveDownload, driveFileToUpload } from './gdrive-import'
import { makeDocx } from './fixtures'

describe('driveDownload', () => {
  it('exports a native Google Doc to plain text and gives it a .txt name', () => {
    const { url, filename } = driveDownload({
      id: 'DOC123',
      name: 'Quarterly Plan',
      mimeType: 'application/vnd.google-apps.document',
    })
    const u = new URL(url)
    expect(u.pathname).toContain('/files/DOC123/export')
    expect(u.searchParams.get('mimeType')).toBe('text/plain')
    expect(filename).toBe('Quarterly Plan.txt')
  })

  it('downloads an uploaded binary file as-is via media', () => {
    const { url, filename } = driveDownload({ id: 'PDF9', name: 'spec.pdf', mimeType: 'application/pdf' })
    const u = new URL(url)
    expect(u.pathname).toContain('/files/PDF9')
    expect(u.pathname).not.toContain('/export')
    expect(u.searchParams.get('alt')).toBe('media')
    expect(filename).toBe('spec.pdf')
  })

  it('refuses native Google types we cannot extract (e.g. Sheets), naming the type', () => {
    expect(() =>
      driveDownload({ id: 'S1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet' }),
    ).toThrow(/google-apps\.spreadsheet|sheet/i)
  })
})

describe('driveFileToUpload', () => {
  it('exports a Google Doc as text (bearer-authed) into a gdrive-sourced payload', async () => {
    const fetchFn = (async (url: string, init?: RequestInit) => {
      expect(new URL(url).pathname).toContain('/export')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok-abc')
      return new Response('Quarterly plan: ship search in Q3.', { status: 200, headers: { 'content-type': 'text/plain' } })
    }) as unknown as typeof fetch

    const doc = await driveFileToUpload(
      { id: 'DOC123', name: 'Quarterly Plan', mimeType: 'application/vnd.google-apps.document' },
      'tok-abc',
      fetchFn,
    )

    expect(doc.source).toBe('gdrive')
    expect(doc.externalId).toBe('DOC123')
    expect(doc.title).toBe('Quarterly Plan')
    expect(doc.text).toContain('Quarterly plan: ship search in Q3.')
  })

  it('downloads an uploaded .docx via media and extracts it for real', async () => {
    const bytes = await makeDocx(['Vendor agreement', 'Net 30 payment terms.'])
    const fetchFn = (async (url: string, init?: RequestInit) => {
      expect(new URL(url).searchParams.get('alt')).toBe('media')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok-abc')
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      })
    }) as unknown as typeof fetch

    const doc = await driveFileToUpload({ id: 'F9', name: 'Vendor.docx', mimeType: 'application/pdf' }, 'tok-abc', fetchFn)

    expect(doc.source).toBe('gdrive')
    expect(doc.externalId).toBe('F9')
    expect(doc.text).toContain('Net 30 payment terms.')
    expect(doc.text).not.toContain('<w:')
  })

  it('throws a clear, Drive-named error when the download fails', async () => {
    const fetchFn = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch
    await expect(
      driveFileToUpload({ id: 'x', name: 'x.md', mimeType: 'text/markdown' }, 'tok', fetchFn),
    ).rejects.toThrow(/drive/i)
  })
})
