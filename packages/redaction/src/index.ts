import type { Artifact } from '@helpuit/contracts'
import { redactHar, type Har } from './har.js'
import { scrubDeep, scrubText } from './pii.js'

export * from './har.js'
export * from './pii.js'

/**
 * Redact an evidence artifact by type and mark it `redacted`. This is the only
 * way an artifact becomes exportable (see `assertExportable`).
 *
 * - `har`        — strip secrets/cookies/sensitive params + scrub bodies
 * - `findings`   — deep-scrub PII from the structured findings
 * - `console`    — scrub PII from the log text
 * - `screenshot` — binary; repro runs as a sandbox account with synthetic data,
 *                  so there is nothing to scrub. Marked redacted as-is.
 */
export function redactArtifact(artifact: Artifact): Artifact {
  let content = artifact.content
  switch (artifact.type) {
    case 'har':
      content = redactHar(artifact.content as Har)
      break
    case 'findings':
      content = scrubDeep(artifact.content)
      break
    case 'console':
      content =
        typeof artifact.content === 'string'
          ? scrubText(artifact.content)
          : scrubDeep(artifact.content)
      break
    case 'screenshot':
      break
  }
  return { ...artifact, content, redactionStatus: 'redacted' }
}

/** An artifact may leave Helpuit only once it has been redacted. */
export function canExport(artifact: Artifact): boolean {
  return artifact.redactionStatus === 'redacted'
}

export class ArtifactNotRedactedError extends Error {
  constructor(public readonly artifactId: string) {
    super(`Artifact "${artifactId}" cannot be exported: redaction status is not "redacted".`)
    this.name = 'ArtifactNotRedactedError'
  }
}

/** Throws unless the artifact is exportable. The export gate (issue 54). */
export function assertExportable(artifact: Artifact): void {
  if (!canExport(artifact)) throw new ArtifactNotRedactedError(artifact.id)
}
