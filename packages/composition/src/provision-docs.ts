import { GitHubRepoSource, GitHubCodeRetriever } from '@helpuit/github'
import type { Db } from '@helpuit/db'
import type { HelpuitConfig } from '@helpuit/config'
import { DocsService } from './docs-service.js'
import { RepoDocsLoader } from './repo-docs-loader.js'
import { githubOptionsFromConfig } from './github-options.js'

/**
 * Production factory for the L1 docs surface: a store-backed {@link DocsService}
 * (operator-pasted docs, persisted), warmed at boot, into whose live index any
 * markdown from the connected repo (config.docs.repoPaths) is also ingested
 * (FCW-05). Repo docs are re-derived each boot — the repo is the source of truth —
 * so they're ingested ephemerally, not persisted. Boot-safe: an unreachable or
 * unauthed repo degrades to the persisted docs alone, never crashing boot.
 */
export async function provisionDocs(config: HelpuitConfig, deps: { db: Db }): Promise<DocsService> {
  const service = await DocsService.create(deps.db)
  const repoPaths = config.docs.repoPaths
  if (repoPaths.length > 0) {
    const options = githubOptionsFromConfig(config)
    const loader = new RepoDocsLoader(new GitHubRepoSource(options), new GitHubCodeRetriever(options), repoPaths)
    try {
      service.ingestEphemeral(await loader.load())
    } catch (error) {
      console.warn(`could not ingest docs from repo: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return service
}
