import { describe, it, expect, afterEach } from 'vitest'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import { createDb, type DbHandle } from './client.js'
import { evidenceArtifacts } from './schema.js'
import { DrizzleEvidenceArtifacts } from './evidence-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const box = new SecretBox(deriveKey('test-encryption-key'))

describe('DrizzleEvidenceArtifacts', () => {
  it('round-trips evidence content and preserves metadata', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEvidenceArtifacts(handle.db, box)

    const id = await repo.save({
      investigationId: 'inv-1',
      type: 'screenshot',
      content: 'console error: save failed for jane@example.com',
      redactionStatus: 'redacted',
    })

    const got = await repo.get(id)
    expect(got?.content).toBe('console error: save failed for jane@example.com')
    expect(got?.type).toBe('screenshot')
    expect(got?.redactionStatus).toBe('redacted')
    expect(got?.investigationId).toBe('inv-1')
  })

  it('stores content encrypted at rest — the raw column is not plaintext', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEvidenceArtifacts(handle.db, box)
    const plaintext = 'highly sensitive evidence blob'

    const id = await repo.save({
      investigationId: 'inv-2',
      type: 'har',
      content: plaintext,
      redactionStatus: 'raw',
    })

    const raw = await handle.db.select().from(evidenceArtifacts)
    expect(raw).toHaveLength(1)
    expect(raw[0]!.content).not.toBeNull()
    expect(raw[0]!.content).not.toContain(plaintext) // ciphertext, not plaintext
    expect(box.open(raw[0]!.content!)).toBe(plaintext) // and it decrypts back

    expect((await repo.get(id))?.content).toBe(plaintext)
  })

  it('lists artifacts for an investigation with content decrypted', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEvidenceArtifacts(handle.db, box)
    await repo.save({ investigationId: 'inv-3', type: 'log', content: 'a', redactionStatus: 'raw' })
    await repo.save({ investigationId: 'inv-3', type: 'log', content: 'b', redactionStatus: 'raw' })
    await repo.save({ investigationId: 'other', type: 'log', content: 'c', redactionStatus: 'raw' })

    const rows = await repo.listForInvestigation('inv-3')
    expect(rows.map((r) => r.content).sort()).toEqual(['a', 'b'])
  })
})
