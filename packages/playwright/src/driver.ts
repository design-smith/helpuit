import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { SandboxAccount } from '@helpuit/sandbox'
import type { BrowserDriver, BrowserSession, Evidence, ReproductionPlan } from '@helpuit/reproduction'

export interface PlaywrightLoginConfig {
  mode: 'form' | 'api'
  url: string
  userSelector?: string
  passSelector?: string
  submitSelector?: string
}

export interface PlaywrightDriverOptions {
  targetUrl: string
  login: PlaywrightLoginConfig
  headless?: boolean
  /** Where to resolve the account's username/password secret refs from. */
  env?: Record<string, string | undefined>
}

class PlaywrightSession implements BrowserSession {
  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
    private readonly targetUrl: string,
    private readonly consoleErrors: string[],
    private readonly networkErrors: string[],
  ) {}

  async run(plan: ReproductionPlan): Promise<Evidence> {
    await this.page.goto(`${this.targetUrl.replace(/\/$/, '')}${plan.route}`)
    for (const step of plan.steps) {
      if (step.action === 'goto' && step.url !== undefined) await this.page.goto(step.url)
      else if (step.action === 'click' && step.selector !== undefined) await this.page.click(step.selector)
      else if (step.action === 'fill' && step.selector !== undefined)
        await this.page.fill(step.selector, step.value ?? '')
    }
    const screenshot = (await this.page.screenshot()).toString('base64')
    return {
      consoleErrors: [...this.consoleErrors],
      networkErrors: [...this.networkErrors],
      screenshot,
    }
  }

  async dispose(): Promise<void> {
    await this.context.close()
  }
}

/**
 * Real Playwright `BrowserDriver`: launches headless Chromium, logs in as the
 * sandbox account (secret refs resolved from env), drives the page, and captures
 * console + 5xx network errors + a screenshot. The browser is launched once and
 * reused; each `open` gets an isolated context.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  private browser: Browser | undefined

  constructor(private readonly options: PlaywrightDriverOptions) {}

  private async browserInstance(): Promise<Browser> {
    if (this.browser === undefined) {
      this.browser = await chromium.launch({ headless: this.options.headless ?? true })
    }
    return this.browser
  }

  async open(account: SandboxAccount, _containerId: string): Promise<BrowserSession> {
    const browser = await this.browserInstance()
    const context = await browser.newContext()
    const page = await context.newPage()

    const consoleErrors: string[] = []
    const networkErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) networkErrors.push(`${res.request().method()} ${res.url()} -> ${res.status()}`)
    })

    const env = this.options.env ?? process.env
    const username = env[account.usernameSecret] ?? ''
    const password = env[account.passwordSecret] ?? ''
    if (this.options.login.mode === 'form') {
      await page.goto(this.options.login.url)
      const { userSelector, passSelector, submitSelector } = this.options.login
      if (userSelector !== undefined) await page.fill(userSelector, username)
      if (passSelector !== undefined) await page.fill(passSelector, password)
      if (submitSelector !== undefined) await page.click(submitSelector)
    }

    return new PlaywrightSession(page, context, this.options.targetUrl, consoleErrors, networkErrors)
  }

  async close(session: BrowserSession): Promise<void> {
    if (session instanceof PlaywrightSession) await session.dispose()
  }

  /** Close the shared browser (call on shutdown). */
  async shutdown(): Promise<void> {
    await this.browser?.close()
    this.browser = undefined
  }
}
