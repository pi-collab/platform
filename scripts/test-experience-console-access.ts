/**
 * 0529: the Guapd Experiences staff console list, against STAGING with real
 * sessions. Grants TEMPORARY operational access to one real user, restores every
 * staff_access row it touched, and deletes the throwaway Experience it makes.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-experience-console-access.ts
 */

import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!URL.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const cleanup: Array<() => PromiseLike<unknown>> = []

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
const MONEY = /paise|margin|cost|fee|rate|note|net|gross|payout|price|total/i

async function run() {
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id) as any
  const { data: crs } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  const taken = new Set([B.user_id, C.user_id])
  const { data: access } = await admin.from('staff_access').select('user_id, experiences_operational, experiences_financial')
  const withAccess = new Set((access ?? []).map((a) => a.user_id))
  const { data: others } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(80)
  const pool = (others ?? []).filter((u: any) => !taken.has(u.id) && !withAccess.has(u.id))
  const [STAFF, NONE] = pool as any[]
  if (!B || !C || !STAFF || !NONE) throw new Error('need a brand, a creator and two spare users with logins')

  await admin.from('staff_access').insert({ user_id: STAFF.id, experiences_operational: true, experiences_financial: false })
  cleanup.push(() => admin.from('staff_access').delete().eq('user_id', STAFF.id))
  const { data: exp } = await admin.from('experiences').insert({ brand_id: B.brand_id, title: '[console-test] Experience', status: 'requested', request_creator_count: 3, request_deliverables: [{ type: 'UGC video', count: 4 }, { type: 'Story', count: 2 }, { type: 'Reel', count: 'x' }], brand_service_total_paise: 9_900_000 }).select('id').single()
  cleanup.push(() => admin.from('experiences').delete().eq('id', exp!.id))

  const staff = await sessionFor(STAFF.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  console.log('\nstaff with operational access')
  const s = await staff.rpc('experience_console_list')
  const row = (s.data ?? []).find((r: any) => r.id === exp!.id)
  ok('sees the list, including every brand\'s Experiences', !s.error && !!row, s.error?.message ?? '')
  ok('requested videos = creators × videos each (3 × 4 = 12; stories and junk counts not counted)', row?.requested_videos === 12, String(row?.requested_videos))
  ok('brand name comes with the row', typeof row?.brand_name === 'string' && row.brand_name.length > 0)
  const keys = Object.keys(row ?? {})
  ok('no money, cost, rate or note column in the result', !keys.some((k) => MONEY.test(k)), keys.join(', '))

  console.log('\neveryone else is refused BY THE DATABASE')
  for (const [name, c] of [['user with no staff access (outreach-like)', none], ['real brand', brand], ['creator', creator], ['anonymous', anon], ['service role (no caller)', admin]] as const) {
    const r = await (c as SupabaseClient).rpc('experience_console_list')
    ok(`${name}: refused`, !!r.error, r.error?.message ?? `RETURNED ${r.data?.length} rows`)
  }

  console.log('\nrevoking')
  await admin.from('staff_access').update({ experiences_operational: false }).eq('user_id', STAFF.id)
  const after = await staff.rpc('experience_console_list')
  ok('operational turned off → refused at once', !!after.error, after.error?.message ?? 'RETURNED DATA')
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const f of cleanup.reverse()) await f()
  const left = await admin.from('experiences').select('id').like('title', '[console-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
