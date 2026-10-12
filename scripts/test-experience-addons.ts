/**
 * 0554: add-ons to the agreed brand price, against STAGING with real sessions.
 * Grants TEMPORARY access to two real users (finance, operational) and removes
 * it; deletes every Experience it creates, its add-ons and its ops_events rows.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-addons.ts
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
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
// The plan: 10 creators, each making 2 UGC videos + 1 Story; affiliate on 1 of
// each creator's 2 videos; ad rights on all of them for 3 months.
const req = (brandId: string, over: Record<string, unknown> = {}) => ({
  p_brand_id: brandId, p_title: '[addons-test] Kiro day shoot', p_creator_count: 10,
  p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }],
  p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: 2, p_ad_rights_months: 3,
  p_boost: false, p_boost_per_creator: null, p_boost_months: null,
  p_location: 'Mumbai', p_date_from: '2026-11-10', p_date_to: '2026-11-12', p_brief: 'Glow serum', p_channel: 'whatsapp', ...over,
})
const quote = (expId: string, over: Record<string, unknown> = {}) => ({
  p_experience_id: expId, p_proposed_by: 'guapd', p_per_video_paise: 350000, p_deliverable_count: 20, p_misc_paise: 500000,
  p_deliverables: [{ type: 'UGC video', count: 20 }], p_shoot_date: '2026-11-11', p_shoot_city: 'Mumbai', p_message: 'Our quote', p_channel: null, ...over,
})
const audit = async (targetId: string, action: string) =>
  (await admin.from('ops_events').select('action, actor_email, detail').eq('target_id', targetId).eq('action', action)).data ?? []

let opUserId = ''

async function run() {
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status)').limit(200)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const BA = members.find((m) => m.is_admin && m.brands.brand_status === 'approved')
  const BB = members.find((m) => m.brand_id !== BA?.brand_id)
  const { data: crs } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([BA?.user_id, BB?.user_id, C?.user_id, ...(access ?? []).map((a) => a.user_id)])
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) }
  { const { data: mu } = await admin.from('brand_members').select('user_id'); for (const x of mu ?? []) busy.add((x as any).user_id) }
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [FIN, OP] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!BA || !BB || !C || !FIN || !OP) throw new Error('missing test actors')
  await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }, { user_id: OP.id, experiences_operational: true, experiences_financial: false }])
  staffUserId = FIN.id; opUserId = OP.id
  const fin = await sessionFor(FIN.auth_id), op = await sessionFor(OP.auth_id)
  const brand = await sessionFor(BA.users.auth_id), other = await sessionFor(BB.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  // An Experience with an agreed price: 20 × ₹3,500 + ₹5,000 = ₹75,000, 20 videos sold.
  const c1 = await fin.rpc('experience_console_create', req(BA.brand_id)); made.push(c1.data as string)
  const E = c1.data as string
  const q = await fin.rpc('experience_console_quote', quote(E))
  const pending = await fin.rpc('experience_console_create', req(BA.brand_id)); made.push(pending.data as string)
  const add1 = { p_experience_id: E, p_deliverables: [{ type: 'UGC video', count: 10 }], p_per_video_paise: 350000, p_extras: [{ label: 'Express edit', amount_paise: 500000 }], p_message: 'The brand loved the shoot', p_expected_total_paise: 4000000 }

  group('only once the price is agreed')
  ok('before agreement: refused', said(await fin.rpc('experience_console_addon_send', { ...add1, p_experience_id: pending.data }), /price is agreed/))
  ok('the quote is accepted', !refused(await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })))
  const g0 = (await fin.rpc('experience_console_get', { p_experience_id: E })).data as any
  ok('agreed: ₹75,000 for 20 videos', g0.brand_service_total_paise === 7500000 && g0.agreed_plan?.videos_sold === 20, JSON.stringify({ t: g0.brand_service_total_paise, s: g0.agreed_plan?.videos_sold }))

  group('who may send one: finance only')
  for (const [n, s] of [['operational staff', op], ['the brand', brand], ['a creator', creator], ['anonymous', anon]] as const)
    ok(`${n}: refused`, refused(await (s as SupabaseClient).rpc('experience_console_addon_send', add1)))

  group('what an add-on may hold')
  for (const [n, o, re] of [
    ['an unknown type', { p_deliverables: [{ type: 'Podcast', count: 2 }], p_expected_total_paise: 500000 }, /type and a count/],
    ['a zero count', { p_deliverables: [{ type: 'UGC video', count: 0 }] }, /type and a count/],
    ['the same type twice', { p_deliverables: [{ type: 'UGC video', count: 5 }, { type: 'UGC video', count: 5 }] }, /type and a count/],
    ['an unknown field', { p_deliverables: [{ type: 'UGC video', count: 10, price: 1 }] }, /type and a count/],
    ['videos with no price', { p_per_video_paise: 0 }, /Price per video/],
    ['NULL price for videos', { p_per_video_paise: null }, /Price per video/],
    ['nothing at all', { p_deliverables: [], p_extras: [], p_expected_total_paise: 0 }, /Add deliverables or an extra/],
    ['a stale total on the screen', { p_expected_total_paise: 3999999 }, /total has changed/],
    ['NULL total', { p_expected_total_paise: null }, /total has changed/],
    ['a bad extra line', { p_extras: [{ label: 'x', amount_paise: 100 }] }, /description/],
  ] as const) ok(`${n}: refused`, said(await fin.rpc('experience_console_addon_send', { ...add1, ...o }), re as RegExp))

  group('send, revise, and what each side sees')
  const s1 = await fin.rpc('experience_console_addon_send', add1)
  ok('finance sends add-on #1: +10 UGC videos × ₹3,500 + Express edit ₹5,000 = ₹40,000', !s1.error, s1.error?.message ?? '')
  let list = ((await fin.rpc('experience_console_addons', { p_experience_id: E })).data as any).addons as any[]
  ok('the database computed it: 10 videos, ₹40,000, open', list[0]?.number === 1 && list[0]?.videos === 10 && Number(list[0]?.total_paise) === 4000000 && list[0]?.status === 'open', JSON.stringify(list[0]))
  const opv = ((await op.rpc('experience_console_addons', { p_experience_id: E })).data as any)
  ok('operational staff see what it adds and its status, never the price or lines', opv.can_send === false && opv.addons[0].deliverables[0].count === 10 && opv.addons[0].total_paise === null
    && opv.addons[0].per_video_paise === null && opv.addons[0].extras === null && opv.addons[0].extras_count === 1 && opv.addons[0].message === null)
  ok('the brand sees it with its lines', ((await brand.rpc('brand_experience_addons', { p_experience_id: E })).data as any)?.addons?.[0]?.extras?.[0]?.label === 'Express edit')
  ok('another brand cannot read it', refused(await other.rpc('brand_experience_addons', { p_experience_id: E })))
  ok('a creator cannot read it', refused(await creator.rpc('brand_experience_addons', { p_experience_id: E })) && refused(await creator.rpc('experience_console_addons', { p_experience_id: E })))
  let direct = true
  for (const s of [fin, op, brand, creator]) { const r = await s.from('experience_addons').select('id').limit(1); if (!r.error && (r.data ?? []).length > 0) direct = false }
  ok('nobody reads the table directly (functions only)', direct)
  const add2 = { ...add1, p_deliverables: [{ type: 'UGC video', count: 8 }, { type: 'Story', count: 4 }], p_expected_total_paise: 8 * 350000 + 500000 }
  const s2 = await fin.rpc('experience_console_addon_send', add2)
  list = ((await fin.rpc('experience_console_addons', { p_experience_id: E })).data as any).addons as any[]
  ok('a revised add-on (#2) replaces the open one: #1 superseded, one open', !s2.error && list.find((a) => a.number === 1)?.status === 'superseded' && list.filter((a) => a.status === 'open').length === 1)
  ok('the brand no longer sees the replaced one', (((await brand.rpc('brand_experience_addons', { p_experience_id: E })).data as any).addons as any[]).every((a) => a.number !== 1))
  ok('the brand cannot answer the replaced one', said(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s1.data, p_accept: true, p_note: null, p_expected_total_paise: 4000000 }), /changed/))

  group('the brand answers on Guapd')
  ok('a stale total from the brand screen is refused', said(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: true, p_note: null, p_expected_total_paise: 4000000 }), /changed/))
  ok('declining needs a note', refused(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: false, p_note: '', p_expected_total_paise: 3300000 })))
  ok('NULL answer refused', refused(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: null, p_note: null, p_expected_total_paise: 3300000 })))
  ok('another brand cannot answer', refused(await other.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: true, p_note: null, p_expected_total_paise: 3300000 })))
  const ac = await brand.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: true, p_note: null, p_expected_total_paise: 3300000 })
  ok('the brand admin accepts #2 (₹33,000)', !ac.error, ac.error?.message ?? '')
  const g1 = (await fin.rpc('experience_console_get', { p_experience_id: E })).data as any
  const tot = Object.fromEntries((g1.agreed_plan?.totals ?? []).map((t: any) => [t.type, t.total]))
  ok('the agreed total grows: ₹75,000 + ₹33,000 = ₹1,08,000', g1.brand_service_total_paise === 10800000, String(g1.brand_service_total_paise))
  ok('videos sold and plan videos grow by 8 (Stories are not videos)', g1.agreed_plan.videos_sold === 28 && g1.agreed_plan.plan_videos === 28, JSON.stringify({ s: g1.agreed_plan.videos_sold, p: g1.agreed_plan.plan_videos }))
  ok('per-type totals grow: 28 UGC videos, 14 Stories', tot['UGC video'] === 28 && tot['Story'] === 14, JSON.stringify(tot))
  ok('the plan records the add-on', (g1.agreed_plan.addons ?? []).some((a: any) => a.addon_id === s2.data))
  const rec = (await fin.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data as any
  ok('the creator-deal check now expects 28 videos', rec?.videos_sold === 28, JSON.stringify(rec?.videos_sold))
  ok('#2 is accepted, on Guapd', (((await brand.rpc('brand_experience_addons', { p_experience_id: E })).data as any).addons as any[]).some((a) => a.number === 2 && a.status === 'accepted' && a.on_guapd === true))
  ok('it cannot be answered again', said(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s2.data, p_accept: true, p_note: null, p_expected_total_paise: 3300000 }), /changed/))
  ok('or withdrawn once accepted', refused(await fin.rpc('experience_console_addon_withdraw', { p_addon_id: s2.data })))
  const au = (await admin.from('ops_events').select('action').eq('target_id', E).eq('action', 'experience.addon_accepted_by_brand')).data ?? []
  ok('audit: accepted by the brand', au.length === 1)

  group('finance records an answer; withdraw')
  const s3 = await fin.rpc('experience_console_addon_send', { ...add1, p_deliverables: [], p_per_video_paise: null, p_extras: [{ label: 'Second location', amount_paise: 1200000 }], p_expected_total_paise: 1200000 })
  ok('an extras-only add-on (#3, ₹12,000) can be sent', !s3.error, s3.error?.message ?? '')
  ok('operational staff cannot record the answer', refused(await op.rpc('experience_console_addon_answer', { p_addon_id: s3.data, p_accept: false, p_channel: 'call', p_note: null })))
  ok('recording needs a channel (and never "On Guapd")', refused(await fin.rpc('experience_console_addon_answer', { p_addon_id: s3.data, p_accept: false, p_channel: null, p_note: null }))
    && refused(await fin.rpc('experience_console_addon_answer', { p_addon_id: s3.data, p_accept: false, p_channel: 'portal', p_note: null })))
  ok('finance records the decline from a call', !refused(await fin.rpc('experience_console_addon_answer', { p_addon_id: s3.data, p_accept: false, p_channel: 'call', p_note: 'Not this month' })))
  const g2 = (await fin.rpc('experience_console_get', { p_experience_id: E })).data as any
  ok('a declined add-on changes nothing', g2.brand_service_total_paise === 10800000 && g2.agreed_plan.videos_sold === 28)
  const s4 = await fin.rpc('experience_console_addon_send', { ...add1, p_expected_total_paise: 4000000 })
  ok('operational staff cannot withdraw', refused(await op.rpc('experience_console_addon_withdraw', { p_addon_id: s4.data })))
  ok('finance withdraws #4', !refused(await fin.rpc('experience_console_addon_withdraw', { p_addon_id: s4.data })))
  ok('the brand cannot accept a withdrawn add-on', said(await brand.rpc('brand_experience_addon_answer', { p_addon_id: s4.data, p_accept: true, p_note: null, p_expected_total_paise: 4000000 }), /changed/))

  group('the database holds the sums')
  ok('a total that does not add up is refused even from the service role', refused(await admin.from('experience_addons').insert({ experience_id: E, number: 99, deliverables: [{ type: 'UGC video', count: 1 }], videos: 1, per_video_paise: 100, total_paise: 999 })))
  ok('a video count that does not match the deliverables is refused', refused(await admin.from('experience_addons').insert({ experience_id: E, number: 98, deliverables: [{ type: 'UGC video', count: 2 }], videos: 1, per_video_paise: 100, total_paise: 100 })))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const id of made) {
    const { data: qids } = await admin.from('experience_quotes').select('id').eq('experience_id', id)
    const { data: aids } = await admin.from('experience_addons').select('id').eq('experience_id', id)
    await admin.from('ops_events').delete().in('target_id', [id, ...(qids ?? []).map((x) => x.id), ...(aids ?? []).map((x) => x.id)])
    await admin.from('experience_addons').delete().eq('experience_id', id)
    await admin.from('experiences').delete().eq('id', id)
  }
  for (const u of [staffUserId, opUserId]) if (u) await admin.from('staff_access').delete().eq('user_id', u)
  const left = await admin.from('experiences').select('id').like('title', '[addons-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
