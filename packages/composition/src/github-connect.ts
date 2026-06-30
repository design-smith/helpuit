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
   * Record the installation id. The repo is NOT auto-picked — the operator chooses
   * the exact one via {@link listRepos} + {@link selectRepo}, so a multi-repo
   * installation doesn't silently bind to whichever repo happens to be first.
   */
  async completeInstall(installationId: number): Promise<void> {
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    await this.deps.configStore.put('github', { ...prev, installationId, auth: 'app' })
    await this.deps.restartFlag.add('config:github')
    await this.deps.audit.record('github.app.installed', String(installationId))
  }

  /**
   * The install/configure URL for the App this deployment already created — so
   * "connect" reuses it instead of creating a new App each time. Undefined when no
   * App has been created yet (the manifest flow handles first-time creation).
   */
  async installUrlForExistingApp(): Promise<string | undefined> {
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    const slug = typeof prev.slug === 'string' && prev.slug !== '' ? prev.slug : undefined
    return slug !== undefined ? `https://github.com/apps/${slug}/installations/new` : undefined
  }

  /**
   * Link an externally-created GitHub App by its credentials (an alternative to the
   * manifest flow, for an App made outside Helpuit). Seals the private key in the
   * vault; stores the non-secret app id / installation / slug. Restart-applied.
   */
  async connectExistingApp(input: { appId: string; privateKey: string; installationId: number; slug?: string }): Promise<void> {
    await this.deps.vault.set(GITHUB_APP_PRIVATE_KEY, input.privateKey)
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    await this.deps.configStore.put('github', {
      ...prev,
      appId: input.appId,
      installationId: input.installationId,
      auth: 'app',
      ...(input.slug !== undefined && input.slug !== '' ? { slug: input.slug } : {}),
    })
    await this.deps.restartFlag.add('config:github')
    await this.deps.audit.record('github.app.linked', input.appId)
  }

  /** The repositories the current installation can access — the repo picker's options. */
  async listRepos(): Promise<Array<{ owner: string; repo: string; fullName: string }>> {
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    const appId = typeof prev.appId === 'string' ? prev.appId : undefined
    const installationId = typeof prev.installationId === 'number' ? prev.installationId : undefined
    const privateKey = (await this.deps.vault.openAll()).secrets[GITHUB_APP_PRIVATE_KEY] ?? ''
    if (appId === undefined || installationId === undefined || privateKey === '') return []

    const auth = new GitHubAppAuth({ appId, privateKey, installationId, apiBaseUrl: this.deps.apiBaseUrl, fetchImpl: this.deps.fetchImpl })
    const options: GitHubOptions = {
      owner: '',
      repo: '',
      token: '',
      getToken: () => auth.getToken(),
      apiBaseUrl: this.deps.apiBaseUrl,
      fetchImpl: this.deps.fetchImpl,
    }
    const result = (await githubRequest(options, 'GET', '/installation/repositories')) as {
      repositories?: Array<{ name?: string; owner?: { login?: string } }>
    }
    return (result.repositories ?? []).flatMap((r) =>
      r.owner?.login !== undefined && r.name !== undefined
        ? [{ owner: r.owner.login, repo: r.name, fullName: `${r.owner.login}/${r.name}` }]
        : [],
    )
  }

  /** Set the connected repo to the operator's explicit pick. Restart-applied. */
  async selectRepo(owner: string, repo: string): Promise<void> {
    const prev = ((await this.deps.configStore.get('github'))?.value as Record<string, unknown>) ?? {}
    await this.deps.configStore.put('github', { ...prev, owner, repo, auth: 'app' })
    await this.deps.restartFlag.add('config:github')
    await this.deps.audit.record('github.repo.selected', `${owner}/${repo}`)
  }
}
