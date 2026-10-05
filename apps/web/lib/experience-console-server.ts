import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Reads for the Guapd Experiences STAFF console. Each goes through a database
 * function called with the signed-in user's own session, and the function
 * checks their staff_access in Postgres. A brand, creator, outreach user or the
 * service role is refused by the database, whatever the page did.
 */
export interface ConsoleExperienceRow {
  id: string
  title: string
  status: string
  brand_name: string
  shoot_date: string | null
  shoot_city: string | null
  request_location: string | null
  request_date_from: string | null
  request_date_to: string | null
  requested_videos: number
  created_at: string
}

export async function listConsoleExperiences(): Promise<{ ok: true; rows: ConsoleExperienceRow[] } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc('experience_console_list')
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data ?? []) as ConsoleExperienceRow[] }
}
