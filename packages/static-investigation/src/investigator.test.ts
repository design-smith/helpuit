import { describe, it, expect } from 'vitest'
import type { FeatureManifest } from '@helpuit/feature-manifest'
import {
  StaticCodeInvestigator,
  type CodeRetriever,
  type StaticAnalysisModel,
} from './investigator.js'

const manifest: FeatureManifest = {
  ref: 'main',
  features: [
    {
      key: 'billing',
      name: 'Billing',
      routes: ['/settings/billing'],
      components: ['BillingForm.vue'],
      endpoints: ['POST /api/billing/update'],
      docsLinks: [],
      keywords: ['card', 'payment'],
    },
  ],
}

const retriever: CodeRetriever = {
  async retrieve(paths) {
    const out: Record<string, string> = {}
    for (const path of paths) out[path] = `// source of ${path}`
    return out
  },
}

describe('StaticCodeInvestigator', () => {
  it('resolves the feature, retrieves its code, and passes BOTH finding layers through', async () => {
    const model: StaticAnalysisModel = {
      async analyze({ code }) {
        return {
          hypothesis: 'null deref in the save handler',
          suspectedFiles: Object.keys(code),
          confidence: 0.8,
          explanation: 'Saving fails when the card form is submitted while a payment is still processing.',
          verdict: 'actual_bug',
        }
      },
    }
    const investigator = new StaticCodeInvestigator(manifest, retriever, model)

    const findings = await investigator.investigate('save on /settings/billing freezes')

    expect(findings.hypothesis).toContain('null deref')
    expect(findings.suspectedFiles).toContain('BillingForm.vue')
    expect(findings.confidence).toBe(0.8)
    expect(findings.verdict).toBe('actual_bug')
    expect(findings.explanation).toContain('payment is still processing')
  })

  it('analyzes with empty code when no feature matches the complaint', async () => {
    let receivedCode: Record<string, string> | null = null
    const model: StaticAnalysisModel = {
      async analyze({ code, feature }) {
        receivedCode = code
        return {
          hypothesis: `feature=${feature}`,
          suspectedFiles: [],
          confidence: 0.1,
          explanation: 'nothing conclusive',
          verdict: 'explains_behavior',
        }
      },
    }
    const investigator = new StaticCodeInvestigator(manifest, retriever, model)

    const findings = await investigator.investigate('xyzzy plugh unrelated')

    expect(receivedCode).toEqual({})
    expect(findings.hypothesis).toBe('feature=undefined')
  })
})
