/**
 * 0541, creators not on Guapd yet on an Experience roster, against STAGING
 * with real sessions: operational access only (the brand never sees the
 * list), validation and NULL-means-no, the handle kept clean and unique, the
 * expected cost as an estimate that never enters the margin, status and the
 * brand's answer with its channel, linking to their Guapd account (carrying
 * the brand's answer onto the roster), drop with a reason, closed once the
 * shoot is scheduled, and audit rows with no amounts or phone numbers.
 *
 * Two temporary staff grants, removed after; everything made is deleted.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-prospects.ts
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
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const exps: string[] = []
const grants: string[] = []
let startedAt = ''

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}


async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, handle, full_name, is_bookable, users(auth_id)').eq('is_guapd', false).limit(80)
  const pool = (cr ?? []) as any[]
  const C = pool.find((c) => c.users?.auth_id)
  const bookable = pool.filter((c) => c.is_bookable && c.handle)
  const L = bookable.find((c) => c.id !== C?.id)          // the account a prospect "joins" as
  const M = bookable.find((c) => c.id !== C?.id && c.id !== L?.id)   // a handle already on Guapd
  const notBookable = pool.find((c) => !c.is_bookable)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, C?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !C || !L || !M || !OP || !FIN || !NONE) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  const c = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[prospect-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)
  const tag = String(Date.now()).slice(-6)
  const add = (s: SupabaseClient, o: Record<string, unknown> = {}) => s.rpc('experience_console_prospect_add', { p_experience_id: E, p_full_name: 'Riya Kapoor',
    p_handle: `@riya.makeup_${tag}`, p_phone: '+91 98765 43210', p_cost_basis: 'per_day', p_day_rate_paise: 1200000, p_days: 1.5, p_flat_paise: null, p_note: 'Agreed over DM', ...o })
  const list = async (s: SupabaseClient = op) => ((await s.rpc('experience_console_prospects', { p_experience_id: E })).data as any)?.prospects as any[]

  group('before the price is agreed: refused')
  ok('adding on a Requested Experience is refused', said(await add(op), /price is agreed/))
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })

  group('access: staff (operational) only; the brand never sees it')
  for (const [n, s] of [['no access', none], ['brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: listing and adding are refused`, refused(await (s as SupabaseClient).rpc('experience_console_prospects', { p_experience_id: E })) && refused(await add(s as SupabaseClient)))
  }
  for (const [n, s] of [['operational staff', op], ['brand', brand], ['creator', creator]] as const) {
    const r = await (s as SupabaseClient).from('experience_roster_prospects').select('id').limit(1)
    ok(`${n}: the table is not readable directly`, !!r.error || (r.data ?? []).length === 0)
  }

  group('adding: name, handle, expected cost; NULL means no')
  ok('NULL cost basis is refused', said(await add(op, { p_cost_basis: null }), /day rate or a flat fee/))
  ok('a day rate without days is refused', refused(await add(op, { p_days: null })))
  ok('a flat fee of zero is refused', refused(await add(op, { p_cost_basis: 'flat', p_flat_paise: 0, p_day_rate_paise: null, p_days: null })))
  ok('a bad handle is refused', refused(await add(op, { p_handle: 'not a handle!' })))
  ok('a missing name is refused', refused(await add(op, { p_full_name: ' ' })))
  ok('a bad phone is refused', refused(await add(op, { p_phone: 'call me' })))
  ok("a handle already on Guapd is refused: add them from the pool", said(await add(op, { p_handle: M.handle }), /already on Guapd/))
  const a1 = await add(op)
  ok('operational staff add Riya (₹12,000/day × 1.5 days)', !a1.error, a1.error?.message ?? '')
  const P1 = a1.data as string
  let rows = await list()
  let p1 = rows.find((r) => r.id === P1)
  ok('the handle is stored clean (no @, lower case); the expected total is computed (₹18,000)', p1.instagram_handle === `riya.makeup_${tag}` && Number(p1.expected_total_paise) === 1800000)
  ok('it starts Contacted, brand answer pending', p1.status === 'contacted' && p1.brand_decision === 'pending')
  ok('the same handle twice is refused (an Instagram URL counts as the same)', said(await add(op, { p_handle: `https://instagram.com/riya.makeup_${tag}` }), /already on this list/))
  const a2 = await add(fin, { p_full_name: 'Kabir Shah', p_handle: `kabir.films_${tag}`, p_phone: null, p_cost_basis: 'flat', p_day_rate_paise: null, p_days: null, p_flat_paise: 900000, p_note: null })
  ok('a flat fee entry (₹9,000)', !a2.error && Number((await list()).find((r) => r.id === a2.data).expected_total_paise) === 900000)
  const P2 = a2.data as string

  group('status and the brand\'s answer')
  ok('NULL status is refused', refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P1, p_status: null })))
  ok('"linked" is not a status you set by hand', refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P1, p_status: 'linked' })))
  ok('contacted → agreed → onboarding', !refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P1, p_status: 'agreed' }))
    && !refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P1, p_status: 'onboarding' })))
  ok('NULL decision is refused', refused(await op.rpc('experience_console_prospect_decide', { p_prospect_id: P1, p_decision: null, p_channel: 'email' })))
  ok('a decision without the channel is refused (and "portal" is not one)', refused(await op.rpc('experience_console_prospect_decide', { p_prospect_id: P1, p_decision: 'accepted', p_channel: null }))
    && refused(await op.rpc('experience_console_prospect_decide', { p_prospect_id: P1, p_decision: 'accepted', p_channel: 'portal' })))
  ok('the brand accepted Riya (WhatsApp)', !refused(await op.rpc('experience_console_prospect_decide', { p_prospect_id: P1, p_decision: 'accepted', p_channel: 'whatsapp' })))
  ok('editing works while open', !refused(await op.rpc('experience_console_prospect_update', { p_prospect_id: P2, p_full_name: 'Kabir Shah', p_handle: `kabir.films_${tag}`, p_phone: null,
    p_cost_basis: 'flat', p_day_rate_paise: null, p_days: null, p_flat_paise: 1000000, p_note: 'Agreed ₹10,000 flat' })))

  group('the P&L: an estimate, never the margin')
  const pnl = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('2 not on Guapd yet, ₹28,000 expected; the margin does not move', pnl.prospects_pending === 2 && Number(pnl.prospects_estimate_paise) === 2800000 && Number(pnl.creator_net_total_paise) === 0)
  ok('they are not on the roster (nothing to lock or send)', ((await op.rpc('experience_console_roster', { p_experience_id: E })).data as any[]).length === 0)

  group('they join: link to their Guapd account')
  // Their account turns up under the same handle: the screen offers it.
  const mProspect = await admin.from('experience_roster_prospects').insert({ experience_id: E, full_name: M.full_name, instagram_handle: String(M.handle).replace(/^@/, '').toLowerCase(),
    cost_basis: 'flat', expected_total_paise: 500000, created_by: OP.id }).select('id').single()
  const mRow = (await list()).find((r) => r.id === mProspect.data!.id)
  ok('an entry whose handle is now on Guapd shows the match (bookable, not on the roster)', mRow?.match?.creator_id === M.id && mRow.match.bookable === true && mRow.match.on_roster === false, JSON.stringify(mRow?.match))
  if (notBookable) ok('linking to a creator who is not vetted/bookable is refused', said(await op.rpc('experience_console_prospect_link', { p_prospect_id: P1, p_creator_id: notBookable.id }), /vetted and bookable/))
  ok('NULL creator is refused', refused(await op.rpc('experience_console_prospect_link', { p_prospect_id: P1, p_creator_id: null })))
  for (const [n, s] of [['brand', brand], ['creator', creator], ['no access', none]] as const) {
    ok(`${n}: cannot link`, refused(await (s as SupabaseClient).rpc('experience_console_prospect_link', { p_prospect_id: P1, p_creator_id: L.id })))
  }
  const lk = await op.rpc('experience_console_prospect_link', { p_prospect_id: P1, p_creator_id: L.id })
  ok('linked: they are on the roster now', !lk.error, lk.error?.message ?? '')
  const ro = (await admin.from('experience_roster').select('creator_id, added_by, brand_decision, decision_channel, decided_at, planned_deliverables, locked').eq('id', lk.data as string).single()).data as any
  ok("the brand's answer and channel carried over; planned from the agreed per-creator plan; not locked", ro.creator_id === L.id && ro.brand_decision === 'accepted'
    && ro.decision_channel === 'whatsapp' && !!ro.decided_at && Array.isArray(ro.planned_deliverables) && ro.planned_deliverables.length > 0 && ro.locked === false, JSON.stringify(ro))
  p1 = (await list()).find((r) => r.id === P1)
  ok('the entry is Linked, to that account', p1.status === 'linked' && p1.linked_creator_id === L.id)
  ok('a linked entry no longer changes (status, answer, edit, drop, link again)', refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P1, p_status: 'agreed' }))
    && refused(await op.rpc('experience_console_prospect_decide', { p_prospect_id: P1, p_decision: 'rejected', p_channel: 'email' }))
    && refused(await op.rpc('experience_console_prospect_drop', { p_prospect_id: P1, p_reason: 'test test' }))
    && refused(await op.rpc('experience_console_prospect_link', { p_prospect_id: P1, p_creator_id: M.id })))
  ok('linking another entry to a creator already on the roster is refused', said(await op.rpc('experience_console_prospect_link', { p_prospect_id: P2, p_creator_id: L.id }), /already on this roster/))
  const bRoster = await brand.from('experience_roster').select('creator_id').eq('experience_id', E)
  ok('the brand sees the linked creator on its roster, and nothing of the list', (bRoster.data ?? []).some((r: any) => r.creator_id === L.id) && !JSON.stringify(bRoster.data).includes('kabir'))
  ok('the P&L estimate drops the linked one', ((await fin.rpc('experience_pnl', { p_experience_id: E })).data as any).prospects_pending === 2)

  group('drop')
  ok('dropping needs a reason', refused(await op.rpc('experience_console_prospect_drop', { p_prospect_id: P2, p_reason: '' })))
  ok('dropped with a reason; final', !refused(await op.rpc('experience_console_prospect_drop', { p_prospect_id: P2, p_reason: 'Not free on the shoot date' }))
    && refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: P2, p_status: 'agreed' })))
  ok('the same handle can be added again after a drop', !refused(await add(op, { p_full_name: 'Kabir Shah', p_handle: `kabir.films_${tag}`, p_cost_basis: 'flat', p_day_rate_paise: null, p_days: null, p_flat_paise: 1000000 })))

  group('closed once the shoot is scheduled')
  await admin.from('experiences').update({ status: 'shoot_scheduled' }).eq('id', E)
  ok('adding is refused', said(await add(op, { p_handle: `late_${tag}` }), /before the shoot is scheduled/))
  ok('changing an open entry is refused', refused(await op.rpc('experience_console_prospect_status', { p_prospect_id: mProspect.data!.id, p_status: 'agreed' })))

  group('audit: every action, no amounts')
  const { data: ev } = await admin.from('ops_events').select('action, detail').in('actor_auth_id', [OP.auth_id, FIN.auth_id]).gte('created_at', startedAt).like('action', 'experience.prospect_%')
  const acts = new Set((ev ?? []).map((e) => e.action))
  for (const a of ['experience.prospect_added', 'experience.prospect_edited', 'experience.prospect_status_set', 'experience.prospect_decision_recorded', 'experience.prospect_linked', 'experience.prospect_dropped']) ok(`audited: ${a}`, acts.has(a))
  ok('none carries an amount or the phone number', (ev ?? []).length > 0 && !(ev ?? []).some((e) => /paise|amount|rate|total|phone/i.test(Object.keys(e.detail as object).join(' ')) || JSON.stringify(e.detail).includes('98765')))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const E of exps) {
    await admin.from('experience_roster_prospects').delete().eq('experience_id', E)
    await admin.from('experience_roster').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[prospect-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
