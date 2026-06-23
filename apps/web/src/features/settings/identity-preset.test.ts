import { describe, it, expect } from 'vitest'
import { supabaseJwksUrl } from './identity-preset'

describe('supabaseJwksUrl', () => {
  it('builds the JWKS URL from a bare project ref', () => {
    expect(supabaseJwksUrl('abcdxyz')).toBe('https://abcdxyz.supabase.co/auth/v1/.well-known/jwks.json')
  })

  it('builds it from the project URL (with or without a trailing slash)', () => {
    expect(supabaseJwksUrl('https://abcdxyz.supabase.co')).toBe(
      'https://abcdxyz.supabase.co/auth/v1/.well-known/jwks.json',
    )
    expect(supabaseJwksUrl('https://abcdxyz.supabase.co/')).toBe(
      'https://abcdxyz.supabase.co/auth/v1/.well-known/jwks.json',
    )
  })

  it('returns an empty string for blank input (nothing to preset)', () => {
    expect(supabaseJwksUrl('  ')).toBe('')
  })
})
