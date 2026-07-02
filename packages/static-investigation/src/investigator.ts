import { resolveFeature, type FeatureManifest } from '@helpuit/feature-manifest'

/** How the code explains the complaint — the product-language verdict of the Code Analyst. */
export type CodeVerdict = 'user_error_or_prerequisite' | 'actual_bug' | 'explains_behavior'

/**
 * Two-layer findings: the technical layer (hypothesis/files/confidence) is for the
 * internal side only — escalation drafts, the console, the case memory. The
 * product-language layer (explanation + verdict) is the ONLY part that may reach
 * the customer-facing Composer.
 */
export interface StaticFindings {
  hypothesis: string
  suspectedFiles: string[]
  confidence: number
  /** Customer-safe explanation of what the code does — no paths, no engineer-speak. */
  explanation: string
  verdict: CodeVerdict
  /** The feature the complaint resolved to (used for dedup + the issue). */
  feature?: string
}

/** Reads source for the resolved feature's files (GitHub MCP in prod). */
export interface CodeRetriever {
  retrieve(paths: string[]): Promise<Record<string, string>>
}

/** Inspects code to spot the defect (the LLM, faked in tests). */
export interface StaticAnalysisModel {
  analyze(input: {
    complaint: string
    feature?: string
    code: Record<string, string>
  }): Promise<StaticFindings>
}

/**
 * L3a static code investigation (issue 42): resolve the complaint to a feature,
 * read that feature's code, and try to spot the defect by inspection — no
 * browser. Produces a hypothesis, suspected files, and a confidence the
 * classifier and the (later) dynamic reproducer consume.
 */
export class StaticCodeInvestigator {
  constructor(
    private readonly manifest: FeatureManifest,
    private readonly retriever: CodeRetriever,
    private readonly model: StaticAnalysisModel,
  ) {}

  async investigate(complaint: string): Promise<StaticFindings> {
    const top = resolveFeature(this.manifest, complaint)[0]?.feature
    const code = top !== undefined ? await this.retriever.retrieve(top.components) : {}
    const findings = await this.model.analyze({ complaint, feature: top?.name, code })
    return { ...findings, feature: top?.name }
  }
}
