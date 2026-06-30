import { describe, it, expect } from 'vitest'
import { extractDocx } from './extract-docx'
import { makeDocx } from './fixtures'

// Runs the REAL mammoth library against a REAL .docx (an OOXML zip built by jszip).
// No mocks: the only environment difference is mammoth's node vs browser build,
// and `extractDocx` is written to feed both.

describe('extractDocx', () => {
  it('extracts the paragraph text from a real .docx file', async () => {
    const bytes = await makeDocx(['Vacation policy: 20 days per year.', 'Contact HR to request time off.'])
    const file = new File([bytes], 'Handbook.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const text = await extractDocx(file)

    expect(text).toContain('Vacation policy: 20 days per year.')
    expect(text).toContain('Contact HR to request time off.')
  })
})
