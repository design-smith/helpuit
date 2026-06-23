import type { TokenVerifier } from './resolver.js'
import { HmacTokenVerifier } from './hmac.js'
import { JwtTokenVerifier } from './jwt.js'
import { EndpointTokenVerifier } from './endpoint.js'

export type TokenVerifierConfig =
  | { mode: 'hmac'; secret: string }
  | { mode: 'jwt'; jwksUrl: string; useridClaim?: string; issuer?: string; audience?: string }
  | { mode: 'endpoint'; verifyUrl: string; verifyToken?: string; useridClaim?: string }

/** Build the configured verifier (the config→adapter seam the composition root uses). */
export function createTokenVerifier(config: TokenVerifierConfig): TokenVerifier {
  switch (config.mode) {
    case 'hmac':
      return new HmacTokenVerifier({ secret: config.secret })
    case 'jwt':
      return new JwtTokenVerifier({
        jwksUrl: config.jwksUrl,
        useridClaim: config.useridClaim,
        issuer: config.issuer,
        audience: config.audience,
      })
    case 'endpoint':
      return new EndpointTokenVerifier({
        verifyUrl: config.verifyUrl,
        verifyToken: config.verifyToken,
        useridClaim: config.useridClaim,
      })
  }
}
