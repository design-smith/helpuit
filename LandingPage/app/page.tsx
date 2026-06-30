import type { ReactNode } from "react"
import {
  ArrowDown,
  BookOpen,
  Boxes,
  Check,
  Database,
  EyeOff,
  FileCode2,
  Filter,
  FlaskConical,
  Gauge,
  GitBranch,
  GitPullRequest,
  Github,
  Hand,
  KeyRound,
  Lock,
  type LucideIcon,
  MessageSquare,
  PlayCircle,
  Rocket,
  Scale,
  Server,
  Terminal,
  Timer,
  UserCheck,
} from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Badge,
  Callout,
  CodeBlock,
  cx,
  Detail,
  IconChip,
  LinkButton,
  ProgressBar,
  PulseDot,
} from "@/components/site/ui"
import { CountUp, Reveal, ScrollProgressBar } from "@/components/site/motion"
import { InvestigationScroller } from "@/components/site/InvestigationScroller"
import { BeforeAfterToggle } from "@/components/site/BeforeAfterToggle"
import { HeroDemo } from "@/components/site/HeroDemo"

const REPO_URL = "https://github.com/design-smith/helpuit"
const DOCS_URL = "https://github.com/design-smith/helpuit#readme"

// ─── Section helpers ───

function Shell({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cx("border-b-2 border-border", className)}>
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <Badge tone="indigo" className="uppercase tracking-wide">{children}</Badge>
}

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("mt-4 font-heading text-3xl leading-[1.05] tracking-tight md:text-5xl", className)}>{children}</h2>
}

function FeatureCard({ icon, tone = "indigo", title, children }: { icon: LucideIcon; tone?: string; title: string; children: ReactNode }) {
  return (
    <div className="card h-full space-y-3 p-5">
      <IconChip icon={icon} tone={tone} />
      <h3 className="font-heading text-lg">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function Ticker() {
  const a = "GROUNDED IN YOUR CODE · VERIFIED ACCOUNT STATE · SANDBOX REPRODUCTION · DEDUPED ISSUES · REDACTED · COST-CAPPED · "
  const b = "NO RAW SQL · HUMAN GATE · ENCRYPTED AT REST · MODEL-AGNOSTIC · STOCK CHATWOOT · SELF-HOSTED · "
  return (
    <div className="border-b-2 border-border bg-foreground text-background">
      <div className="overflow-hidden py-2.5">
        <div className="flex w-max animate-marquee whitespace-nowrap font-heading text-sm uppercase tracking-[0.18em]">
          <span className="px-2">{a.repeat(2)}</span>
          <span className="px-2">{a.repeat(2)}</span>
        </div>
      </div>
      <div className="overflow-hidden border-t-2 border-background/20 py-2.5">
        <div className="flex w-max animate-marquee-reverse whitespace-nowrap font-heading text-sm uppercase tracking-[0.18em] text-main">
          <span className="px-2">{b.repeat(2)}</span>
          <span className="px-2">{b.repeat(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Page ───

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <ScrollProgressBar />
      <div className="mx-auto max-w-[1400px] bg-background md:border-x-2 md:border-border">
        {/* Header */}
        <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b-2 border-border bg-secondary-background px-5 md:h-20 md:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/helpuit-mark.png" alt="Helpuit" className="h-10 w-auto" />
            <span className="font-heading text-xl tracking-tight">helpuit</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm md:flex">
            <a href="#ladder" className="hover:text-main">How it works</a>
            <a href="#under-the-hood" className="hover:text-main">Architecture</a>
            <a href="#guardrails" className="hover:text-main">Safety</a>
            <a href="#pricing" className="hover:text-main">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <LinkButton href={REPO_URL} className="hidden sm:inline-flex">
              <Github className="h-4 w-4" /> GitHub
            </LinkButton>
            <LinkButton href={DOCS_URL} variant="primary">Get started</LinkButton>
          </div>
        </header>

        <main id="top">
          {/* Hero */}
          <section className="relative overflow-hidden border-b-2 border-border bg-grid">
            <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1fr_minmax(340px,400px)] lg:items-center">
              <Reveal variant="rise">
                <Eyebrow>Self-hosted · Source-available</Eyebrow>
                <h1 className="mt-5 font-heading text-4xl leading-[1.02] tracking-tight md:text-6xl">
                  AI support that <span className="bg-main px-2 text-main-foreground">investigates</span> before it escalates.
                </h1>
                <p className="mt-5 max-w-md text-lg text-muted">
                  It reads your code, checks the account, reproduces the bug, files the issue.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <LinkButton href={REPO_URL} variant="primary" className="text-base">
                    <Github className="h-4 w-4" /> View on GitHub
                  </LinkButton>
                  <LinkButton href="#ladder" className="text-base">See how it works</LinkButton>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  <Badge tone="slate">Chatwoot</Badge>
                  <Badge tone="slate">GitHub</Badge>
                  <Badge tone="slate">Self-hosted</Badge>
                </div>
              </Reveal>

              <Reveal variant="stamp" delay={0.1}>
                <HeroDemo />
              </Reveal>
            </div>
          </section>

          <Ticker />

          {/* The gap — before/after */}
          <Shell id="gap">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <Reveal variant="rise">
                <Eyebrow>The gap</Eyebrow>
                <SectionTitle>Two worlds that don&apos;t talk.</SectionTitle>
                <p className="mt-4 max-w-md text-muted">
                  Support guesses, engineering can&apos;t reproduce, and the ticket just sits there. Flip the switch.
                </p>
              </Reveal>
              <Reveal variant="stamp" delay={0.08}>
                <BeforeAfterToggle />
              </Reveal>
            </div>
          </Shell>

          {/* Centerpiece */}
          <InvestigationScroller />

          {/* What it does */}
          <Shell id="does" className="bg-secondary-background">
            <Reveal variant="rise">
              <Eyebrow>What it does</Eyebrow>
              <SectionTitle>Four moves, all grounded.</SectionTitle>
            </Reveal>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: FileCode2, title: "Answers from the product", body: "Docs, source, manifest, known issues." },
                { icon: UserCheck, title: "Checks real state", body: "Verified identity, plan, permissions, flags." },
                { icon: PlayCircle, title: "Reproduces bugs", body: "Sandbox browser. Screenshots, console, network." },
                { icon: GitPullRequest, title: "Escalates with proof", body: "Dedupes, files redacted issues, syncs status." },
              ].map((c, i) => (
                <Reveal key={c.title} variant="stamp" delay={i * 0.07}>
                  <FeatureCard icon={c.icon} title={c.title}>{c.body}</FeatureCard>
                </Reveal>
              ))}
            </div>
          </Shell>

          {/* Guardrails */}
          <Shell id="guardrails">
            <Reveal variant="rise">
              <Eyebrow>Guardrails</Eyebrow>
              <SectionTitle>Trusted with code and data.</SectionTitle>
            </Reveal>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Lock, title: "Verified identity", body: "Never a chat-asserted user." },
                { icon: Database, title: "No raw SQL", body: "Column-allowlisted read-only routes." },
                { icon: EyeOff, title: "Redaction", body: "Strips secrets before replies and issues." },
                { icon: Gauge, title: "Cost caps", body: "Breach a budget, work halts." },
                { icon: KeyRound, title: "Encrypted", body: "AES-256-GCM on evidence and secrets." },
                { icon: Hand, title: "Human gate", body: "Risky actions never run alone." },
                { icon: Timer, title: "Retention", body: "Data ages out on your window." },
                { icon: Filter, title: "Scoped reads", body: "Only the verified user's data." },
              ].map((c, i) => (
                <Reveal key={c.title} variant="stamp" delay={(i % 4) * 0.06}>
                  <FeatureCard icon={c.icon} title={c.title}>{c.body}</FeatureCard>
                </Reveal>
              ))}
            </div>
          </Shell>

          {/* Under the hood */}
          <Shell id="under-the-hood" className="bg-secondary-background">
            <Reveal variant="rise">
              <Eyebrow>Under the hood</Eyebrow>
              <SectionTitle>No fork. Single-tenant. Yours.</SectionTitle>
              <p className="mt-4 max-w-lg text-muted">Stock Chatwoot in, a GitHub issue out. Pick your store.</p>
            </Reveal>

            <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">
              {/* Diagram */}
              <div className="mx-auto w-full max-w-md">
                <Reveal variant="stamp"><ArchBox icon={MessageSquare} title="Chatwoot inbox" subtitle="Agent Bot + webhooks" tone="sky" /></Reveal>
                <ArrowRow />
                <Reveal variant="stamp" delay={0.05}><ArchBox icon={Boxes} title="Helpuit agent" subtitle="SQLite/libsql · or Postgres/Supabase" tone="indigo" /></Reveal>
                <ArrowRow />
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Github, title: "GitHub", sub: "Code + issues" },
                    { icon: Server, title: "LLM", sub: "Model-agnostic" },
                    { icon: PlayCircle, title: "Playwright", sub: "Optional" },
                    { icon: Database, title: "Account routes", sub: "Optional" },
                  ].map((b, i) => (
                    <Reveal key={b.title} variant="stamp" delay={0.1 + i * 0.05}>
                      <ArchBox icon={b.icon} title={b.title} subtitle={b.sub} tone="slate" compact />
                    </Reveal>
                  ))}
                </div>
                <ArrowRow />
                <Reveal variant="stamp" delay={0.1}><ArchBox icon={GitPullRequest} title="Issue + ticket update" subtitle="Redacted · deduped · synced" tone="emerald" /></Reveal>
              </div>

              {/* Console preview */}
              <Reveal variant="rise" delay={0.05}>
                <div className="card space-y-5 p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-heading">Operator console</span>
                    <span className="inline-flex items-center gap-2 text-xs text-muted"><PulseDot /> real-time</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox label="Investigations" value={<CountUp to={128} />} />
                    <StatBox label="Issues linked" value={<CountUp to={9} />} />
                    <StatBox label="Repro success" value={<CountUp to={86} suffix="%" />} />
                    <StatBox label="Queue depth" value={<CountUp to={3} />} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted"><span>Monthly LLM budget</span><span>62%</span></div>
                    <ProgressBar value={0.62} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Detail label="Paused">1 conversation</Detail>
                    <Detail label="Dead-letter">0 jobs</Detail>
                  </div>
                </div>
              </Reveal>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Badge tone="slate">Stock Chatwoot</Badge>
              <Badge tone="slate">Single-tenant</Badge>
              <Badge tone="slate">No raw SQL</Badge>
              <Badge tone="slate">Model-agnostic LLM</Badge>
            </div>
          </Shell>

          {/* Connect & run */}
          <Shell id="connect">
            <Reveal variant="rise">
              <Eyebrow>Connect &amp; run</Eyebrow>
              <SectionTitle>Wire what you need.</SectionTitle>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: MessageSquare, name: "Chatwoot", req: true, detail: "Auto-set-up bot + webhook." },
                { icon: Github, name: "GitHub", req: true, detail: "App or token." },
                { icon: Server, name: "LLM provider", req: true, detail: "Anthropic, OpenAI, Bedrock, local." },
                { icon: UserCheck, name: "Identity", req: true, detail: "HMAC, JWT, or endpoint." },
                { icon: Database, name: "Datastore", req: true, detail: "SQLite, or Postgres/Supabase." },
                { icon: Filter, name: "Account routes", req: false, detail: "Read-only. Unlocks L2." },
                { icon: PlayCircle, name: "Playwright", req: false, detail: "Sandbox repro. Unlocks L3b." },
                { icon: BookOpen, name: "Docs", req: false, detail: "Repo, paste, or upload." },
              ].map((t, i) => (
                <Reveal key={t.name} variant="stamp" delay={(i % 3) * 0.06}>
                  <div className="card h-full space-y-3 p-5">
                    <div className="flex items-center justify-between">
                      <IconChip icon={t.icon} tone={t.req ? "indigo" : "slate"} />
                      <Badge tone={t.req ? "emerald" : "amber"}>{t.req ? "Required" : "Optional"}</Badge>
                    </div>
                    <h3 className="font-heading">{t.name}</h3>
                    <p className="text-sm text-muted">{t.detail}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal variant="rise" className="mt-10">
              <Tabs defaultValue="local">
                <TabsList>
                  <TabsTrigger value="local">Local</TabsTrigger>
                  <TabsTrigger value="production">Production</TabsTrigger>
                  <TabsTrigger value="docker">Docker</TabsTrigger>
                </TabsList>
                <TabsContent value="local">
                  <div className="card space-y-3 p-5">
                    <CodeBlock>{`git clone ${REPO_URL}.git
cd helpuit && pnpm install
pnpm setup            # press Enter for SQLite
pnpm start --tunnel   # prints a public URL`}</CodeBlock>
                    <p className="text-sm text-muted">Zero DB setup. Connect the rest in the console.</p>
                  </div>
                </TabsContent>
                <TabsContent value="production">
                  <div className="card space-y-3 p-5">
                    <CodeBlock>{`pnpm setup                  # your own domain
DATABASE_URL=postgres://…   # or a libsql:// Turso URL
pnpm --filter @helpuit/web build
pnpm start                  # behind TLS`}</CodeBlock>
                    <p className="text-sm text-muted">Bring your own store. SQLite/Turso today, Postgres/Supabase too.</p>
                  </div>
                </TabsContent>
                <TabsContent value="docker">
                  <div className="card space-y-3 p-5">
                    <CodeBlock>{`docker compose up -d
pnpm setup --yes        # reads env, non-interactive`}</CodeBlock>
                    <p className="text-sm text-muted">An admin token prints on first boot. Sign in, connect.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </Reveal>
          </Shell>

          {/* Maturity */}
          <Shell id="maturity" className="bg-secondary-background">
            <Reveal variant="rise">
              <Eyebrow>Maturity</Eyebrow>
              <SectionTitle>Shipped, staged, planned.</SectionTitle>
            </Reveal>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <Reveal variant="stamp">
                <MaturityCard icon={Check} tone="emerald" title="Shipped" items={["Full L1 to L4 pipeline", "Operator console", "Every guardrail", "SQLite/libsql + Turso", "Model-agnostic LLM"]} />
              </Reveal>
              <Reveal variant="stamp" delay={0.07}>
                <MaturityCard icon={FlaskConical} tone="amber" title="Staged" items={["L3b browser repro", "Real-Chromium tested", "Opt-in, wiring staged"]} />
              </Reveal>
              <Reveal variant="stamp" delay={0.14}>
                <MaturityCard icon={Rocket} tone="sky" title="Planned" items={["Postgres/Supabase engine", "pgvector docs search", "Per-investigation spend"]} />
              </Reveal>
            </div>
          </Shell>

          {/* Pricing */}
          <Shell id="pricing">
            <Reveal variant="rise">
              <Eyebrow>Licensing</Eyebrow>
              <SectionTitle>Free to tinker. Licensed to ship.</SectionTitle>
            </Reveal>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <Reveal variant="stamp">
                <div className="card h-full space-y-4 p-6">
                  <IconChip icon={BookOpen} tone="emerald" />
                  <h3 className="font-heading text-2xl">Noncommercial</h3>
                  <p className="font-heading text-3xl">Free</p>
                  <ul className="space-y-2">
                    <CheckLine>Personal, research, education</CheckLine>
                    <CheckLine>Read, run, and modify the source</CheckLine>
                    <CheckLine>PolyForm Noncommercial 1.0.0</CheckLine>
                  </ul>
                  <LinkButton href={REPO_URL} variant="primary" className="w-full">Get started</LinkButton>
                </div>
              </Reveal>
              <Reveal variant="stamp" delay={0.08}>
                <div className="card h-full space-y-4 p-6">
                  <IconChip icon={Scale} tone="indigo" />
                  <h3 className="font-heading text-2xl">Commercial</h3>
                  <p className="font-heading text-3xl">License</p>
                  <ul className="space-y-2">
                    <CheckLine>Any business deployment</CheckLine>
                    <CheckLine>Same source, commercial terms</CheckLine>
                    <CheckLine>Self-hosted on your infra</CheckLine>
                  </ul>
                  <LinkButton href={`${REPO_URL}/blob/main/COMMERCIAL-LICENSE.md`} className="w-full">Get a license</LinkButton>
                </div>
              </Reveal>
            </div>
            <Reveal variant="rise" className="mt-6">
              <Callout tone="warn">
                <span className="font-heading">Source-available, not open source.</span> Free to read, run, and modify for noncommercial use.
              </Callout>
            </Reveal>
          </Shell>

          {/* FAQ */}
          <Shell id="faq" className="bg-secondary-background">
            <Reveal variant="rise">
              <Eyebrow>FAQ</Eyebrow>
              <SectionTitle>Quick answers.</SectionTitle>
            </Reveal>
            <Reveal variant="rise" delay={0.05} className="mt-10 block max-w-3xl">
              <Accordion type="single" collapsible className="space-y-4">
                <AccordionItem value="fork">
                  <AccordionTrigger>Does it fork Chatwoot?</AccordionTrigger>
                  <AccordionContent>No. It runs alongside stock Chatwoot through an Agent Bot and webhooks, set up for you from the console.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="hallucinate">
                  <AccordionTrigger>Will it make things up?</AccordionTrigger>
                  <AccordionContent>It answers from your docs and code, and checks its own grounding. If it has no real sources, it escalates instead of guessing.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="database">
                  <AccordionTrigger>Can it touch my database?</AccordionTrigger>
                  <AccordionContent>Only through read-only, column-allowlisted routes scoped to a verified user. Never raw SQL.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="oss">
                  <AccordionTrigger>Is it open source?</AccordionTrigger>
                  <AccordionContent>Source-available under PolyForm Noncommercial. Free for noncommercial use; business use needs a license.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="models">
                  <AccordionTrigger>Which models can I run?</AccordionTrigger>
                  <AccordionContent>Anthropic, OpenAI, Bedrock, DeepSeek, or any OpenAI-compatible / local model. Set per pipeline tier.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </Reveal>
          </Shell>

          {/* Final CTA */}
          <section className="border-b-2 border-border bg-main text-main-foreground">
            <div className="mx-auto max-w-6xl px-5 py-20 text-center md:px-8 md:py-28">
              <Reveal variant="stamp">
                <h2 className="font-heading text-4xl leading-[1.05] tracking-tight md:text-6xl">Self-host your support engineer.</h2>
                <p className="mx-auto mt-4 max-w-md text-lg">Grounded answers. Real issues. Your infra.</p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <LinkButton href={REPO_URL} className="text-base"><Github className="h-4 w-4" /> View GitHub</LinkButton>
                  <LinkButton href={DOCS_URL} className="text-base"><Terminal className="h-4 w-4" /> Read the docs</LinkButton>
                  <LinkButton href="#connect" className="text-base"><GitBranch className="h-4 w-4" /> Get started</LinkButton>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-secondary-background">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4 md:px-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/helpuit-logo.png" alt="Helpuit" className="h-auto w-40" />
              <p className="mt-4 text-sm text-muted">Source-available AI support engineer. It investigates before it escalates.</p>
            </div>
            <FooterCol title="Product" links={[["How it works", "#ladder"], ["Architecture", "#under-the-hood"], ["Safety", "#guardrails"], ["Pricing", "#pricing"]]} />
            <FooterCol title="Resources" links={[["README", DOCS_URL], ["Capability ladder", `${REPO_URL}/blob/main/docs/capability-ladder.md`], ["Architecture", `${REPO_URL}/blob/main/docs/ARCHITECTURE.md`], ["Self-hosting", `${REPO_URL}/blob/main/docs/SELF-HOSTING.md`]]} />
            <FooterCol title="Legal" links={[["License", `${REPO_URL}/blob/main/LICENSE`], ["Commercial license", `${REPO_URL}/blob/main/COMMERCIAL-LICENSE.md`], ["GitHub", REPO_URL]]} />
          </div>
          <div className="border-t-2 border-border">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs md:flex-row md:items-center md:justify-between md:px-8">
              <span>© 2026 Helpuit</span>
              <span>PolyForm Noncommercial 1.0.0</span>
              <a href={REPO_URL} className="inline-flex items-center gap-1.5 hover:text-main"><Github className="h-3.5 w-3.5" /> design-smith/helpuit</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── Small server-side helpers ───

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-main" />
      <span>{children}</span>
    </li>
  )
}

function ArrowRow() {
  return (
    <div className="flex justify-center py-2">
      <ArrowDown className="h-6 w-6" />
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-base border-2 border-border bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-heading">{value}</div>
    </div>
  )
}

function ArchBox({ icon: Icon, title, subtitle, tone = "slate", compact = false }: { icon: LucideIcon; title: string; subtitle?: string; tone?: string; compact?: boolean }) {
  return (
    <div className={cx("flex items-center gap-3 rounded-base border-2 border-border bg-secondary-background shadow-shadow", compact ? "p-3" : "p-4")}>
      <IconChip icon={Icon} tone={tone} />
      <div className="min-w-0">
        <div className="font-heading text-sm leading-tight">{title}</div>
        {subtitle !== undefined && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
      </div>
    </div>
  )
}

function MaturityCard({ icon, tone, title, items }: { icon: LucideIcon; tone: string; title: string; items: string[] }) {
  return (
    <div className="card h-full space-y-4 p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={icon} tone={tone} />
        <h3 className="font-heading text-lg">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <CheckLine key={it}>{it}</CheckLine>
        ))}
      </ul>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h4 className="font-heading text-sm uppercase tracking-wide text-muted">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm hover:text-main">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
