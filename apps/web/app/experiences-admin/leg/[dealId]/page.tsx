import { notFound, redirect } from 'next/navigation'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getLegThread } from '@/lib/experience-console-server'
import NoAccess from '../../NoAccess'

export const dynamic = 'force-dynamic'

/** Where a staff alert about one creator deal lands: that deal on its
 *  Experience's Deals tab (0546). The lookup is the gated thread read. */
export default async function LegRedirect({ params }: { params: { dealId: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.dealId)) notFound()
  const t = await getLegThread(params.dealId)
  if (!t.ok) notFound()
  redirect(`/experiences-admin/${t.data.experience_id}?tab=deals&deal=${t.data.deal_id}`)
}
