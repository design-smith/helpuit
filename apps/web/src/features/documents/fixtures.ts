import JSZip from 'jszip'

/**
 * Test-only builders that produce REAL document bytes (a valid PDF and a valid
 * .docx OOXML package) so the extractors run against genuine files, never mocks.
 * Imported only by `*.test.ts`; never bundled into the app.
 */

/** A minimal single-page PDF with one text string and a correct xref table. */
export function makePdf(text: string): ArrayBuffer {
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets[i] = byteLength(pdf)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return latin1Buffer(pdf)
}

/** A valid .docx (OOXML zip) whose body is the given paragraphs, one `<w:p>` each. */
export async function makeDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`).join('')
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  )
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  zip.folder('word')!.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  )
  // DEFLATE like a real Word export, so the raw bytes do NOT contain the plaintext —
  // a passing extraction test then proves genuine decompression, not a byte-substring match.
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function byteLength(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) > 0xff ? 2 : 1
  return n
}

function latin1Buffer(s: string): ArrayBuffer {
  const buffer = new ArrayBuffer(s.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff
  return buffer
}
