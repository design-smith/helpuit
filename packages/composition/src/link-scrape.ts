/**
 * Fetch a URL and reduce it to readable text for the knowledge index.
 * ponytail: ~25-line tag strip, no readability/DOM dep — the consumers are an
 * embeddings index and an LLM, which tolerate text soup; nav crumbs cost a few
 * tokens. Upgrade to a readability extractor if retrieval quality measurably suffers.
 */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
const MAX_CHARS = 100_000

export async function scrapeLink(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ title?: string; text: string }> {
  const res = await fetchFn(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Couldn't fetch ${url} (HTTP ${res.status}).`)
  const html = (await res.text()).slice(0, MAX_CHARS * 4)

  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim()
  const text = html
    .replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS)

  return { title: title === '' ? undefined : title, text }
}
