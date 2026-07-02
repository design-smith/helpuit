import type { DocsService } from './docs-service.js'
import { scrapeLink } from './link-scrape.js'

/**
 * Re-scrape every link-sourced doc: the upsert refreshes the store AND the live
 * index in place (and, with the semantic index wired, re-embeds). Failures skip —
 * the previous text keeps grounding until the page is reachable again. Run at
 * boot + daily (the retention-sweep pattern).
 */
export async function sweepLinkDocs(deps: {
  docs: Pick<DocsService, 'list' | 'importDoc'>
  scrape?: typeof scrapeLink
}): Promise<{ refreshed: number; failed: number }> {
  const scrape = deps.scrape ?? scrapeLink
  let refreshed = 0
  let failed = 0
  for (const doc of await deps.docs.list()) {
    if (doc.source !== 'link' || doc.externalId === null) continue
    try {
      const { title, text } = await scrape(doc.externalId)
      await deps.docs.importDoc({ source: 'link', externalId: doc.externalId, title: title ?? doc.title ?? undefined, text })
      refreshed++
    } catch {
      failed++
    }
  }
  return { refreshed, failed }
}
