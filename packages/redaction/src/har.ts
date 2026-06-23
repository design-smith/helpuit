import { REDACTED, scrubText } from './pii.js'

/** Minimal subset of the HAR 1.2 format needed for redaction. */
export interface HarHeader {
  name: string
  value: string
}
export interface HarCookie {
  name: string
  value: string
  [k: string]: unknown
}
export interface HarQueryString {
  name: string
  value: string
}
export interface HarPostParam {
  name: string
  value?: string
}
export interface HarPostData {
  mimeType?: string
  text?: string
  params?: HarPostParam[]
}
export interface HarRequest {
  method?: string
  url?: string
  headers?: HarHeader[]
  cookies?: HarCookie[]
  queryString?: HarQueryString[]
  postData?: HarPostData
}
export interface HarContent {
  mimeType?: string
  text?: string
  [k: string]: unknown
}
export interface HarResponse {
  status?: number
  headers?: HarHeader[]
  cookies?: HarCookie[]
  content?: HarContent
}
export interface HarEntry {
  request?: HarRequest
  response?: HarResponse
  [k: string]: unknown
}
export interface Har {
  log: {
    entries: HarEntry[]
    [k: string]: unknown
  }
  [k: string]: unknown
}

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-session-token',
])

const SENSITIVE_PARAM =
  /(token|secret|password|passwd|pwd|api[-_]?key|access[-_]?key|auth|session|signature|sig)/i

function redactHeaders(headers: HarHeader[] | undefined): HarHeader[] | undefined {
  if (!headers) return headers
  return headers.map((h) =>
    SENSITIVE_HEADERS.has(h.name.toLowerCase()) ? { ...h, value: REDACTED } : h,
  )
}

function redactCookies(cookies: HarCookie[] | undefined): HarCookie[] | undefined {
  if (!cookies) return cookies
  return cookies.map((c) => ({ ...c, value: REDACTED }))
}

function redactQuery(qs: HarQueryString[] | undefined): HarQueryString[] | undefined {
  if (!qs) return qs
  return qs.map((q) => (SENSITIVE_PARAM.test(q.name) ? { ...q, value: REDACTED } : q))
}

function redactUrl(url: string): string {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return url
  const base = url.slice(0, qIndex)
  const redactedQuery = url
    .slice(qIndex + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=')
      if (eq === -1) return pair
      const name = pair.slice(0, eq)
      return SENSITIVE_PARAM.test(decodeURIComponent(name)) ? `${name}=${REDACTED}` : pair
    })
    .join('&')
  return `${base}?${redactedQuery}`
}

function redactPostData(pd: HarPostData): HarPostData {
  return {
    ...pd,
    text: pd.text === undefined ? pd.text : scrubText(pd.text),
    params: pd.params?.map((p) => (SENSITIVE_PARAM.test(p.name) ? { ...p, value: REDACTED } : p)),
  }
}

function redactRequest(req: HarRequest): HarRequest {
  return {
    ...req,
    url: req.url === undefined ? req.url : redactUrl(req.url),
    headers: redactHeaders(req.headers),
    cookies: redactCookies(req.cookies),
    queryString: redactQuery(req.queryString),
    postData: req.postData === undefined ? req.postData : redactPostData(req.postData),
  }
}

function redactResponse(res: HarResponse): HarResponse {
  return {
    ...res,
    headers: redactHeaders(res.headers),
    cookies: redactCookies(res.cookies),
    content:
      res.content === undefined
        ? res.content
        : {
            ...res.content,
            text: res.content.text === undefined ? res.content.text : scrubText(res.content.text),
          },
  }
}

/**
 * Redact a HAR capture: strip auth headers/cookies, redact sensitive query
 * params (in both the structured `queryString` and the raw URL), and scrub
 * PII from request/response bodies. Returns a new object; never mutates input.
 */
export function redactHar(har: Har): Har {
  return {
    ...har,
    log: {
      ...har.log,
      entries: har.log.entries.map((entry) => ({
        ...entry,
        request: entry.request === undefined ? entry.request : redactRequest(entry.request),
        response: entry.response === undefined ? entry.response : redactResponse(entry.response),
      })),
    },
  }
}
