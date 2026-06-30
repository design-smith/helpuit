import { describe, it, expect } from 'vitest'
import { isSupportedUpload, fileToDoc, toUpload } from './file-import'
import { makeDocx } from './fixtures'

describe('isSupportedUpload', () => {
  it('accepts the formats we can extract in the browser (text, markdown, PDF, DOCX)', () => {
    expect(isSupportedUpload(new File(['x'], 'handbook.txt', { type: 'text/plain' }))).toBe(true)
    expect(isSupportedUpload(new File(['x'], 'README.md', { type: 'text/markdown' }))).toBe(true)
    expect(isSupportedUpload(new File(['x'], 'NOTES.MD', { type: '' }))).toBe(true)
    expect(isSupportedUpload(new File(['x'], 'guide.markdown', { type: '' }))).toBe(true)
    expect(isSupportedUpload(new File(['x'], 'spec.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isSupportedUpload(new File(['x'], 'Contract.DOCX', { type: '' }))).toBe(true)
  })

  it('rejects formats we cannot extract (images, legacy .doc, keynote, etc.)', () => {
    expect(isSupportedUpload(new File(['x'], 'logo.png', { type: 'image/png' }))).toBe(false)
    expect(isSupportedUpload(new File(['x'], 'old.doc', { type: 'application/msword' }))).toBe(false)
    expect(isSupportedUpload(new File(['x'], 'deck.key', { type: '' }))).toBe(false)
  })
})

describe('fileToDoc', () => {
  it('reads a markdown file into the ingest payload (title from name, filename as externalId)', async () => {
    const file = new File(['# Refunds\n\nRefunds take five business days.'], 'Refund Policy.md', {
      type: 'text/markdown',
    })

    const doc = await fileToDoc(file)

    expect(doc).toEqual({
      title: 'Refund Policy',
      text: '# Refunds\n\nRefunds take five business days.',
      source: 'upload',
      externalId: 'Refund Policy.md',
    })
  })

  it('refuses an unsupported file naming the type, rather than ingesting binary', async () => {
    const png = new File(['\x89PNG'], 'logo.png', { type: 'image/png' })
    await expect(fileToDoc(png)).rejects.toThrow(/\.png/i)
  })

  it('refuses an empty file (nothing to ground on)', async () => {
    const empty = new File([''], 'blank.txt', { type: 'text/plain' })
    await expect(fileToDoc(empty)).rejects.toThrow(/empty/i)
  })

  it('toUpload builds a payload for an arbitrary source + externalId (real extraction)', async () => {
    const file = new File(['# Refunds\n\nRefunds take five business days.'], 'Refund Policy.md', { type: 'text/markdown' })
    const doc = await toUpload(file, { source: 'dropbox', externalId: 'id:abc123' })
    expect(doc).toEqual({
      title: 'Refund Policy',
      text: '# Refunds\n\nRefunds take five business days.',
      source: 'dropbox',
      externalId: 'id:abc123',
    })
  })

  it('toUpload lets the caller override the title and still guards empties', async () => {
    const doc = await toUpload(new File(['hello'], 'note.txt', { type: 'text/plain' }), {
      source: 'gdrive',
      externalId: 'g1',
      title: 'Custom Title',
    })
    expect(doc.title).toBe('Custom Title')
    expect(doc.source).toBe('gdrive')
    await expect(
      toUpload(new File([''], 'blank.md', { type: 'text/markdown' }), { source: 'dropbox', externalId: 'x' }),
    ).rejects.toThrow(/empty/i)
  })

  it('routes a .docx through real extraction into the ingest payload', async () => {
    const bytes = await makeDocx(['Onboarding checklist', 'Step 1: create your account.'])
    const file = new File([bytes], 'Onboarding.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const doc = await fileToDoc(file)

    expect(doc.source).toBe('upload')
    expect(doc.externalId).toBe('Onboarding.docx')
    expect(doc.title).toBe('Onboarding')
    expect(doc.text).toContain('Onboarding checklist')
    expect(doc.text).toContain('Step 1: create your account.')
    // Proves real extraction, not raw zip bytes decoded as text.
    expect(doc.text).not.toContain('<w:')
  })
})
