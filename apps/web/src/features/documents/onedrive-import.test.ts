import { describe, it, expect } from 'vitest'
import { toOneDriveFile, onedriveFileToUpload } from './onedrive-import'
import { makeDocx } from './fixtures'

describe('toOneDriveFile', () => {
  it('extracts id/name and the pre-authenticated download url from a picked item', () => {
    const file = toOneDriveFile({
      id: '01ABC',
      name: 'Runbook.docx',
      '@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/_layouts/download?xyz',
    })
    expect(file).toEqual({
      id: '01ABC',
      name: 'Runbook.docx',
      downloadUrl: 'https://contoso-my.sharepoint.com/_layouts/download?xyz',
    })
  })

  it('rejects an item with no download link (e.g. a folder), naming it', () => {
    expect(() => toOneDriveFile({ id: '02', name: 'Policies' })).toThrow(/Policies/)
  })
})

describe('onedriveFileToUpload', () => {
  it('downloads the pre-authed url and builds a sharepoint-sourced payload via real extraction', async () => {
    const bytes = await makeDocx(['Incident runbook', 'Page the on-call engineer first.'])
    const url = 'https://contoso-my.sharepoint.com/_layouts/download?id=1'
    const fetchFn = (async (u: string) => {
      expect(u).toBe(url)
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      })
    }) as unknown as typeof fetch

    const doc = await onedriveFileToUpload({ id: '01ABC', name: 'Runbook.docx', downloadUrl: url }, fetchFn)

    expect(doc.source).toBe('sharepoint')
    expect(doc.externalId).toBe('01ABC') // stable OneDrive/SharePoint item id
    expect(doc.title).toBe('Runbook')
    expect(doc.text).toContain('Page the on-call engineer first.')
    expect(doc.text).not.toContain('<w:')
  })

  it('throws a clear error when the download fails', async () => {
    const fetchFn = (async () => new Response('no', { status: 410 })) as unknown as typeof fetch
    await expect(
      onedriveFileToUpload({ id: 'x', name: 'x.md', downloadUrl: 'https://contoso-my.sharepoint.com/x' }, fetchFn),
    ).rejects.toThrow(/onedrive|sharepoint/i)
  })
})
