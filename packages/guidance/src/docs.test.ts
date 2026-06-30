import { describe, it, expect } from 'vitest'
import { InMemoryDocsIndex } from './docs.js'

describe('InMemoryDocsIndex', () => {
  it('ranks docs by relevance to the query', () => {
    const index = new InMemoryDocsIndex()
    index.ingest([
      { id: 'billing', text: 'To update your billing card, click Save on the billing page.' },
      { id: 'team', text: 'Invite team members from the team settings page.' },
    ])
    const results = index.retrieve('billing card save')
    expect(results[0]!.id).toBe('billing')
  })

  it('returns nothing when no doc matches', () => {
    const index = new InMemoryDocsIndex()
    index.ingest([{ id: 'billing', text: 'billing card save page' }])
    expect(index.retrieve('xyzzy plugh')).toEqual([])
  })

  it('limits results to k', () => {
    const index = new InMemoryDocsIndex()
    index.ingest([
      { id: 'a', text: 'save save' },
      { id: 'b', text: 'save' },
      { id: 'c', text: 'save' },
    ])
    expect(index.retrieve('save', 2)).toHaveLength(2)
  })

  it('upsert replaces a doc by id (no duplicate) and appends new ones', () => {
    const index = new InMemoryDocsIndex()
    index.ingest([{ id: 'a', text: 'alpha original' }])

    index.upsert({ id: 'a', text: 'alpha updated' })
    const hits = index.retrieve('alpha')
    expect(hits).toHaveLength(1) // replaced, not duplicated
    expect(hits[0]!.text).toBe('alpha updated')

    index.upsert({ id: 'b', text: 'beta content' })
    expect(index.retrieve('beta')[0]!.id).toBe('b')
  })

  it('removeById drops a doc from retrieval', () => {
    const index = new InMemoryDocsIndex()
    index.ingest([
      { id: 'a', text: 'alpha' },
      { id: 'b', text: 'beta' },
    ])
    index.removeById('a')
    expect(index.retrieve('alpha')).toEqual([])
    expect(index.retrieve('beta')[0]!.id).toBe('b')
  })
})
