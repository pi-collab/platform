'use client'

import { useMemo, useState, useTransition } from 'react'
import { sendOutreach, previewOutreach, type OutreachRecipient, type OutreachResult } from './actions'
import type { CampaignCopy } from './campaigns'

/**
 * Compose, preview, test, send.
 *
 * ── The test send is not optional politeness ────────────────────────────────
 * It goes to the signed-in ops user and nobody else, and it is the only way to
 * see the thing the way a recipient will: in a real client, with a real
 * subject line, with whatever the mail client does to the HTML. A preview pane
 * is a browser rendering it, which is not the same test.
 *
 * ── Why the list is a textarea and not a file upload ────────────────────────
 * These lists arrive pasted out of a sheet or a chat. A parser that accepts
 * "email, Name" per line handles that directly, and shows its own reading of
 * the list back before anything is sent — which is where a missing @ or a
 * duplicated row gets noticed.
 */
export default function OutreachClient({
  opsEmail, campaign, defaultList,
}: {
  opsEmail: string
  campaign: CampaignCopy
  defaultList: string
}) {
  const [subject, setSubject] = useState(campaign.subject)
  const [raw, setRaw] = useState(defaultList)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [results, setResults] = useState<OutreachResult[] | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const parsed = useMemo(() => parseList(raw), [raw])

  function input(recipients: OutreachRecipient[]) {
    return {
      campaignId: campaign.id,
      subject,
      heading: campaign.heading,
      intro: campaign.intro,
      bullets: campaign.bullets,
      ctaUrl: campaign.ctaUrl,
      ctaLabel: campaign.ctaLabel,
      signoff: campaign.signoff,
      recipients,
    }
  }

  function showPreview() {
    setMsg(null)
    startTransition(async () => {
      const { html } = await previewOutreach(input(parsed.valid.slice(0, 1)))
      setPreview(html)
    })
  }

  function sendTest() {
    setMsg(null); setResults(null)
    startTransition(async () => {
      // Named as the ops user, so the greeting path is exercised too.
      const res = await sendOutreach(input([{ email: opsEmail, name: firstNameOf(opsEmail) }]))
      setMsg({ ok: res.ok, text: res.ok ? `Test sent to ${opsEmail}.` : res.message ?? 'Failed.' })
      setResults(res.results ?? null)
    })
  }

  function sendAll() {
    if (!confirm(`Send to ${parsed.valid.length} recipients? This cannot be recalled.`)) return
    setMsg(null); setResults(null)
    startTransition(async () => {
      const res = await sendOutreach(input(parsed.valid))
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? 'Sent.' : 'Failed.') })
      setResults(res.results ?? null)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 820 }}>
      <Field label="Subject">
        <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>

      <Field
        label={`Recipients · ${parsed.valid.length} valid${parsed.invalid.length ? `, ${parsed.invalid.length} unusable` : ''}${parsed.duplicates ? `, ${parsed.duplicates} duplicate` : ''}`}
        hint='One per line: "email, Name". Leave the name off for a bare "Hey,".'
      >
        <textarea
          style={{ ...inputStyle, minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </Field>

      {parsed.invalid.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#92400e' }}>
          Skipped as unusable: {parsed.invalid.join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={showPreview} disabled={pending} style={btnQuiet}>Preview</button>
        <button type="button" onClick={sendTest} disabled={pending || !opsEmail} style={btnQuiet}>
          Send test to {opsEmail || 'me'}
        </button>
        <button type="button" onClick={sendAll} disabled={pending || parsed.valid.length === 0} style={btnPrimary}>
          {pending ? 'Working…' : `Send to ${parsed.valid.length}`}
        </button>
      </div>

      {msg && (
        <div style={{
          borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem',
          background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#166534' : '#9B3030',
          border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {msg.text}
        </div>
      )}

      {results && results.some((r) => !r.ok) && (
        <div style={{ fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', color: '#9B3030' }}>
          {results.filter((r) => !r.ok).map((r) => <div key={r.email}>{r.email}: {r.detail}</div>)}
        </div>
      )}

      {preview && (
        <div>
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 6 }}>
            Preview, rendered with the first recipient&rsquo;s name. A browser is not a mail client; send
            the test before you send the list.
          </div>
          {/* Sandboxed: this is our own HTML, but a preview pane that can run
              script is a habit worth not forming. */}
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview}
            style={{ width: '100%', height: 640, border: '1px solid #e5e5e5', borderRadius: 12, background: '#fff' }}
          />
        </div>
      )}
    </div>
  )
}

/** "email, Name" per line. Blank lines and a leading "#" are ignored. */
function parseList(raw: string): { valid: OutreachRecipient[]; invalid: string[]; duplicates: number } {
  const valid: OutreachRecipient[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicates = 0

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const [emailPart, ...nameParts] = trimmed.split(',')
    const email = emailPart.trim().toLowerCase()
    const name = nameParts.join(',').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { invalid.push(trimmed); continue }
    if (seen.has(email)) { duplicates++; continue }

    seen.add(email)
    valid.push({ email, name })
  }

  return { valid, invalid, duplicates }
}

/** Only used to address the TEST send, never a recipient. */
function firstNameOf(email: string): string {
  const local = email.split('@')[0] ?? ''
  const first = local.split(/[._-]/)[0] ?? ''
  return /^[a-z]+$/i.test(first) ? first.charAt(0).toUpperCase() + first.slice(1) : ''
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e5e5e5',
  borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  padding: '0.55rem 1.1rem', borderRadius: 999, border: 'none', cursor: 'pointer',
  background: '#111', color: '#fff', fontSize: '0.8125rem', fontWeight: 700,
}

const btnQuiet: React.CSSProperties = {
  padding: '0.55rem 1.1rem', borderRadius: 999, border: '1px solid #e5e5e5', cursor: 'pointer',
  background: '#fff', color: '#111', fontSize: '0.8125rem', fontWeight: 700,
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#444', marginBottom: 4 }}>{label}</span>
      {hint && <span style={{ display: 'block', fontSize: '0.6875rem', color: '#888', marginBottom: 6 }}>{hint}</span>}
      {children}
    </label>
  )
}
