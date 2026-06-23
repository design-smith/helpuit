import type { Feature, FeatureManifest } from './types.js'

export interface RepoFile {
  path: string
  content?: string
}

/** Source of repository files at the configured production ref (issue 20). */
export interface RepoSource {
  ref(): string
  listFiles(): Promise<RepoFile[]>
}

export interface ManifestBuilder {
  build(): Promise<FeatureManifest>
}

const ROUTE_FILE = /(?:^|\/)(?:routes|pages)\/(.+)\.(?:tsx?|jsx?|vue|svelte)$/

function routeFromPath(path: string): string | null {
  const match = ROUTE_FILE.exec(path)
  if (match === null) return null
  const tail = match[1]!.replace(/\/index$/, '')
  return tail === '' ? '/' : `/${tail}`
}

function humanize(route: string): string {
  const last = route.split('/').filter(Boolean).pop() ?? 'root'
  return last.charAt(0).toUpperCase() + last.slice(1)
}

/**
 * Drafts a feature manifest from a repo file listing using route-file
 * heuristics. The founder confirms/edits the draft (issue 22); an LLM layer can
 * later enrich it. The heuristic baseline is deterministic and testable, and
 * wiring it to a real GitHub MCP `RepoSource` lights it up against a live repo.
 */
export class HeuristicManifestBuilder implements ManifestBuilder {
  constructor(private readonly source: RepoSource) {}

  async build(): Promise<FeatureManifest> {
    const files = await this.source.listFiles()
    const features: Feature[] = []

    for (const file of files) {
      const route = routeFromPath(file.path)
      if (route === null) continue
      const key = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'root'
      features.push({
        key,
        name: humanize(route),
        routes: [route],
        components: [file.path],
        endpoints: [],
        docsLinks: [],
      })
    }

    return { ref: this.source.ref(), features }
  }
}
