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
  it('resolves the feature, retrieves its code, and returns the model hypothesis', async () => {
    const model: StaticAnalysisModel = {
      async analyze({ code }) {
        return {
          hypothesis: 'null deref in the save handler',
          suspectedFiles: Object.keys(code),
          confidence: 0.8,
        }
      },
    }
    const investigator = new StaticCodeInvestigator(manifest, retriever, model)

    const findings = await investigator.investigate('save on /settings/billing freezes')

    expect(findings.hypothesis).toContain('null deref')
    expect(findings.suspectedFiles).toContain('BillingForm.vue')
    expect(findings.confidence).toBe(0.8)
  })

  it('analyzes with empty code when no feature matches the complaint', async () => {
    let receivedCode: Record<string, string> | null = null
    const model: StaticAnalysisModel = {
      async analyze({ code, feature }) {
        receivedCode = code
        return { hypothesis: `feature=${feature}`, suspectedFiles: [], confidence: 0.1 }
      },
    }
    const investigator = new StaticCodeInvestigator(manifest, retriever, model)

    const findings = await investigator.investigate('xyzzy plugh unrelated')

    expect(receivedCode).toEqual({})
    expect(findings.hypothesis).toBe('feature=undefined')
  })
})
