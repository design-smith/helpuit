import { createHmac } from 'node:crypto'
import { HmacTokenVerifier } from '@helpuit/identity'
import type { HelpuitConfig } from '@helpuit/config'

export interface IdentityTestResult {
  ok: boolean
  mode: string
  detail: string
}

const SAMPLE_USER = 'helpuit-identity-test'

/**
 * Real "Test identity" connector check (FCW-11): a green/red verdict per mode so a
 * misconfigured verifier is caught at setup, not silently when the first real
 * customer message arrives.
 *
 * - hmac: sign a sample token with the configured secret and confirm the real
 *   `HmacTokenVerifier` verifies it AND rejects a tampered one (proves the secret
 *   is set and verification actually runs).
 * - jwt: fetch the JWKS URL and confirm it publishes keys (reachability).
 * - endpoint: POST a probe to the verify URL and confirm it responds (reachability).
 */
export async function testIdentity(identity: HelpuitConfig['identity']): Promise<IdentityTestResult> {
  switch (identity.mode) {
    case 'hmac':
      return testHmac(identity.secret)
    case 'jwt':
      return testJwks(identity.jwksUrl)
    case 'endpoint':
      return testEndpoint(identity.verifyUrl, identity.verifyToken)
  }
}

async function testHmac(secret: string | undefined): Promise<IdentityTestResult> {
  if (secret === undefined || secret === '') {
    return { ok: false, mode: 'hmac', detail: 'No HMAC shared secret is set — set it under Identity.' }
  }
  const verifier = new HmacTokenVerifier({ secret })
  const valid = `${SAMPLE_USER}.${createHmac('sha256', secret).update(SAMPLE_USER).digest('hex')}`
  const tampered = `${SAMPLE_USER}.${'0'.repeat(64)}`
  const good = await verifier.verify(valid)
  const bad = await verifier.verify(tampered)
  if (good?.userId === SAMPLE_USER && bad === null) {
    return { ok: true, mode: 'hmac', detail: 'Shared secret verified a sample token and rejected a tampered one.' }
  }
  return { ok: false, mode: 'hmac', detail: 'HMAC verification did not behave as expected.' }
}

async function testJwks(jwksUrl: string | undefined): Promise<IdentityTestResult> {
  if (jwksUrl === undefined || jwksUrl === '') {
    return { ok: false, mode: 'jwt', detail: 'No JWKS URL is set.' }
  }
  try {
    const res = await fetch(jwksUrl)
    if (!res.ok) return { ok: false, mode: 'jwt', detail: `JWKS endpoint returned HTTP ${res.status}.` }
    const json = (await res.json()) as { keys?: unknown }
    const count = Array.isArray(json.keys) ? json.keys.length : 0
    if (count === 0) return { ok: false, mode: 'jwt', detail: 'JWKS endpoint returned no signing keys.' }
    return { ok: true, mode: 'jwt', detail: `JWKS reachable — ${count} signing key(s) published.` }
  } catch (error) {
    return { ok: false, mode: 'jwt', detail: `JWKS unreachable: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function testEndpoint(verifyUrl: string | undefined, verifyToken: string | undefined): Promise<IdentityTestResult> {
  if (verifyUrl === undefined || verifyUrl === '') {
    return { ok: false, mode: 'endpoint', detail: 'No verify URL is set.' }
  }
  try {
    const res = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(verifyToken !== undefined && verifyToken !== '' ? { authorization: `Bearer ${verifyToken}` } : {}),
      },
      body: JSON.stringify({ token: 'helpuit-identity-probe' }),
    })
    // Any HTTP response means the endpoint is reachable; a non-2xx for a probe
    // token is expected and still proves the endpoint is live.
    return { ok: true, mode: 'endpoint', detail: `Verify endpoint reachable (HTTP ${res.status}).` }
  } catch (error) {
    return { ok: false, mode: 'endpoint', detail: `Verify endpoint unreachable: ${error instanceof Error ? error.message : String(error)}` }
  }
}
