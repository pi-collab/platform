/**
 * 0530: request intake + quote negotiation in the staff console, against
 * STAGING with real sessions. Grants TEMPORARY operational access to one real
 * user and removes it; deletes every Experience it creates and the ops_events
 * rows those test Experiences produced.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-experience-console-quotes.ts
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
const group = (g: string) => console.log(`\n${g}`)
const made: string[] = []
let staffUserId = ''

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
const refused = (r: { error: { message: string } | null }) => !!r.error
// The plan: 10 creators, each making 2 UGC videos + 1 Story; affiliate on 1 of
// each creator's 2 videos; ad rights on all of them for 3 months.
const req = (brandId: string, over: Record<string, unknown> = {}) => ({
  p_brand_id: brandId, p_title: '[console-quotes-test] Kiro day shoot', p_creator_count: 10,
  p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }],
  p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: null, p_ad_rights_months: 3,
  p_boost: false, p_boost_per_creator: null, p_boost_months: null,
  p_location: 'Mumbai', p_date_from: '2026-11-10', p_date_to: '2026-11-12', p_brief: 'Glow serum', p_channel: 'whatsapp', ...over,
})
const quote = (expId: string, over: Record<string, unknown> = {}) => ({
  p_experience_id: expId, p_proposed_by: 'guapd', p_per_video_paise: 350000, p_deliverable_count: 20, p_misc_paise: 500000,
  p_deliverables: [{ type: 'UGC video', count: 20 }], p_shoot_date: '2026-11-11', p_shoot_city: 'Mumbai', p_message: 'Our quote', p_channel: null, ...over,
})
const audit = async (targetId: string, action: string) =>
  (await admin.from('ops_events').select('action, actor_email, detail').eq('target_id', targetId).eq('action', action)).data ?? []

async function run() {
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: crs } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B.user_id, C.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(80)
  const [STAFF, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  const { data: house } = await admin.from('brands').select('id').eq('is_guapd', true).single()
  if (!B || !C || !STAFF || !NONE || !house) throw new Error('missing test actors')

  await admin.from('staff_access').insert({ user_id: STAFF.id, experiences_operational: true })
  staffUserId = STAFF.id
  const staff = await sessionFor(STAFF.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  group('who may record a request')
  for (const [n, c] of [['no access (outreach-like)', none], ['real brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: create refused`, refused(await (c as SupabaseClient).rpc('experience_console_create', req(B.brand_id))))
  }
  ok('the Guapd house brand cannot be the brand', refused(await staff.rpc('experience_console_create', req(house.id))))
  ok('a request without a channel is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_channel: null }))))
  ok('a request with no deliverables is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_deliverables: [] }))))
  ok('a request with no creator count is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_creator_count: null }))))
  ok('a zero creator count is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_creator_count: 0 }))))
  ok('affiliate without a per-creator count is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_affiliate_per_creator: null }))))
  ok('affiliate on more videos than each creator makes (3 of 2) is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_affiliate_per_creator: 3 }))))
  ok('ad rights on more videos than each creator makes is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_ad_rights_per_creator: 5 }))))
  ok('boost on more videos than each creator makes is refused', refused(await staff.rpc('experience_console_create', req(B.brand_id, { p_boost: true, p_boost_per_creator: 3, p_boost_months: 1 }))))
  const brands = await staff.rpc('experience_console_brands')
  ok('the brand picker never lists the house brand', !brands.error && !(brands.data ?? []).some((b: any) => b.id === house.id))
  ok('the brand picker is refused to a brand', refused(await brand.rpc('experience_console_brands')))

  const c1 = await staff.rpc('experience_console_create', req(B.brand_id))
  ok('staff record the request', !c1.error && !!c1.data, c1.error?.message ?? '')
  const E = c1.data as string; made.push(E)
  const g1 = await staff.rpc('experience_console_get', { p_experience_id: E })
  ok('it starts as Request in (requested)', g1.data?.status === 'requested', g1.data?.status)
  ok('plan stored: 10 creators, 2 UGC video + 1 Story each', g1.data?.request_creator_count === 10 && g1.data?.request_deliverables?.length === 2)
  const tot = Object.fromEntries((g1.data?.plan_totals ?? []).map((t: any) => [t.type, t.total]))
  ok('totals computed by the database: 20 UGC videos, 10 Stories', tot['UGC video'] === 20 && tot['Story'] === 10, JSON.stringify(g1.data?.plan_totals))
  ok('videos priced per video: 2 each, 20 in total (stories not counted)', g1.data?.plan_videos_per_creator === 2 && g1.data?.plan_videos_total === 20)
  ok('rights per creator: affiliate on 1, ad rights on all (null) for 3 months', g1.data?.request_affiliate_per_creator === 1 && g1.data?.request_ad_rights_per_creator === null && g1.data?.request_ad_rights_months === 3)
  ok('other request fields stored (Mumbai, WhatsApp)', g1.data?.request_location === 'Mumbai' && g1.data?.request_channel === 'whatsapp')
  const lst = ((await staff.rpc('experience_console_list')).data ?? []).find((r: any) => r.id === E)
  ok('the list shows 20 videos for it', lst?.requested_videos === 20, String(lst?.requested_videos))
  const a1 = await audit(E, 'experience.request_recorded')
  ok('audit: who and which channel', a1.length === 1 && (a1[0].detail as any).channel === 'whatsapp' && !!a1[0].actor_email)
  const keys = Object.keys(g1.data ?? {})
  ok('the Experience read carries no creator rate, cost, payout, margin or note', !keys.some((k) => /margin|cost|payout|creator_(gross|net)|day_rate|platform_(fee|pct)|note|_net_|gross/i.test(k)), keys.filter((k) => /paise/.test(k)).join(', '))
  for (const [n, c] of [['real brand', brand], ['creator', creator], ['no access', none], ['service role', admin]] as const) {
    ok(`${n}: reading it is refused`, refused(await (c as SupabaseClient).rpc('experience_console_get', { p_experience_id: E })) && refused(await (c as SupabaseClient).rpc('experience_console_quotes', { p_experience_id: E })))
  }

  group('quotes')
  ok('a zero price is refused', refused(await staff.rpc('experience_console_quote', quote(E, { p_per_video_paise: 0 }))))
  ok('a zero count is refused', refused(await staff.rpc('experience_console_quote', quote(E, { p_deliverable_count: 0 }))))
  ok('a brand counter needs a channel', refused(await staff.rpc('experience_console_quote', quote(E, { p_proposed_by: 'brand', p_channel: null }))))
  ok('a brand cannot quote', refused(await brand.rpc('experience_console_quote', quote(E))))
  const q1 = await staff.rpc('experience_console_quote', quote(E))
  ok('Guapd sends v1', !q1.error, q1.error?.message ?? '')
  let qs = (await staff.rpc('experience_console_quotes', { p_experience_id: E })).data as any[]
  ok('total computed by the database: 20 × ₹3,500 + ₹5,000 = ₹75,000', qs[0]?.total_paise === 7500000 && qs[0]?.status === 'open', String(qs[0]?.total_paise))
  ok('a quote may go out before the date and city are known (v2)', !refused(await staff.rpc('experience_console_quote', quote(E, { p_shoot_date: null, p_shoot_city: null }))))
  qs = (await staff.rpc('experience_console_quotes', { p_experience_id: E })).data as any[]
  const noDate = qs.find((q) => q.status === 'open')
  ok('…and the v2 with no date/city cannot be accepted', refused(await staff.rpc('experience_console_accept', { p_quote_id: noDate.id, p_channel: 'email' })))
  ok('v1 was replaced when v2 came in', qs.find((q) => q.version === 1)?.status === 'superseded')

  const counter = await staff.rpc('experience_console_quote', quote(E, { p_proposed_by: 'brand', p_per_video_paise: 300000, p_misc_paise: 0, p_channel: 'call', p_message: 'Can you do 3,000?' }))
  ok('staff record the brand counter (via call)', !counter.error, counter.error?.message ?? '')
  qs = (await staff.rpc('experience_console_quotes', { p_experience_id: E })).data as any[]
  const open = qs.filter((q) => q.status === 'open')
  ok('the counter replaced the prior quote; exactly one open', open.length === 1 && open[0].proposed_by === 'brand' && qs.find((q) => q.version === 2)?.status === 'superseded')
  ok('counter total ₹60,000', open[0].total_paise === 6000000)
  const a2 = await audit(open[0].id, 'experience.brand_counter_recorded')
  ok('audit: counter recorded with channel and the quote it replaced', a2.length === 1 && (a2[0].detail as any).channel === 'call' && !!(a2[0].detail as any).replaced_quote_id)
  ok('a replaced quote cannot be accepted', refused(await staff.rpc('experience_console_accept', { p_quote_id: qs.find((q) => q.version === 1).id, p_channel: 'email' })))
  ok('a brand cannot accept', refused(await brand.rpc('experience_console_accept', { p_quote_id: open[0].id, p_channel: null })))

  group('accept locks the agreed terms; status moves forward one step only')
  const acc = await staff.rpc('experience_console_accept', { p_quote_id: open[0].id, p_channel: null })
  ok('Guapd accepts the brand counter', !acc.error, acc.error?.message ?? '')
  const g2 = (await staff.rpc('experience_console_get', { p_experience_id: E })).data
  ok('agreed price locked: 20 × ₹3,000 = ₹60,000', g2.brand_service_total_paise === 6000000 && g2.brand_per_video_paise === 300000 && g2.brand_deliverable_count === 20 && g2.brand_misc_paise === 0)
  ok('shoot date and city locked', g2.shoot_date === '2026-11-11' && g2.shoot_city === 'Mumbai')
  const ap = g2.agreed_plan
  const apTot = Object.fromEntries((ap?.totals ?? []).map((t: any) => [t.type, t.total]))
  ok('the plan is locked with it: 10 creators, 20 UGC videos, 10 Stories', ap?.creator_count === 10 && apTot['UGC video'] === 20 && apTot['Story'] === 10)
  ok('locked plan records videos sold (20) against the plan (20)', ap?.videos_sold === 20 && ap?.plan_videos === 20)
  ok('status moved exactly one step: requested → rostering', g2.status === 'rostering', g2.status)
  ok('quotes are closed once agreed', refused(await staff.rpc('experience_console_quote', quote(E))))
  ok('a second accept is refused', refused(await staff.rpc('experience_console_accept', { p_quote_id: open[0].id, p_channel: null })))
  const a3 = await audit(E, 'experience.quote_accepted')
  ok('audit: accept with before/after status and the total', a3.length === 1 && (a3[0].detail as any).status_before === 'requested' && (a3[0].detail as any).status_after === 'rostering' && (a3[0].detail as any).total_paise === 6000000)

  group('a Guapd quote accepted by the brand needs the channel')
  const c2 = await staff.rpc('experience_console_create', req(B.brand_id)); made.push(c2.data as string)
  await staff.rpc('experience_console_quote', quote(c2.data as string, { p_deliverable_count: 18, p_misc_paise: 0 }))
  const q = ((await staff.rpc('experience_console_quotes', { p_experience_id: c2.data })).data as any[])[0]
  ok('without the channel: refused', refused(await staff.rpc('experience_console_accept', { p_quote_id: q.id, p_channel: null })))
  const ok2 = await staff.rpc('experience_console_accept', { p_quote_id: q.id, p_channel: 'email' })
  const g3 = (await staff.rpc('experience_console_get', { p_experience_id: c2.data })).data
  ok('with it: accepted, 18 × ₹3,500 = ₹63,000 locked, rostering', !ok2.error && g3.brand_service_total_paise === 6300000 && g3.status === 'rostering')
  ok('a negotiated count is the contract: sold 18 against a plan of 20, both recorded', g3.agreed_plan?.videos_sold === 18 && g3.agreed_plan?.plan_videos === 20)

  group('revoking')
  await admin.from('staff_access').update({ experiences_operational: false }).eq('user_id', STAFF.id)
  ok('operational off → every console function refused at once', refused(await staff.rpc('experience_console_get', { p_experience_id: E })) && refused(await staff.rpc('experience_console_create', req(B.brand_id))))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const id of made) {
    const { data: qids } = await admin.from('experience_quotes').select('id').eq('experience_id', id)
    await admin.from('ops_events').delete().in('target_id', [id, ...(qids ?? []).map((x) => x.id)])
    await admin.from('experiences').delete().eq('id', id)
  }
  if (staffUserId) await admin.from('staff_access').delete().eq('user_id', staffUserId)
  const left = await admin.from('experiences').select('id').like('title', '[console-quotes-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
