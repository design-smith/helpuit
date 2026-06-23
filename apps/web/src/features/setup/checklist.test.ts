import { describe, it, expect } from 'vitest'
import type { Readiness } from '../../lib/api'
import { buildSetupChecklist, selectHome } from './checklist'

// A fresh, unconfigured console: nothing connected yet.
const FRESH: Readiness = {
  ready: false,
  blockers: [
    { key: 'GITHUB_TOKEN', message: 'GITHUB_TOKEN is required but not set' },
    { key: 'CHATWOOT_API_TOKEN', message: 'CHATWOOT_API_TOKEN is required but not set' },
    { key: 'ANTHROPIC_API_KEY', message: 'ANTHROPIC_API_KEY is required but not set' },
    { key: 'IDENTITY_HMAC_SECRET', message: 'IDENTITY_HMAC_SECRET is required but not set' },
    { key: 'SANDBOX_ADMIN_USER', message: 'SANDBOX_ADMIN_USER is required but not set' },
  ],
  warnings: [{ key: 'GITHUB_WEBHOOK_SECRET', message: 'GITHUB_WEBHOOK_SECRET is optional and not set' }],
}

describe('buildSetupChecklist', () => {
  it('renders a todo item per unconnected required area, each linking to its fix', () => {
    const items = buildSetupChecklist(FRESH)
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))

    expect(byId.github!.status).toBe('todo')
    expect(byId.github!.href).toBe('/connections')
    expect(byId.chatwoot!.status).toBe('todo')
    expect(byId.chatwoot!.href).toBe('/connections')
    expect(byId.llm!.status).toBe('todo')
    expect(byId.llm!.href).toBe('/settings')

    // Optional rungs are always offered, never blocking.
    expect(byId.docs!.status).toBe('optional')
    expect(byId.accountData!.status).toBe('optional')
  })

  it('does not lose any blocker — every required blocker is reflected by a todo item', () => {
    const items = buildSetupChecklist(FRESH)
    const todoBlockerKeys = items.filter((i) => i.status === 'todo').flatMap((i) => i.keys)
    for (const blocker of FRESH.blockers) {
      expect(todoBlockerKeys).toContain(blocker.key)
    }
  })

  it('marks an area done once its blockers clear, and routes leftover required keys to a catch-all', () => {
    // GitHub + Chatwoot + LLM + identity all set; only a sandbox cred remains.
    const partial: Readiness = {
      ready: false,
      blockers: [{ key: 'SANDBOX_ADMIN_USER', message: 'SANDBOX_ADMIN_USER is required but not set' }],
      warnings: [],
    }
    const byId = Object.fromEntries(buildSetupChecklist(partial).map((i) => [i.id, i]))

    expect(byId.github!.status).toBe('done')
    expect(byId.chatwoot!.status).toBe('done')
    expect(byId.llm!.status).toBe('done')
    expect(byId.identity!.status).toBe('done')
    // the unclaimed required blocker is surfaced, not dropped
    expect(byId.other!.status).toBe('todo')
    expect(byId.other!.keys).toContain('SANDBOX_ADMIN_USER')
  })

  it('has no catch-all and all required rungs done when fully ready', () => {
    const ready: Readiness = { ready: true, blockers: [], warnings: [] }
    const items = buildSetupChecklist(ready)
    expect(items.find((i) => i.id === 'other')).toBeUndefined()
    expect(items.filter((i) => i.status === 'todo')).toHaveLength(0)
    expect(items.filter((i) => i.id === 'github' || i.id === 'chatwoot' || i.id === 'llm').every((i) => i.status === 'done')).toBe(true)
  })
})

describe('selectHome', () => {
  it('shows the checklist until ready, then the dashboard', () => {
    expect(selectHome(FRESH)).toBe('checklist')
    expect(selectHome({ ready: true, blockers: [], warnings: [] })).toBe('dashboard')
  })
})
