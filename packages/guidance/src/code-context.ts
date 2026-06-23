import { resolveFeature, type FeatureManifest } from '@helpuit/feature-manifest'
import type { CodeContextProvider, CodeSnippet } from './agent.js'

/** Reads source for a set of repo paths (GitHub MCP in prod). Structurally the
 * same shape as `@helpuit/static-investigation`'s `CodeRetriever`. */
export interface CodeReader {
  retrieve(paths: string[]): Promise<Record<string, string>>
}

export interface CodeContextOptions {
  /** How many top-ranked features to pull code from (default 1). */
  maxFeatures?: number
  /** Per-file character cap so a huge file can't blow the prompt budget (default 4000). */
  maxBytesPerFile?: number
}

/**
 * Real code-context provider for L1 guidance (issue 27): resolve the complaint to
 * the top feature(s) via the manifest, read those features' component files, and
 * return capped snippets. Grounds guidance in how the product actually behaves —
 * reusing the same manifest resolution that powers L3a static investigation.
 */
export class ManifestCodeContextProvider implements CodeContextProvider {
  constructor(
    private readonly manifest: FeatureManifest,
    private readonly reader: CodeReader,
    private readonly options: CodeContextOptions = {},
  ) {}

  async retrieve(complaint: string): Promise<CodeSnippet[]> {
    const maxFeatures = this.options.maxFeatures ?? 1
    const matches = resolveFeature(this.manifest, complaint).slice(0, maxFeatures)
    const paths = [...new Set(matches.flatMap((m) => m.feature.components))]
    if (paths.length === 0) return []

    const code = await this.reader.retrieve(paths)
    const cap = this.options.maxBytesPerFile ?? 4000
    return Object.entries(code).map(([path, content]) => ({ path, content: content.slice(0, cap) }))
  }
}
