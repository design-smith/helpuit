import type { RepoSource } from '@helpuit/feature-manifest'
import type { CodeRetriever } from '@helpuit/static-investigation'
import type { Doc } from '@helpuit/guidance'

/**
 * Compile a path glob to an anchored RegExp. `*` matches within a path segment,
 * `**` matches across segments (and an immediately following `/` is optional, so
 * `docs/` + recursive + `*.md` matches both `docs/a.md` and `docs/x/a.md`), `?`
 * matches a single non-slash char. Everything else is literal.
 */
function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') i++
        re += '.*'
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('.+^${}()|[]\\/'.includes(c)) {
      re += `\\${c}`
    } else {
      re += c
    }
  }
  return new RegExp(`^${re}$`)
}

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(path))
}

/**
 * Loads grounding docs straight from the connected repo (FCW-05): it lists files
 * at the production ref, keeps those matching the configured paths/globs, fetches
 * their content, and returns them as L1 grounding {@link Doc}s (id = repo path).
 * The repo is the source of truth, so these are re-derived each boot rather than
 * persisted. A file that can't be read is skipped (the retriever degrades).
 */
export class RepoDocsLoader {
  private readonly patterns: RegExp[]

  constructor(
    private readonly source: RepoSource,
    private readonly content: CodeRetriever,
    globs: string[],
  ) {
    this.patterns = globs.map(globToRegExp)
  }

  async load(): Promise<Doc[]> {
    if (this.patterns.length === 0) return []
    const files = await this.source.listFiles()
    const paths = files.map((f) => f.path).filter((p) => matchesAny(p, this.patterns))
    if (paths.length === 0) return []
    const contents = await this.content.retrieve(paths)
    return paths
      .filter((p) => typeof contents[p] === 'string' && contents[p] !== '')
      .map((p) => ({ id: p, title: p, text: contents[p]! }))
  }
}
