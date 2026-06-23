import {
  buildAppManifest,
  convertManifest,
  GitHubAppAuth,
  githubRequest,
  type GitHubOptions,
} from '@helpuit/github'
import type { DrizzleConfigStore, DrizzleSecretVault, DrizzleRestartFlag, DrizzleConfigAudit } from '@helpuit/db'

/** Vault keys the GitHub App connection writes. */
export const GITHUB_APP_PRIVATE_KEY = 'GITHUB_APP_PRIVATE_KEY'
export const GITHUB_WEBHOOK_SECRET = 'GITHUB_WEBHOOK_SECRET'
export const GITHUB_APP_CLIENT_SECRET = 'GITHUB_APP_CLIENT_SECRET'

type FetchLike = NonNullable<ConvertOpts['fetchImpl']>
interface ConvertOpts {
  fetchImpl?: (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean
    status?: number
    json: () => Promise<unknown>
    text?: () => Promise<string>
  }>
}

export interface GitHubConnectionDeps {
  configStore: Pick<DrizzleConfigStore, 'get' | 'put'>
  vault: Pick<DrizzleSecretVault, 'set' | 'openAll'>
  restartFlag: Pick<DrizzleRestartFlag, 'add'>
  audit: Pick<DrizzleConfigAudit, 'record'>
  /** This deployment's public base URL (HELPUIT_PUBLIC_URL). */
  publicUrl: string
  appName: string
  apiBaseUrl?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
}

/**
 * Drives the GitHub App "connect" flow (manifest → conversion → installation),
 * the social-login-style alternative to a pasted PAT. Generated App secrets are
 * sealed in the vault; non-secret metadata (app id, slug, installation, repo) is
 * written to the `github` config section with `auth: 'app'`. All of it is
 * restart-applied (the bound GitHub client captures auth at boot).
 */
export class GitHubConnectionService {
  constructor(private readonly deps: GitHubConnectionDeps) {}

  /** The form target + manifest the console submits to GitHub to create the App. */
  manifest(): { url: string; manifest: Record<string, unknown> } {
    return {
      url: 'https://github.com/settings/apps/new',
      manifest: buildAppManifest({ publicUrl: this.deps.publicUrl, name: this.deps.appName }),
    }
  }

  /** Exchange the post-creation code for credentials, store them, and return the install URL. */
  async completeManifest(code: string): Promise<{ installUrl: string; slug: string }> {
    const creds = await convertManifest(code, { apiBaseUrl: this.deps.apiBaseUrl, fetchImpl: this.deps.fetchImpl })
    await this.deps.vault.set(GITHUB_APP_PRIVATE_KEY, creds.privateKey)
    if (creds.webhookSecret !== '') await this.deps.vault.set(GITHUB_WEBHOOK_SECRET, creds.webhookSecret)
    if (creds.clientSecret !== '') await this.deps.vault.set(GITHUB_APP_CLIENT_SECRET, creds.clientSecret)

    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    await this.deps.configStore.put('github', { ...prev, appId: creds.appId, slug: creds.slug, auth: 'app' })
    await this.deps.restartFlag.add('config:github')
    await this.deps.audit.record('github.app.created', creds.slug)
    return { installUrl: `https://github.com/apps/${creds.slug}/installations/new`, slug: creds.slug }
  }

  /**
   * Record the installation and auto-resolve the connected repo from it (the repo
   * the operator granted). Best-effort: if resolution fails, the installation id is
   * still stored. The App private key is read from the vault (stored during the
   * preceding manifest exchange).
   */
  async completeInstall(installationId: number): Promise<{ owner?: string; repo?: string }> {
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    const appId = typeof prev.appId === 'string' ? prev.appId : undefined
    const privateKey = (await this.deps.vault.openAll()).secrets[GITHUB_APP_PRIVATE_KEY] ?? ''

    let owner: string | undefined
    let repo: string | undefined
    if (appId !== undefined && privateKey !== '') {
      try {
        const auth = new GitHubAppAuth({
          appId,
          privateKey,
          installationId,
          apiBaseUrl: this.deps.apiBaseUrl,
          fetchImpl: this.deps.fetchImpl,
        })
        const options: GitHubOptions = {
          owner: '',
          repo: '',
          token: '',
          getToken: () => auth.getToken(),
          apiBaseUrl: this.deps.apiBaseUrl,
        }
        const result = (await githubRequest(options, 'GET', '/installation/repositories')) as {
          repositories?: Array<{ name?: string; owner?: { login?: string } }>
        }
        const first = result.repositories?.[0]
        owner = first?.owner?.login
        repo = first?.name
      } catch {
        /* best-effort — keep the installation even if repo resolution fails */
      }
    }

    await this.deps.configStore.put('github', {
      ...prev,
      installationId,
      auth: 'app',
      ...(owner !== undefined ? { owner } : {}),
      ...(repo !== undefined ? { repo } : {}),
    })
    await this.deps.restartFlag.add('config:github')
    await this.deps.audit.record('github.app.installed', String(installationId))
    return { owner, repo }
  }
}
