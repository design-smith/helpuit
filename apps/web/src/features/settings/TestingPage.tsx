import { useState } from 'react'
import { useSetChatwootToken } from '../../lib/api'
import { Button, CodeBlock, Field, FormResult, Input, PageHeader, Section } from '../../components/ui'

const WIDGET_SNIPPET = `// After your app verifies the customer and mints their Helpuit token:
window.$chatwoot?.setCustomAttributes({ helpuit_auth_token: helpuitToken })`

/**
 * Manual hand-off of a verified customer token onto a Chatwoot conversation (FCW-20)
 * — a testing aid. In production the browser-widget snippet stamps the token
 * automatically; this card is for verifying the L2 path on a single conversation.
 */
function CustomerTokenHandoff() {
  const setToken = useSetChatwootToken()
  const [conversationId, setConversationId] = useState<string>('')
  const [authToken, setAuthToken] = useState<string>('')
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)

  return (
    <Section
      title="Customer token hand-off"
      hint={
        <>
          L2 account investigation needs the customer's <em>verified</em> token on the conversation. Set it here to test
          one conversation (uses the configured Chatwoot creds); in production the widget snippet below does this
          automatically.
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Conversation ID" row>
          <Input className="w-32 text-right" type="number" value={conversationId} onChange={(e) => setConversationId(e.target.value)} />
        </Field>
        <Field label="Verified token" row>
          <Input className="w-56" type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={authToken === '' || !Number.isInteger(Number(conversationId))}
            loading={setToken.isPending}
            onClick={async () => setResult(await setToken.mutateAsync({ conversationId: Number(conversationId), authToken }))}
          >
            Set token
          </Button>
          {result?.ok === true && <FormResult tone="success">{result.detail}</FormResult>}
          {result?.ok === false && <FormResult tone="error">{result.detail}</FormResult>}
        </div>
        <div className="border-t-2 border-border pt-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Production: set it from the browser widget</p>
          <CodeBlock>{WIDGET_SNIPPET}</CodeBlock>
        </div>
      </div>
    </Section>
  )
}

/** Settings → Testing: manual/diagnostic tools for verifying the pipeline before real traffic. */
export function TestingPage() {
  return (
    <div>
      <PageHeader title="Testing" subtitle="Manual tools to verify the pipeline before (or alongside) real traffic." />
      <CustomerTokenHandoff />
    </div>
  )
}
