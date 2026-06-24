import { createInterface, type Interface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { readFileIfExists } from './setup/io.js'
import { parseEnvFile, type EnvMap } from './setup/env-file.js'
import { runBootstrap, type BootstrapAnswers, type RunBootstrapResult } from './setup/bootstrap.js'

const RULE = '──────────────────────────────────────────────────────────'

/** Read an answer, falling back to `def` (shown in brackets) on an empty line. */
async function ask(rl: Interface, label: string, def = ''): Promise<string> {
  const suffix = def !== '' ? ` [${def}]` : ''
  const answer = (await rl.question(`${label}${suffix}\n> `)).trim()
  return answer === '' ? def : answer
}

/** Gather the bootstrap answers interactively, with current `.env` values as defaults. */
async function prompt(existing: EnvMap): Promise<BootstrapAnswers> {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    console.log('\nPublic URL — where Helpuit is reachable from the internet (Chatwoot & GitHub')
    console.log('webhooks/callbacks need it).')
    console.log('  • Running LOCALLY? Leave this BLANK and start with `pnpm start --tunnel` — Helpuit')
    console.log('    opens a public tunnel and fills this in for you automatically.')
    console.log('  • DEPLOYED? Enter your domain, e.g. https://helpuit.yourcompany.com')
    const publicUrl = await ask(rl, 'HELPUIT_PUBLIC_URL', existing.HELPUIT_PUBLIC_URL ?? '')

    console.log('\nDatabase — leave the default for a zero-config local SQLite file, or use a remote')
    console.log('libsql/Turso url ("libsql://…"). Postgres is not supported.')
    let databaseUrl = await ask(rl, 'DATABASE_URL', existing.DATABASE_URL ?? 'file:./helpuit.sqlite')
    while (databaseUrl.startsWith('postgres')) {
      console.log('  Helpuit runs on SQLite/libsql, not Postgres — use a file: path or a libsql:// url.')
      databaseUrl = await ask(rl, 'DATABASE_URL', 'file:./helpuit.sqlite')
    }
    const databaseAuthToken = databaseUrl.startsWith('libsql:')
      ? await ask(rl, 'DATABASE_AUTH_TOKEN (for the remote libsql server)', existing.DATABASE_AUTH_TOKEN ?? '')
      : ''

    const nodeEnv = await ask(rl, '\nNODE_ENV', existing.NODE_ENV ?? 'development')
    const port = await ask(rl, 'PORT', existing.PORT ?? '3000')

    return { publicUrl, databaseUrl, databaseAuthToken, nodeEnv, port }
  } finally {
    rl.close()
  }
}

/** Print the post-bootstrap handoff: token, how to start, and what's left for the console. */
function handoff(result: RunBootstrapResult): void {
  console.log(`\n${RULE}`)
  console.log('  Bootstrap complete.')
  console.log(RULE)
  if (result.generated.encryptionKey) {
    console.log('\n  • Generated a strong HELPUIT_ENCRYPTION_KEY (seals the secret vault).')
    console.log('    KEEP IT STABLE and back it up — rotating it makes stored secrets/evidence unreadable.')
  }
  console.log('\n  Admin token (log into the console with this — shown once):')
  console.log(`    ${result.adminToken}`)
  if (result.backedUp) console.log(`\n  Your previous .env was backed up to ${result.envPath}.bak`)

  for (const warning of result.warnings) console.log(`\n  ⚠ ${warning}`)

  console.log('\n  Next:')
  console.log('    1. pnpm --filter @helpuit/web build       (build the console UI — once)')
  if (result.publicUrl !== undefined && result.publicUrl !== '') {
    console.log('    2. pnpm start')
    console.log(`    3. open ${result.publicUrl}  and log in with the token above`)
  } else {
    console.log('    2. pnpm start --tunnel                    (LOCAL: opens a public URL automatically)')
    console.log('         deployed instead? set HELPUIT_PUBLIC_URL to your domain and use `pnpm start`.')
    console.log('    3. open the URL it prints  and log in with the token above')
  }
  console.log('    4. console → Setup checklist: connect GitHub (a token needs no tunnel), Chatwoot, the LLM, identity')

  if (result.missing.secrets.length > 0) {
    console.log(`\n  Still to connect in the console (${result.missing.secrets.length}): ${result.missing.secrets.join(', ')}`)
  }
  if (result.missing.structural.length > 0) {
    console.log(`  Structural gaps to fill in helpuit.config.yaml: ${result.missing.structural.join(', ')}`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isInteger(major) && major < 20) {
    console.warn(`⚠ Helpuit targets Node ≥ 20; you're on ${process.versions.node}. Some features may not work.`)
  }

  const nonInteractive =
    process.argv.includes('--yes') || process.argv.includes('-y') || process.env.HELPUIT_SETUP_NONINTERACTIVE === '1'

  const cwd = process.cwd()
  const existing = parseEnvFile(readFileIfExists('.env') ?? '')

  console.log(`${RULE}\n  Helpuit first-run setup\n${RULE}`)
  console.log('  Generates your encryption key + admin token and captures the few launch-')
  console.log('  critical settings. Connectors are connected afterward in the console.')

  // Non-interactive (Docker/CI): take everything from the environment, no prompts.
  const answers: BootstrapAnswers = nonInteractive
    ? {
        publicUrl: process.env.HELPUIT_PUBLIC_URL,
        databaseUrl: process.env.DATABASE_URL,
        databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
      }
    : await prompt(existing)

  const result = await runBootstrap({ cwd, answers })
  handoff(result)
}

main().catch((error: unknown) => {
  console.error('\nSetup failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
