import { GitHubAppAuth, type GitHubOptions } from '@helpuit/github'
import type { HelpuitConfig } from '@helpuit/config'

/**
 * Build GitHub client options from config — a static PAT, or, when connected via
 * the GitHub App flow, short-lived installation tokens minted from the App's
 * private key. Single source of truth for GitHub auth across the orchestrator,
 * the issue tracker, and repo reads (manifest auto-draft).
 */
export function githubOptionsFromConfig(config: HelpuitConfig): GitHubOptions {
  let getToken: (() => Promise<string>) | undefined
  if (
    config.github.auth === 'app' &&
    config.github.appId !== undefined &&
    config.github.installationId !== undefined &&
    config.github.appPrivateKey !== undefined &&
    config.github.appPrivateKey !== ''
  ) {
    const appAuth = new GitHubAppAuth({
      appId: config.github.appId,
      privateKey: config.github.appPrivateKey,
      installationId: config.github.installationId,
      apiBaseUrl: config.github.apiBaseUrl,
    })
    getToken = () => appAuth.getToken()
  }
  return {
    owner: config.github.owner,
    repo: config.github.repo,
    token: config.github.token,
    getToken,
    apiBaseUrl: config.github.apiBaseUrl,
    ref: config.github.productionBranch,
  }
}
