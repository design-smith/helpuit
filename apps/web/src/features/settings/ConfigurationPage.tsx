import { useState, type ReactNode } from 'react'
import { useApplySection, useEffectiveConfig, useTestLlm, type ApplyResult, type LlmTestResult } from '../../lib/api'
import {
  Button,
  CenteredSpinner,
  Checkbox,
  ErrorState,
  Field,
  FormResult,
  Input,
  PageHeader,
  Section,
  Select,
} from '../../components/ui'
import { IdentityFormInner } from './IdentityForm'

/** A config section with its own draft state + Apply button + result feedback. */
function SectionCard({
  title,
  section,
  hint,
  children,
  buildValue,
}: {
  title: string
  section: string
  hint: string
  children: ReactNode
  buildValue: () => unknown
}) {
  const apply = useApplySection()
  const [result, setResult] = useState<ApplyResult | null>(null)

  async function onApply() {
    setResult(null)
    setResult(await apply.mutateAsync({ section, value: buildValue() }))
  }

  return (
    <Section
      title={title}
      hint={hint}
      footer={
        <>
          <Button variant="primary" loading={apply.isPending} onClick={onApply}>
            Apply live
          </Button>
          {result?.ok === true && <FormResult tone="success">Applied live ✓</FormResult>}
          {result?.ok === false && <FormResult tone="error">{result.issues.join('; ') || 'Invalid'}</FormResult>}
        </>
      }
    >
      <div className="space-y-3">{children}</div>
    </Section>
  )
}

export function ConfigurationPage() {
  const { data, isPending, isError, error, refetch } = useEffectiveConfig()
  if (isPending) return <CenteredSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const cfg = data.config
  return (
    <div>
      <PageHeader title="Configuration" subtitle="Structural settings apply live — no restart needed" />
      <div className="grid gap-4 lg:grid-cols-2">
        <PolicyCard policy={cfg.policy} />
        <BudgetCard budget={cfg.budget} />
        <AlertsCard alerts={cfg.alerts} />
        <ModelsCard models={cfg.models} />
        <Section
          title="Identity"
          hint="How Helpuit verifies a customer's login token before reading their account data (the secret is stored under Secrets)."
        >
          <IdentityFormInner identity={cfg.identity} />
        </Section>
      </div>
    </div>
  )
}

function PolicyCard({ policy }: { policy: any }) {
  const [autopublish, setAutopublish] = useState<string>(policy.autopublish)
  const [resolutionMode, setResolutionMode] = useState<string>(policy.resolutionMode)
  const [allowAnonymous, setAllowAnonymous] = useState<boolean>(policy.allowAnonymous)
  const [playwrightEnabled, setPlaywrightEnabled] = useState<boolean>(policy.playwrightEnabled)
  return (
    <SectionCard
      title="Policy"
      section="policy"
      hint="Autopublish, resolution notifications, anonymous access, reproduction switch."
      buildValue={() => ({ autopublish, resolutionMode, allowAnonymous, playwrightEnabled })}
    >
      <Field label="Issue autopublish" row>
        <Select className="w-40" value={autopublish} onChange={(e) => setAutopublish(e.target.value)}>
          <option value="draft">draft (approve)</option>
          <option value="auto">auto (file now)</option>
        </Select>
      </Field>
      <Field label="Resolution mode" row>
        <Select className="w-40" value={resolutionMode} onChange={(e) => setResolutionMode(e.target.value)}>
          <option value="manual">manual</option>
          <option value="auto">auto</option>
        </Select>
      </Field>
      <Field label="Allow anonymous" row>
        <Checkbox checked={allowAnonymous} onChange={(e) => setAllowAnonymous(e.target.checked)} />
      </Field>
      <Field label="Reproduction enabled" row>
        <Checkbox checked={playwrightEnabled} onChange={(e) => setPlaywrightEnabled(e.target.checked)} />
      </Field>
    </SectionCard>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label} row>
      <Input className="w-40 text-right" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

function BudgetCard({ budget }: { budget: any }) {
  const [perInvestigation, setPerInv] = useState<number>(budget.perInvestigation)
  const [perDay, setPerDay] = useState<number>(budget.perDay)
  const [perMonth, setPerMonth] = useState<number>(budget.perMonth)
  return (
    <SectionCard
      title="Budget caps"
      section="budget"
      hint="Token spend ceilings. Hitting a cap halts work and hands off to you."
      buildValue={() => ({ ...budget, perInvestigation, perDay, perMonth })}
    >
      <NumberField label="Per investigation" value={perInvestigation} onChange={setPerInv} />
      <NumberField label="Per day" value={perDay} onChange={setPerDay} />
      <NumberField label="Per month" value={perMonth} onChange={setPerMonth} />
    </SectionCard>
  )
}

function AlertsCard({ alerts }: { alerts: any }) {
  const [budgetWarnRatio, setWarn] = useState<number>(alerts.budgetWarnRatio)
  const [reproFailureRate, setRepro] = useState<number>(alerts.reproFailureRate)
  const [reproFailureMinSample, setSample] = useState<number>(alerts.reproFailureMinSample)
  const [escalationSpike, setSpike] = useState<number>(alerts.escalationSpike)
  return (
    <SectionCard
      title="Alert thresholds"
      section="alerts"
      hint="When to warn you about spend, reproduction failures, or escalation spikes."
      buildValue={() => ({ budgetWarnRatio, reproFailureRate, reproFailureMinSample, escalationSpike })}
    >
      <NumberField label="Budget warn ratio" value={budgetWarnRatio} onChange={setWarn} />
      <NumberField label="Repro failure rate" value={reproFailureRate} onChange={setRepro} />
      <NumberField label="Repro min sample" value={reproFailureMinSample} onChange={setSample} />
      <NumberField label="Escalation spike" value={escalationSpike} onChange={setSpike} />
    </SectionCard>
  )
}

/** A real "Test LLM" check against the saved provider config — green/red + detail. */
function TestLlmRow() {
  const test = useTestLlm()
  const [result, setResult] = useState<LlmTestResult | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <Button
        loading={test.isPending}
        onClick={async () => {
          setResult(null)
          setResult(await test.mutateAsync())
        }}
      >
        Test LLM
      </Button>
      {result?.ok === true && <FormResult tone="success">{result.detail}</FormResult>}
      {result?.ok === false && <FormResult tone="error">{result.detail}</FormResult>}
      <span className="text-xs text-muted">Makes a real completion call against the saved provider + key.</span>
    </div>
  )
}

function ModelsCard({ models }: { models: any }) {
  const [guidance, setGuidance] = useState<string>(models.tiers.guidance.model)
  const [reasoning, setReasoning] = useState<string>(models.tiers.reasoning.model)
  const [vision, setVision] = useState<string>(models.tiers.vision.model)
  return (
    <SectionCard
      title="Models"
      section="models"
      hint="Per-tier models. Choose the provider + key under Connections / Secrets."
      // Keep the current provider as-is — it's selected on the Connections tab.
      buildValue={() => ({
        provider: models.provider,
        tiers: { guidance: { model: guidance }, reasoning: { model: reasoning }, vision: { model: vision } },
      })}
    >
      <Field label="Provider" row>
        <span className="text-sm text-muted">
          <span className="font-mono text-foreground">{models.provider}</span> — change under Connections
        </span>
      </Field>
      <Field label="Guidance model" row>
        <Input className="w-48" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
      </Field>
      <Field label="Reasoning model" row>
        <Input className="w-48" value={reasoning} onChange={(e) => setReasoning(e.target.value)} />
      </Field>
      <Field label="Vision model" row>
        <Input className="w-48" value={vision} onChange={(e) => setVision(e.target.value)} />
      </Field>
      <TestLlmRow />
    </SectionCard>
  )
}
