/**
 * 0542, counters on an Experience creator leg and the paused day rate,
 * against STAGING with real sessions. Proves: a counter changes the PROPOSED
 * gross only (rate / days), never the fee % snapshotted at send, never the
 * deliverables (the video-count reconcile guard is identical before and
 * after); raising the cost needs FINANCIAL access, lowering or holding is
 * operational; 3 rounds each way with full history; once agreed the leg is
 * frozen and no counter (or direct write) reopens it; a creator's paused
 * rate is never overridden by a second active rate, and staff enter a rate on
 * the deal instead. NULL means no. Audit rows carry no amounts.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-counters.ts
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
import { creatorLegTerms } from '../apps/web/lib/experience-money'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const exps: string[] = []
const grants: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []
const uploaded: string[] = []
let startedAt = ''

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

/** An Experience through to sent creator legs. Returns its id and creator→deal / creator→roster maps. */
async function buildExperience(op: SupabaseClient, fin: SupabaseClient, brandId: string, title: string, creators: { id: string; rate: number }[],
  perCreator: { type: string; count: number }[], settings?: Record<string, unknown>) {
  const c = await op.rpc('experience_console_create', {
    p_brand_id: brandId, p_title: title, p_creator_count: creators.length, p_deliverables: perCreator,
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string
  exps.push(E)
  if (settings) {
    const { data: e } = await admin.from('experiences').select('settings_snapshot').eq('id', E).single()
    await admin.from('experiences').update({ settings_snapshot: { ...(e!.settings_snapshot as object), ...settings } }).eq('id', E)
  }
  const videos = perCreator.filter((d) => d.type === 'UGC video' || d.type === 'Reel').reduce((t, d) => t + d.count, 0) * creators.length
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: videos, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  if (q.error) throw new Error('quote: ' + q.error.message)
  const a = await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  if (a.error) throw new Error('accept: ' + a.error.message)
  await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: creators.map((x) => x.id), p_added_by: 'guapd', p_channel: null })
  const roster = ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  for (const r of roster) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  const lk = await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  if (lk.error) throw new Error('lock: ' + lk.error.message)
  for (const x of creators) {
    const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: x.id, p_day_rate_paise: x.rate })
    if (s.data) createdRates.push(s.data as string)
  }
  const legs = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const deal: Record<string, string> = {}, roster_: Record<string, string> = {}
  for (const l of legs) {
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: perCreator, p_affiliate_count: 0 })
    const rate = creators.find((x) => x.id === l.creator_id)!.rate
    const t = creatorLegTerms({ dayRatePaise: rate, days: 1, track: l.track })
    const s = await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    deal[l.creator_id] = s.data as string; roster_[l.creator_id] = l.roster_id; legDeals.push(s.data as string)
  }
  return { E, deal, roster: roster_ }
}


const legsRec = async (s: SupabaseClient, E: string) => JSON.stringify((await s.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data)
const termsOf = async (deal: string) => (await admin.from('experience_creator_terms')
  .select('day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at, rate_source').eq('deal_id', deal).single()).data as any

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.vetting_status !== 'growth' && c.users?.auth_id)
  const X = pool.find((c) => c.id !== G?.id && c.id !== D?.id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !X || !OP || !FIN) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id)
  const brand = await sessionFor(B.users.auth_id), cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')

  // G (Growth, 30%) at ₹10,000/day; D (Deals, 15%) at ₹8,000/day; 1 UGC video each, 1 day.
  const one = await buildExperience(op, fin, B.brand_id, '[counter-test] Kiro', [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }], [{ type: 'UGC video', count: 1 }])
  const E = one.E, gLeg = one.deal[G.id], dLeg = one.deal[D.id]
  const ctx = async (s: SupabaseClient, deal: string) => (await s.rpc('creator_leg_context', { p_deal_id: deal })).data as any
  const R0 = await legsRec(op, E)
  const items0 = ((await admin.from('deal_deliverable_items').select('id, label').in('deal_id', [gLeg, dLeg])).data ?? []).map((i: any) => i.id).sort().join(',')
  const roster0 = JSON.stringify(((await admin.from('experience_roster').select('leg_deliverables, leg_affiliate_count').eq('experience_id', E).order('id')).data))
  const g0 = await termsOf(gLeg)

  group('who can counter')
  for (const [n, s] of [["another creator (D) on G's offer", cD], ['the brand', brand], ['operational staff (as a creator)', op], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: refused`, refused(await (s as SupabaseClient).rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1200000, p_days: 1, p_note: null })))
  }
  ok('no user reads the counter table directly', refused(await cG.from('experience_leg_counters').select('id').limit(1)) || ((await cG.from('experience_leg_counters').select('id').limit(1)).data ?? []).length === 0)
  ok('NULL rate is refused', refused(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: null, p_days: 1, p_note: null })))
  ok('NULL days is refused', refused(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1200000, p_days: null, p_note: null })))
  ok('a rate in paise that is not whole rupees is refused', refused(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1200050, p_days: 1, p_note: null })))
  ok('the current offer itself is not a counter', said(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1000000, p_days: 1, p_note: null }), /current offer/))

  group("G counters UP (₹12,000): the fee % and the deliverables do not move; raising needs finance")
  const c1 = await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1200000, p_days: 1, p_note: 'My rate went up this month' })
  ok('G sends a counter', !c1.error, c1.error?.message ?? '')
  const C1 = c1.data as string
  const row1 = (await admin.from('experience_leg_counters').select('round, proposed_by, platform_pct, gross_paise, net_paise, status').eq('id', C1).single()).data as any
  ok('priced at the fee % snapshotted at send (30%): ₹12,000 → ₹8,400', Number(row1.platform_pct) === Number(g0.platform_pct) && Number(row1.gross_paise) === 1200000 && Number(row1.net_paise) === 840000)
  let x = await ctx(cG, gLeg)
  ok("G's page shows the counter waiting and 2 counters left", x.counters.length === 1 && x.counters[0].status === 'open' && x.counters_left === 2)
  ok('while open, the sent terms are unchanged', JSON.stringify(await termsOf(gLeg)) === JSON.stringify(g0))
  ok('a second open counter from G is refused (withdraw first)', said(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1300000, p_days: 1, p_note: null }), /waiting for Guapd/))
  const cl = (await op.rpc('experience_console_counters', { p_experience_id: E })).data as any
  ok('the console marks it as raising the cost; operational staff cannot raise', cl.counters.find((c: any) => c.id === C1).direction === 'raises' && cl.can_raise === false)
  ok('operational staff cannot accept a counter that RAISES the cost', said(await op.rpc('experience_console_counter_accept', { p_counter_id: C1, p_expected_gross_paise: 1200000 }), /financial access/))
  ok('a stale screen is refused', said(await fin.rpc('experience_console_counter_accept', { p_counter_id: C1, p_expected_gross_paise: 1100000 }), /changed since/))
  ok('NULL expected figure is refused', refused(await fin.rpc('experience_console_counter_accept', { p_counter_id: C1, p_expected_gross_paise: null })))
  const acc = await fin.rpc('experience_console_counter_accept', { p_counter_id: C1, p_expected_gross_paise: 1200000 })
  ok('financial staff accept it: the deal is agreed', !acc.error && (await admin.from('deals').select('status').eq('id', gLeg).single()).data?.status === 'agreed', acc.error?.message ?? '')
  const g1 = await termsOf(gLeg)
  ok('ONLY the proposed gross moved: rate ₹12,000, gross ₹12,000, net ₹8,400', Number(g1.day_rate_paise) === 1200000 && Number(g1.creator_gross_paise) === 1200000 && Number(g1.creator_net_paise) === 840000)
  ok('the fee % snapshot did NOT move (30%), nor the track, package, rate source or lock time',
    Number(g1.platform_pct) === Number(g0.platform_pct) && g1.platform_track === g0.platform_track && g1.product_id === g0.product_id && g1.rate_source === g0.rate_source && g1.locked_at === g0.locked_at)
  ok('the video-count reconcile guard is untouched (identical before and after)', (await legsRec(op, E)) === R0)
  ok('…the deliverable items and the roster scope are untouched', ((await admin.from('deal_deliverable_items').select('id').in('deal_id', [gLeg, dLeg])).data ?? []).map((i: any) => i.id).sort().join(',') === items0
    && JSON.stringify(((await admin.from('experience_roster').select('leg_deliverables, leg_affiliate_count').eq('experience_id', E).order('id')).data)) === roster0)

  group('frozen: a counter can never reopen an agreed leg')
  ok('G cannot counter again', said(await cG.rpc('creator_leg_counter', { p_deal_id: gLeg, p_day_rate_paise: 1500000, p_days: 1, p_note: null }), /already answered/))
  ok('Guapd cannot counter it', said(await fin.rpc('experience_console_counter_send', { p_deal_id: gLeg, p_day_rate_paise: 900000, p_days: 1, p_note: null }), /already answered/))
  ok('even the service role cannot change agreed terms directly', refused(await admin.from('experience_creator_terms').update({ day_rate_paise: 1, creator_gross_paise: 1, creator_net_paise: 1, days: 1 }).eq('deal_id', gLeg).select('deal_id')))
  const rp = await admin.rpc('experience_leg_reprice', { p_deal_id: gLeg, p_day_rate_paise: 100, p_days: 1 })
  ok('…nor through the re-price path once the deal is agreed', !!rp.error && JSON.stringify(await termsOf(gLeg)) === JSON.stringify(g1), rp.error?.message ?? 'NO ERROR')
  ok('and the fee % never changes, even while open', refused(await admin.from('experience_creator_terms').update({ platform_pct: 10 }).eq('deal_id', dLeg).select('deal_id')))
  ok('an open deal\'s terms cannot be re-priced without the counter path', refused(await admin.from('experience_creator_terms').update({ day_rate_paise: 1, creator_gross_paise: 1, creator_net_paise: 1 }).eq('deal_id', dLeg).select('deal_id')))
  x = await ctx(cG, gLeg)
  ok("G's page: agreed, counter accepted, no counters left", x.status === 'agreed' && x.counters[0].status === 'accepted' && x.counters_left === 0)

  group('D (15%): rounds, declines, Guapd counters, 3 each way')
  const d0 = await termsOf(dLeg)
  const dc1 = await cD.rpc('creator_leg_counter', { p_deal_id: dLeg, p_day_rate_paise: 750000, p_days: 1, p_note: null })
  ok('D counters (lower, ₹7,500) — round 1', !dc1.error && (await admin.from('experience_leg_counters').select('round').eq('id', dc1.data as string).single()).data?.round === 1)
  ok('operational staff decline it (with a note for D)', !refused(await op.rpc('experience_console_counter_decline', { p_counter_id: dc1.data, p_note: 'Budget is fixed' })))
  const dc2 = await cD.rpc('creator_leg_counter', { p_deal_id: dLeg, p_day_rate_paise: 900000, p_days: 1, p_note: null })
  ok('D counters again (₹9,000) — round 2', !dc2.error)
  ok('Guapd countering with the current offer is refused', said(await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 800000, p_days: 1, p_note: null }), /current offer/))
  ok('operational staff cannot send a counter that raises the cost', said(await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 850000, p_days: 1, p_note: null }), /financial access/))
  const gc1 = await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 780000, p_days: 1, p_note: 'Meet in the middle?' })
  ok('operational staff counter with a LOWER figure (₹7,800): allowed; D\'s open counter is superseded', !gc1.error
    && (await admin.from('experience_leg_counters').select('status').eq('id', dc2.data as string).single()).data?.status === 'superseded', gc1.error?.message ?? '')
  ok("D cannot accept the original offer while Guapd's counter waits", said(await cD.rpc('creator_leg_respond', { p_deal_id: dLeg, p_accept: true, p_reason: null }), /new offer/))
  const dc3 = await cD.rpc('creator_leg_counter', { p_deal_id: dLeg, p_day_rate_paise: 820000, p_days: 1, p_note: null })
  ok('D counters a third time (answers Guapd\'s counter)', !dc3.error && (await admin.from('experience_leg_counters').select('status').eq('id', gc1.data as string).single()).data?.status === 'superseded')
  await op.rpc('experience_console_counter_decline', { p_counter_id: dc3.data, p_note: null })
  ok('a fourth creator counter is refused (3 each way)', said(await cD.rpc('creator_leg_counter', { p_deal_id: dLeg, p_day_rate_paise: 810000, p_days: 1, p_note: null }), /3 counters/))
  ok("D's page shows 0 counters left and the full history (3 of theirs, 1 of Guapd's)", await (async () => { const c = await ctx(cD, dLeg); return c.counters_left === 0 && c.counters.length === 4 })())
  const gc2 = await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 790000, p_days: 1, p_note: null })
  await op.rpc('experience_console_counter_withdraw', { p_counter_id: gc2.data })
  const gc3 = await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 770000, p_days: 1, p_note: null })
  ok('Guapd counters 2 and 3 (one withdrawn)', !gc2.error && !gc3.error)
  ok('a fourth Guapd counter is refused', said(await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 760000, p_days: 1, p_note: null }), /3 counters|still waiting/))
  await op.rpc('experience_console_counter_withdraw', { p_counter_id: gc3.data })
  ok('…even once the third is withdrawn', said(await op.rpc('experience_console_counter_send', { p_deal_id: dLeg, p_day_rate_paise: 760000, p_days: 1, p_note: null }), /3 counters/))
  const dacc = await cD.rpc('creator_leg_respond', { p_deal_id: dLeg, p_accept: true, p_reason: null })
  ok('D accepts the offer as sent: agreed at the ORIGINAL terms, untouched', !dacc.error && JSON.stringify(await termsOf(dLeg)) === JSON.stringify(d0))
  ok('the reconcile guard is still identical', (await legsRec(op, E)) === R0)

  group("a Guapd counter the creator accepts")
  // A third creator on a fresh offer: X, sent with a rate ENTERED on the deal while their own is paused.
  const c3 = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[counter-test] paused', p_creator_count: 1, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  const E2 = c3.data as string; exps.push(E2)
  const q2 = await fin.rpc('experience_console_quote', { p_experience_id: E2, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 1, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q2.data, p_channel: 'email' })
  await op.rpc('experience_console_roster_add', { p_experience_id: E2, p_creator_ids: [X.id], p_added_by: 'guapd', p_channel: null })
  const r2 = ((await op.rpc('experience_console_roster', { p_experience_id: E2 })).data as any[])[0]
  await op.rpc('experience_console_roster_decide', { p_roster_id: r2.id, p_decision: 'accepted', p_channel: 'email' })
  await op.rpc('experience_console_roster_lock', { p_experience_id: E2 })
  const sr = await op.rpc('experience_console_set_day_rate', { p_creator_id: X.id, p_day_rate_paise: 600000 })
  if (sr.data) createdRates.push(sr.data as string)
  await admin.from('creator_products').update({ is_active: false }).eq('id', sr.data as string)   // the creator pauses it
  const activeX = async () => ((await admin.from('creator_products').select('id').eq('creator_id', X.id).eq('pricing_type', 'per_day').eq('is_active', true)).data ?? []).length

  group('paused day rate: never a second active rate')
  ok('staff setting a rate over the creator\'s pause is refused', said(await op.rpc('experience_console_set_day_rate', { p_creator_id: X.id, p_day_rate_paise: 700000 }), /paused/))
  ok('…and no second active rate exists', (await activeX()) === 0)
  const legs2 = (await op.rpc('experience_console_legs', { p_experience_id: E2 })).data as any[]
  ok('the console shows the paused rate and no active one', legs2[0].day_rate_product_id === null && Number(legs2[0].paused_rate_paise) === 600000)
  ok('drafting with the paused package is refused', said(await op.rpc('experience_console_leg_draft', { p_roster_id: r2.id, p_product_id: sr.data, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 }), /active shoot day rate/))
  ok('a package AND an entered rate is refused', refused(await op.rpc('experience_console_leg_draft', { p_roster_id: r2.id, p_product_id: sr.data, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 600000 })))
  ok('a rate entered on the deal (₹6,500) is accepted', !refused(await op.rpc('experience_console_leg_draft', { p_roster_id: r2.id, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 650000 })))
  const xt = creatorLegTerms({ dayRatePaise: 650000, days: 1, track: legs2[0].track })
  const xs = await op.rpc('experience_console_leg_send', { p_roster_id: r2.id, p_expected_gross_paise: xt.creatorGrossPaise, p_expected_platform_pct: xt.platformPct, p_expected_net_paise: xt.creatorNetPaise })
  ok('the deal is sent at the entered rate', !xs.error, xs.error?.message ?? '')
  const xLeg = xs.data as string; legDeals.push(xLeg)
  const xT = await termsOf(xLeg)
  ok('terms record the entered rate, no package, and the creator still has no active rate', xT.rate_source === 'entered' && xT.product_id === null && Number(xT.day_rate_paise) === 650000 && (await activeX()) === 0)
  const xg = await op.rpc('experience_console_counter_send', { p_deal_id: xLeg, p_day_rate_paise: 600000, p_days: 1, p_note: null })
  ok('Guapd counters X lower', !xg.error)
  ok('withdrawing the offer closes the open counter', !refused(await op.rpc('experience_console_leg_withdraw', { p_roster_id: r2.id, p_reason: 'Brand changed the date' }))
    && (await admin.from('experience_leg_counters').select('status').eq('id', xg.data as string).single()).data?.status === 'withdrawn')

  group('audit: counters recorded, no amounts')
  const { data: ev } = await admin.from('ops_events').select('action, detail').in('actor_auth_id', [OP.auth_id, FIN.auth_id]).gte('created_at', startedAt).like('action', 'experience.leg_counter%')
  const acts = new Set((ev ?? []).map((e) => e.action))
  for (const a of ['experience.leg_counter_accepted', 'experience.leg_counter_declined', 'experience.leg_counter_sent', 'experience.leg_counter_withdrawn']) ok(`audited: ${a}`, acts.has(a))
  ok('none carries an amount', (ev ?? []).length > 0 && !(ev ?? []).some((e) => /paise|amount|rate|gross|net|total/i.test(Object.keys(e.detail as object).join(' '))))
  const { data: dev } = await admin.from('events').select('detail').in('deal_id', [gLeg, dLeg]).like('event_type', 'experience.leg_counter%')
  ok('the deal timeline records each step without amounts', (dev ?? []).length >= 6 && !(dev ?? []).some((e) => /paise|amount/i.test(JSON.stringify(e.detail))))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
    for (const E of exps) {
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
  for (const E of exps) await admin.from('experience_leg_counters').delete().eq('experience_id', E)   // kept forever by design; only the service role may remove test rows
  if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
  for (const E of exps) { await admin.from('experience_cost_lines').delete().eq('experience_id', E); await admin.from('experiences').delete().eq('id', E) }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[counter-test]%')
  const files = uploaded.length ? (await admin.storage.from('deliverables').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
