import { describe, it, expect } from 'vitest'
import { buildAppManifest, convertManifest } from './app-connect.js'

describe('buildAppManifest', () => {
  it('points the app at this deployment (callback, webhook) with issue permissions', () => {
    const m = buildAppManifest({ publicUrl: 'https://helpuit.example.com', name: 'Helpuit' }) as Record<string, any>
    expect(m.name).toBe('Helpuit')
    expect(m.url).toBe('https://helpuit.example.com')
    expect(m.redirect_url).toBe('https://helpuit.example.com/admin/connect/github/callback')
    expect(m.hook_attributes.url).toBe('https://helpuit.example.com/webhooks/github')
    expect(m.public).toBe(false)
    expect(m.default_permissions.issues).toBe('write')
    expect(m.default_permissions.contents).toBe('read')
    expect(m.default_events).toContain('issues')
  })

  it('strips a trailing slash from the public URL', () => {
    const m = buildAppManifest({ publicUrl: 'https://h.example.com/', name: 'H' }) as Record<string, any>
    expect(m.redirect_url).toBe('https://h.example.com/admin/connect/github/callback')
  })
})

describe('convertManifest', () => {
  it('exchanges the temporary code for the generated app credentials', async () => {
    let calledPath = ''
    const fetchImpl = async (url: string, init?: { method?: string }) => {
      calledPath = url
      expect(init?.method).toBe('POST')
      return {
        ok: true,
        json: async () => ({
          id: 99,
          slug: 'helpuit-acme',
          html_url: 'https://github.com/apps/helpuit-acme',
          pem: '-----BEGIN RSA PRIVATE KEY-----\nKEY\n-----END RSA PRIVATE KEY-----',
          webhook_secret: 'whsec',
          client_id: 'Iv1.abc',
          client_secret: 'csec',
        }),
      }
    }
    const creds = await convertManifest('code-123', { fetchImpl: fetchImpl as never })
    expect(calledPath).toContain('/app-manifests/code-123/conversions')
    expect(creds).toEqual({
      appId: '99',
      slug: 'helpuit-acme',
      htmlUrl: 'https://github.com/apps/helpuit-acme',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nKEY\n-----END RSA PRIVATE KEY-----',
      webhookSecret: 'whsec',
      clientId: 'Iv1.abc',
      clientSecret: 'csec',
    })
  })

  it('throws a clear error when the exchange fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 422, text: async () => 'bad code' })
    await expect(convertManifest('x', { fetchImpl: fetchImpl as never })).rejects.toThrow(/422/)
  })
})
