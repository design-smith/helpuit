import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MINIMUM_CONFIG } from './minimum-config.js'

// Run from the repo root (vitest cwd) — these assert the shipped docs stay honest.
const read = (path: string): string => readFileSync(path, 'utf8')

describe('docs conformance (FCW-21)', () => {
  it('README documents every minimum-config secret', () => {
    const readme = read('README.md')
    for (const { env } of MINIMUM_CONFIG) expect(readme).toContain(env)
  })

  it('README quick-start reaches a grounded answer via the console (printed token, no file editing)', () => {
    const readme = read('README.md').toLowerCase()
    expect(readme).toContain('admin token') // printed-token first-run flow (FCW-01)
    expect(readme).toContain('checklist') // setup checklist (FCW-08)
    expect(readme).toContain('grounded') // ends at a grounded answer
  })

  it('the capability ladder maps each connection to what it unlocks', () => {
    const ladder = read('docs/capability-ladder.md').toLowerCase()
    for (const keyword of ['github', 'docs', 'account', 'reproduc']) expect(ladder).toContain(keyword)
    expect(ladder).toContain('l1') // names the grounding tier
  })
})
