import { copyFileSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'

/**
 * A minimal but VALID structural baseline, used only as a fallback when no
 * `helpuit.config.example.yaml` is present to seed from. A real clone ships the
 * example, so this rarely fires; it just guarantees the booting server has a
 * parseable config (an empty config fails the schema's required sections).
 */
export const FALLBACK_CONFIG_YAML = `# Seeded by \`pnpm run setup\`. Describe YOUR product here; see helpuit.config.example.yaml.
chatwoot:
  baseUrl: https://chat.example.com
  accountId: 1
  inboxId: 1
github:
  owner: your-org
  repo: your-product
identity:
  mode: hmac
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login:
    mode: form
    url: https://app.example.com/login
models:
  provider: anthropic
  tiers:
    guidance: { model: claude-haiku-4-5 }
    reasoning: { model: claude-opus-4-8 }
    vision: { model: claude-opus-4-8 }
`

/** Read a file's text, or `undefined` if it doesn't exist / can't be read. */
export function readFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

export interface WriteEnvResult {
  backedUp: boolean
}

/**
 * Write `.env` text, first copying any existing file to `<path>.bak` so a
 * re-run can never silently destroy an operator's previous secrets. On POSIX
 * the file is best-effort `chmod 600` (a secrets file); on Windows that's a no-op.
 */
export function writeEnvFileWithBackup(path: string, text: string): WriteEnvResult {
  let backedUp = false
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`)
    backedUp = true
  }
  writeFileSync(path, text, 'utf8')
  try {
    chmodSync(path, 0o600)
  } catch {
    // best-effort; not supported on every platform/filesystem
  }
  return { backedUp }
}

export interface EnsureConfigResult {
  created: boolean
}

/**
 * Ensure a `helpuit.config.yaml` exists: leave an existing one untouched,
 * otherwise seed it from `examplePath` (or the built-in fallback if the example
 * is missing). Connector values are filled later in the console.
 */
export function ensureConfigYaml(targetPath: string, examplePath: string): EnsureConfigResult {
  if (existsSync(targetPath)) return { created: false }
  const seed = readFileIfExists(examplePath) ?? FALLBACK_CONFIG_YAML
  writeFileSync(targetPath, seed, 'utf8')
  return { created: true }
}
