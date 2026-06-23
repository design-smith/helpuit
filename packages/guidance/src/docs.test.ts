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
})
