import { redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { isEmailConfigured } from '@/lib/email'
import OutreachClient from './OutreachClient'
import { BEAUTY_CREATOR_CAMPAIGN, BEAUTY_CREATOR_LIST } from './campaigns'

/* 60s, because a send is a loop of one request per recipient with a deliberate
   pause between them. At the default 10s a run of 35 would be cut off partway,
   leaving half a list mailed and no record of where it stopped. */
export const maxDuration = 60

export const metadata = { title: 'Outreach · Ops', robots: { index: false, follow: false } }

export default async function OutreachPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/ops')

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Outreach</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem', maxWidth: 620 }}>
        Sends from this server, which already holds the Resend key — nothing is copied to a laptop.
        One email per recipient, never a shared <code>to</code> list. Every send is written to{' '}
        <code>ops_events</code>, and each recipient to <code>events</code>.
      </p>

      {!isEmailConfigured() && (
        <p style={{ background: '#fef2f2', color: '#9B3030', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Email is not configured in this environment. On production this is set; locally you would need
          EMAIL_ENABLED, RESEND_API_KEY and EMAIL_FROM. Sending is refused until then.
        </p>
      )}

      <OutreachClient
        opsEmail={user.email ?? ''}
        campaign={BEAUTY_CREATOR_CAMPAIGN}
        defaultList={BEAUTY_CREATOR_LIST}
      />
    </div>
  )
}
