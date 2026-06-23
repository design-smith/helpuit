const SUPABASE_JWKS_PATH = '/auth/v1/.well-known/jwks.json'

/**
 * Build a Supabase project's JWKS URL (FCW-11 preset) from either a bare project
 * ref (`abcdxyz`) or the full project URL (`https://abcdxyz.supabase.co`). Returns
 * '' for blank input so the caller can ignore an empty preset.
 */
export function supabaseJwksUrl(projectRefOrUrl: string): string {
  const input = projectRefOrUrl.trim()
  if (input === '') return ''
  const base = /^https?:\/\//.test(input) ? input.replace(/\/+$/, '') : `https://${input}.supabase.co`
  return `${base}${SUPABASE_JWKS_PATH}`
}
