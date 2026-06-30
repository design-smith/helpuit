import * as mammoth from 'mammoth'

/**
 * Extract the plain text from a .docx file in the browser using mammoth.
 *
 * mammoth's browser build reads `arrayBuffer`; its node build (used by the test
 * suite) reads `buffer` — both ultimately `JSZip.loadAsync`. Passing the same
 * bytes under both keys lets one call serve both environments.
 */
export async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer, buffer: arrayBuffer } as Parameters<typeof mammoth.extractRawText>[0])
  return value.trim()
}
