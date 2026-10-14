/**
 * 0528: quote history and request fields, against STAGING with real logins.
 * Builds a throwaway Experience for a real brand, deletes it at the end.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-experience-quotes-rls.ts
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

async function run() {
  const { data: bms } = await admin.from('brand_members').select('brand_id, users(auth_id), brands(is_guapd)').limit(60)
  const withLogin = (bms ?? []).filter((m: any) => m.users?.auth_id && !m.brands?.is_guapd)
  const A = withLogin[0] as any, B = withLogin.find((m: any) => m.brand_id !== A.brand_id) as any
  const { data: crs } = await admin.from('creators').select('id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  if (!A || !B || !C) throw new Error('need two brands and a creator with logins')
  const brandA = await sessionFor(A.users.auth_id), brandB = await sessionFor(B.users.auth_id), creator = await sessionFor(C.users.auth_id)

  const { data: exp, error: ee } = await admin.from('experiences').insert({
    brand_id: A.brand_id, title: '[quotes-test] Experience', status: 'requested',
    request_deliverables: [{ type: 'ugc_video', count: 20 }], request_location: 'Mumbai',
    request_date_from: '2026-11-10', request_date_to: '2026-11-12', request_channel: 'whatsapp', requested_at: new Date().toISOString(),
  }).select('id').single()
  if (ee || !exp) throw new Error('experience: ' + ee?.message)
  cleanup.push(() => admin.from('experiences').delete().eq('id', exp.id))

  console.log('\nrequest fields')
  const bad1 = await admin.from('experiences').update({ request_date_to: '2026-11-01' }).eq('id', exp.id)
  ok('date range ending before it starts is refused', !!bad1.error, bad1.error?.message ?? 'ACCEPTED')
  const bad2 = await admin.from('experiences').update({ request_boost_months: 3 }).eq('id', exp.id)
  ok('boost months without boost is refused', !!bad2.error, bad2.error?.message ?? 'ACCEPTED')
  const bad3 = await admin.from('experiences').update({ request_channel: 'telegram' }).eq('id', exp.id)
  ok('unknown request channel is refused', !!bad3.error, bad3.error?.message ?? 'ACCEPTED')
  // 0544: brands read only through brand_experience(); the table itself is closed to them.
  const ownReq = await brandA.rpc('brand_experience', { p_experience_id: exp.id })
  ok('brand reads its own request back (through brand_experience)', (ownReq.data as any)?.request?.location === 'Mumbai', ownReq.error?.message ?? '')
  ok('…and not from the table directly (0544)', !!(await brandA.from('experiences').select('id').eq('id', exp.id)).error)
  const otherReq = await brandB.rpc('brand_experience', { p_experience_id: exp.id })
  ok('another brand cannot read it', !!otherReq.error && !(await brandB.from('experiences').select('id').eq('id', exp.id)).data?.length, otherReq.error?.message ?? 'READ')

  console.log('\nquotes')
  const q1 = await admin.from('experience_quotes').insert({ experience_id: exp.id, version: 1, proposed_by: 'guapd', per_video_paise: 350000, deliverable_count: 20, misc_paise: 500000, total_paise: 7500000, message: 'First quote' }).select('id').single()
  ok('a correct quote is accepted (20 × ₹3,500 + ₹5,000 = ₹75,000)', !q1.error, q1.error?.message ?? '')
  const badTotal = await admin.from('experience_quotes').insert({ experience_id: exp.id, version: 2, proposed_by: 'brand', per_video_paise: 300000, deliverable_count: 20, misc_paise: 0, total_paise: 5000000, status: 'superseded' })
  ok('a total that does not equal per video × count + misc is refused', !!badTotal.error, badTotal.error?.message ?? 'ACCEPTED')
  const twoOpen = await admin.from('experience_quotes').insert({ experience_id: exp.id, version: 2, proposed_by: 'brand', per_video_paise: 300000, deliverable_count: 20, misc_paise: 0, total_paise: 6000000 })
  ok('a second OPEN quote is refused (supersede the first)', !!twoOpen.error, twoOpen.error?.message ?? 'ACCEPTED')
  const dupVersion = await admin.from('experience_quotes').insert({ experience_id: exp.id, version: 1, proposed_by: 'brand', per_video_paise: 0, deliverable_count: 0, misc_paise: 0, total_paise: 0, status: 'rejected' })
  ok('a repeated version number is refused', !!dupVersion.error, dupVersion.error?.message ?? 'ACCEPTED')

  const aRead = await brandA.rpc('brand_experience', { p_experience_id: exp.id })
  const aq = (aRead.data as any)?.quote
  ok('brand reads its own quote (through brand_experience)', Number(aq?.total_paise) === 7500000 && aq?.status === 'open', aRead.error?.message ?? JSON.stringify(aq))
  ok('…without who at Guapd wrote it', aq && !('created_by' in aq) && !JSON.stringify(aRead.data).includes('created_by'))
  const aHidden = await brandA.from('experience_quotes').select('id, total_paise').eq('experience_id', exp.id)
  ok('brand cannot read the quotes table directly (0544)', !!aHidden.error, aHidden.error?.message ?? 'READABLE')
  const bRead = await brandB.from('experience_quotes').select('id').eq('experience_id', exp.id)
  ok('another brand reads none', !!bRead.error || (bRead.data ?? []).length === 0, `${bRead.data?.length}`)
  const cRead = await creator.from('experience_quotes').select('id').eq('experience_id', exp.id)
  ok('a creator reads none', !!cRead.error || (cRead.data ?? []).length === 0, `${cRead.data?.length}`)
  const aWrite = await brandA.from('experience_quotes').insert({ experience_id: exp.id, version: 3, proposed_by: 'brand', per_video_paise: 1, deliverable_count: 1, misc_paise: 0, total_paise: 1, status: 'rejected' })
  ok('brand cannot write a quote from its session (server only)', !!aWrite.error, aWrite.error?.message ?? 'WRITE ALLOWED')
  const aUpd = await brandA.from('experience_quotes').update({ status: 'accepted' }).eq('experience_id', exp.id).select('id')
  const after = await admin.from('experience_quotes').select('status').eq('experience_id', exp.id).single()
  ok('brand cannot accept a quote from its session', after.data?.status === 'open', aUpd.error?.message ?? `status now ${after.data?.status}`)

  console.log('\ncreator-visible brand name')
  const { data: nonLeg } = await admin.from('deals').select('id').is('leg_role', null).limit(1).single()
  const badName = await admin.from('deals').update({ experience_brand_name: 'Kiro' }).eq('id', nonLeg!.id)
  ok('experience_brand_name refused on a deal that is not a creator leg', !!badName.error, badName.error?.message ?? 'ACCEPTED')
  if (!badName.error) await admin.from('deals').update({ experience_brand_name: null }).eq('id', nonLeg!.id) // undo a leaked write
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const f of cleanup.reverse()) await f()
  const left = await admin.from('experiences').select('id').like('title', '[quotes-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
