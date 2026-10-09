'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { STAFF_NOTIFICATION_TYPES } from '@/lib/experience-staff-notifications'

/** Marks the caller's OWN staff alerts read (RLS: own rows; staff types only). */
export async function markStaffNotificationsRead(ids: string[]): Promise<void> {
  const gate = await experienceStaffGate()
  if (!gate.ok || !Array.isArray(ids) || ids.length === 0) return
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)
  const { error } = await createClient().from('notifications').update({ read_at: new Date().toISOString() })
    .in('id', clean).in('type', [...STAFF_NOTIFICATION_TYPES]).is('read_at', null)
  if (error) console.error(`[staff-notifications] mark read failed: ${error.message}`)
  revalidatePath('/experiences-admin/notifications')
}
