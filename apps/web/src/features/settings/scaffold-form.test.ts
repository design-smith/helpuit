import { describe, it, expect } from 'vitest'
import { parseColumnList } from './scaffold-form'

describe('parseColumnList', () => {
  it('splits a comma list into trimmed, de-duped, non-empty columns', () => {
    expect(parseColumnList('plan, status')).toEqual(['plan', 'status'])
    expect(parseColumnList(' plan , status ,plan, ')).toEqual(['plan', 'status'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseColumnList('')).toEqual([])
    expect(parseColumnList('  ,  ,')).toEqual([])
  })
})
