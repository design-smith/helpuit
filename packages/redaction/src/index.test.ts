import { describe, it, expect } from 'vitest'
import { investigationId, type Artifact } from '@helpuit/contracts'
import {
  redactArtifact,
  canExport,
  assertExportable,
  ArtifactNotRedactedError,
} from './index.js'

function pendingArtifact(
  partial: Partial<Artifact> & Pick<Artifact, 'type' | 'content'>,
): Artifact {
  return {
    id: 'art-1',
    investigationId: investigationId('inv-1'),
    redactionStatus: 'pending',
    ...partial,
  }
}

describe('export guard', () => {
  it('blocks export of a pending artifact', () => {
    const a = pendingArtifact({ type: 'findings', content: { note: 'hi' } })
    expect(canExport(a)).toBe(false)
    expect(() => assertExportable(a)).toThrow(ArtifactNotRedactedError)
  })

  it('allows export once redacted', () => {
    const a = redactArtifact(pendingArtifact({ type: 'findings', content: { email: 'x@y.com' } }))
    expect(a.redactionStatus).toBe('redacted')
    expect(canExport(a)).toBe(true)
    expect(() => assertExportable(a)).not.toThrow()
  })
})

describe('redactArtifact', () => {
  it('scrubs PII in findings content', () => {
    const a = redactArtifact(pendingArtifact({ type: 'findings', content: { reporter: 'x@y.com' } }))
    expect(JSON.stringify(a.content)).not.toContain('x@y.com')
  })

  it('scrubs console log strings', () => {
    const a = redactArtifact(pendingArtifact({ type: 'console', content: 'login failed for x@y.com' }))
    expect(a.content).not.toContain('x@y.com')
  })

  it('marks screenshots redacted without altering binary content', () => {
    const a = redactArtifact(pendingArtifact({ type: 'screenshot', content: 'base64data' }))
    expect(a.redactionStatus).toBe('redacted')
    expect(a.content).toBe('base64data')
  })
})
