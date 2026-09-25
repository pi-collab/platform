import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import BroadcastClient from './BroadcastClient'

export const metadata = { title: 'Broadcast | Guapd Ops', robots: { index: false, follow: false } }

export default async function BroadcastPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/ops')

  return (
    <main style={{ padding: '2rem', maxWidth: 860 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>WhatsApp broadcast</h1>
      <p style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.6, margin: '0.5rem 0 1.5rem' }}>
        Sends an approved MSG91 template from this server, which already holds the key &mdash;
        nothing is copied to a laptop. Preview first: it resolves exactly who would be
        messaged, and who would not. Anyone who already received this campaign is skipped,
        so re-running after a partial failure is safe.
      </p>
      <BroadcastClient />
    </main>
  )
}
