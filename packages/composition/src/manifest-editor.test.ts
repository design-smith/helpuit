import { describe, it, expect } from 'vitest'
import { validateManifest } from './manifest-editor.js'

describe('validateManifest', () => {
  it('accepts a valid manifest and normalizes missing array fields', () => {
    const result = validateManifest({
      ref: 'main',
      features: [{ key: 'billing', name: 'Billing', routes: ['/settings/billing'], keywords: ['invoice'] }],
    })

    expect(result.ok).toBe(true)
    expect(result.manifest).toEqual({
      ref: 'main',
      features: [
        {
          key: 'billing',
          name: 'Billing',
          routes: ['/settings/billing'],
          components: [],
          endpoints: [],
          docsLinks: [],
          keywords: ['invoice'],
        },
      ],
    })
  })

  it('rejects a missing ref', () => {
    const result = validateManifest({ ref: '', features: [] })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/ref/i)
  })

  it('rejects features missing a key or name', () => {
    const result = validateManifest({ ref: 'main', features: [{ key: '', name: '' }] })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/key/i)
    expect(result.errors.join(' ')).toMatch(/name/i)
  })

  it('rejects duplicate feature keys', () => {
    const result = validateManifest({
      ref: 'main',
      features: [
        { key: 'billing', name: 'A' },
        { key: 'billing', name: 'B' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/duplicate/i)
  })

  it('rejects a non-array features field', () => {
    const result = validateManifest({ ref: 'main', features: 'nope' })
    expect(result.ok).toBe(false)
  })
})
