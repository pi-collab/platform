/**
 * 0555: extra deliverables for a creator after the shoot, against STAGING with
 * real sessions: the cap (never past what the brand bought; an add-on first),
 * operational access, per-item and flat pricing with the locked fee %, revise
 * and withdraw, the creator accepting (items added to their deal) or declining,
 * the extra's own invoice and maker-checker payout, the P&L and completion.
 * Two temporary staff grants, removed after; everything made is deleted.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-extras.ts
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
import { fixtureInvoice } from './fixture-invoice'
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
const invoices: string[] = []
const newVendorCreators: string[] = []
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


const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  // Creators with a day rate of their own (real staging data) are left alone: this run sets fresh rates.
  { const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day'); const r = new Set((rated ?? []).map((x: any) => x.creator_id)); pool.splice(0, pool.length, ...pool.filter((c) => !r.has(c.id))) }
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.users?.auth_id)
  const X = pool.find((c) => c.id !== G?.id && c.id !== D?.id && c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  // Test staff actors are never creators: a creator login can save its own bank details, list its own deals, etc.
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) } // staff actors are never creators
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !X || !OP || !FIN || !NONE) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(G.users.auth_id), creatorD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const { data: hadVendors } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id, X.id])
  newVendorCreators.push(...[G.id, D.id, X.id].filter((id) => !(hadVendors ?? []).some((v: any) => v.creator_id === id)))
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')

  // 3 creators × 1 UGC video (Kiro: Guapd provides). X will not shoot.
  const one = await buildExperience(op, fin, B.brand_id, '[extras-test] Kiro', [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }, { id: X.id, rate: 500000 }], [{ type: 'UGC video', count: 1 }])
  const E = one.E, legOf = (w: { id: string }) => one.deal[w.id], rosterOf = (w: { id: string }) => one.roster[w.id]
  await admin.from('deals').update({ status: 'agreed' }).in('id', [legOf(G), legOf(D), legOf(X)])
  const sch = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  if (sch.error) throw new Error('schedule: ' + sch.error.message)
  const payouts = async (s: SupabaseClient = op) => (await s.rpc('experience_console_payouts', { p_experience_id: E })).data as any
  const legRow = async (w: { id: string }) => ((await payouts()).legs as any[]).find((l) => l.deal_id === legOf(w))

  const terms = async (deal: string) => (await admin.from('experience_creator_terms').select('platform_track, platform_pct, creator_net_paise, allowance_paise').eq('deal_id', deal).single()).data as any
  const tG = await terms(legOf(G)), tD = await terms(legOf(D))
  const money = (gross: number, track: string) => creatorLegTerms({ grossPaise: gross, track: track as any })
  const extra = (deal: string, o: Record<string, unknown>) => ({ p_deal_id: deal, p_deliverables: [{ type: 'UGC video', count: 1 }], p_pricing: 'per_item', p_unit_paise: 200000, p_flat_paise: null, p_message: null, p_expected_gross_paise: 200000, p_expected_net_paise: money(200000, tG.platform_track).creatorNetPaise, ...o })
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  for (const w of [G, D]) await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(w), p_outcome: 'done', p_reason: null })
  await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(X), p_outcome: 'did_not_shoot', p_reason: 'Fell ill on the day' })

  group('the cap: never past what the brand bought')
  ok('with 3 videos sold and 3 placed, an extra video is refused: add-on first', said(await op.rpc('experience_console_extra_send', extra(legOf(G), {})), /add-on first/))
  const ad = await fin.rpc('experience_console_addon_send', { p_experience_id: E, p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }], p_per_video_paise: 3000000, p_extras: [{ label: 'Story edit', amount_paise: 500000 }], p_message: null, p_expected_total_paise: 6500000 })
  ok('finance sends the brand an add-on: +2 UGC videos, +1 Story', !ad.error, ad.error?.message ?? '')
  ok('the brand accepts it (recorded by finance)', !refused(await fin.rpc('experience_console_addon_answer', { p_addon_id: ad.data, p_accept: true, p_channel: 'email', p_note: null })))

  group('who may send an extra: operational staff')
  for (const [n, s] of [['no access', none], ['the brand', brand], ['the creator', creator], ['anonymous', anon]] as const)
    ok(`${n}: refused`, refused(await (s as SupabaseClient).rpc('experience_console_extra_send', extra(legOf(G), {}))))
  ok('…and nobody reads the extras table directly', await (async () => { for (const s of [op, fin, brand, creator]) { const r = await s.from('experience_leg_extras').select('id').limit(1); if (!r.error && (r.data ?? []).length) return false } return true })())

  group('what an extra may hold, priced at the locked fee')
  for (const [n, o, re] of [
    ['an unknown type', { p_deliverables: [{ type: 'Podcast', count: 1 }] }, /type and a count/],
    ['nothing to add', { p_deliverables: [] }, /type and a count/],
    ['no pricing', { p_pricing: null }, /per item or as a flat/],
    ['per item with no rate', { p_unit_paise: null }, /rate per item/],
    ['flat with no amount', { p_pricing: 'flat', p_flat_paise: null }, /flat amount/],
    ['a stale gross', { p_expected_gross_paise: 199999 }, /figures changed/],
    ['a stale net', { p_expected_net_paise: 1 }, /figures changed/],
    ['NULL expected figures', { p_expected_gross_paise: null, p_expected_net_paise: null }, /figures changed/],
  ] as const) ok(`${n}: refused`, said(await op.rpc('experience_console_extra_send', extra(legOf(G), o)), re as RegExp))
  const g2 = money(400000, tG.platform_track)
  const x1 = await op.rpc('experience_console_extra_send', extra(legOf(G), { p_deliverables: [{ type: 'UGC video', count: 2 }], p_expected_gross_paise: 400000, p_expected_net_paise: g2.creatorNetPaise, p_message: 'The brand loved your looks' }))
  ok('G gets extra #1: 2 UGC videos × ₹2,000 = ₹4,000, less the locked fee', !x1.error, x1.error?.message ?? '')
  const row1 = (await admin.from('experience_leg_extras').select('items, videos, gross_paise, platform_pct, platform_fee_paise, net_paise, status').eq('id', x1.data as string).single()).data as any
  ok(`the fee is G's locked ${tG.platform_pct}%: net ${g2.creatorNetPaise}`, Number(row1.gross_paise) === 400000 && Number(row1.platform_pct) === Number(tG.platform_pct) && Number(row1.net_paise) === g2.creatorNetPaise && row1.items === 2, JSON.stringify(row1))
  ok('D cannot get a third video: the brand bought 2 extra, both now offered to G', said(await op.rpc('experience_console_extra_send', extra(legOf(D), { p_expected_net_paise: money(200000, tD.platform_track).creatorNetPaise })), /add-on first/))
  const dFlat = money(150000, tD.platform_track)
  const xd = await op.rpc('experience_console_extra_send', extra(legOf(D), { p_deliverables: [{ type: 'Story', count: 1 }], p_pricing: 'flat', p_unit_paise: null, p_flat_paise: 150000, p_expected_gross_paise: 150000, p_expected_net_paise: dFlat.creatorNetPaise }))
  ok('D gets a flat ₹1,500 for the added Story', !xd.error, xd.error?.message ?? '')
  ok('a second Story would pass what was bought: refused', said(await op.rpc('experience_console_extra_send', extra(legOf(X), { p_deliverables: [{ type: 'Story', count: 1 }], p_pricing: 'flat', p_unit_paise: null, p_flat_paise: 150000, p_expected_gross_paise: 150000, p_expected_net_paise: money(150000, 'deals').creatorNetPaise })), /accepted their deal|Story|add-on/))

  group('revise and withdraw while unanswered')
  const g3 = money(500000, tG.platform_track)
  const x2 = await op.rpc('experience_console_extra_send', extra(legOf(G), { p_deliverables: [{ type: 'UGC video', count: 2 }], p_unit_paise: 250000, p_expected_gross_paise: 500000, p_expected_net_paise: g3.creatorNetPaise }))
  ok('a revised extra (#2, ₹2,500 each) replaces #1', !x2.error && (await admin.from('experience_leg_extras').select('status').eq('id', x1.data as string).single()).data?.status === 'superseded', x2.error?.message ?? '')
  let gc = (await creator.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  ok("G's page shows only #2, open", (gc.extras ?? []).length === 1 && gc.extras[0].number === 2 && gc.extras[0].status === 'open' && Number(gc.extras[0].net_paise) === g3.creatorNetPaise)
  ok('G cannot answer the replaced one', said(await creator.rpc('creator_leg_extra_respond', { p_extra_id: x1.data, p_accept: true, p_reason: null, p_expected_net_paise: g2.creatorNetPaise }), /changed/))
  ok('operational staff withdraw D\'s', !refused(await op.rpc('experience_console_extra_withdraw', { p_extra_id: xd.data })))
  ok('D cannot accept a withdrawn extra', said(await creatorD.rpc('creator_leg_extra_respond', { p_extra_id: xd.data, p_accept: true, p_reason: null, p_expected_net_paise: dFlat.creatorNetPaise }), /changed/))

  group('the creator answers their own')
  ok('D cannot answer G\'s', refused(await creatorD.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: true, p_reason: null, p_expected_net_paise: g3.creatorNetPaise })))
  ok('the brand cannot answer it', refused(await brand.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: true, p_reason: null, p_expected_net_paise: g3.creatorNetPaise })))
  ok('a stale net from G\'s screen is refused', said(await creator.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: true, p_reason: null, p_expected_net_paise: g2.creatorNetPaise }), /changed/))
  ok('NULL answer refused', refused(await creator.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: null, p_reason: null, p_expected_net_paise: g3.creatorNetPaise })))
  const acc = await creator.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: true, p_reason: null, p_expected_net_paise: g3.creatorNetPaise })
  ok('G accepts #2', !acc.error && acc.data === 'accepted', acc.error?.message ?? '')
  const items = (await admin.from('deal_deliverable_items').select('label, extra_id').eq('deal_id', legOf(G)).order('created_at')).data ?? []
  ok('two items are added to G\'s deal, numbered on: UGC video 2 and 3', items.filter((i: any) => i.extra_id === x2.data).map((i: any) => i.label).join(',') === 'UGC video 2,UGC video 3', items.map((i: any) => i.label).join(','))
  ok('answering twice is refused', said(await creator.rpc('creator_leg_extra_respond', { p_extra_id: x2.data, p_accept: false, p_reason: null, p_expected_net_paise: g3.creatorNetPaise }), /changed/))
  const rec = (await op.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data as any
  ok('the creator-deal check counts it: 5 videos placed of 5 sold', rec.videos_sold === 5 && rec.videos_placed === 5, JSON.stringify({ s: rec.videos_sold, p: rec.videos_placed }))
  const xd2 = await op.rpc('experience_console_extra_send', extra(legOf(D), { p_deliverables: [{ type: 'Story', count: 1 }], p_pricing: 'flat', p_unit_paise: null, p_flat_paise: 150000, p_expected_gross_paise: 150000, p_expected_net_paise: dFlat.creatorNetPaise }))
  ok('D declines a new Story extra with a reason', !xd2.error && (await creatorD.rpc('creator_leg_extra_respond', { p_extra_id: xd2.data, p_accept: false, p_reason: 'Busy that week', p_expected_net_paise: dFlat.creatorNetPaise })).data === 'declined')
  ok('the timeline has the offer and the answers, with no amounts', ((await admin.from('events').select('event_type, detail').eq('deal_id', legOf(G)).like('event_type', 'experience.extra_%')).data ?? [])
    .every((e: any) => !/paise|amount|gross|net/.test(JSON.stringify(e.detail))))

  group("the extra's own invoice and payout")
  gc = (await creator.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  const dbg = (await admin.from('deals').select('status, settings_snapshot').eq('id', legOf(G)).single()).data as any
  const dbgR = (await admin.from('experience_roster').select('leg_shoot_outcome').eq('leg_deal_id', legOf(G)).single()).data as any
  const dbgE = (await admin.from('experiences').select('status').eq('id', E).single()).data as any
  ok('G can invoice the accepted extra (Guapd provides; shot)', gc.extras[0].can_invoice === true && gc.extras[0].invoice === null, JSON.stringify({ x: gc.extras[0]?.status, d: dbg?.status, owner: dbg?.settings_snapshot?.deliverables_owner, trig: dbg?.settings_snapshot?.completion_trigger, o: dbgR?.leg_shoot_outcome, e: dbgE?.status }))
  ok('no extra payout before its invoice', said(await op.rpc('experience_console_extra_payout_request', { p_extra_id: x2.data, p_tds_paise: 0 }), /invoice/))
  ok('D cannot invoice G\'s extra', refused(await creatorD.rpc('creator_leg_extra_invoice_raise', { p_extra_id: x2.data, p_confirmed: true, p_billing_name: 'D', p_gstin: null, p_expected_payable_paise: g3.creatorNetPaise })))
  ok('without the confirmation: refused', refused(await creator.rpc('creator_leg_extra_invoice_raise', { p_extra_id: x2.data, p_confirmed: false, p_billing_name: 'G', p_gstin: null, p_expected_payable_paise: g3.creatorNetPaise })))
  ok('a stale total: refused', said(await creator.rpc('creator_leg_extra_invoice_raise', { p_extra_id: x2.data, p_confirmed: true, p_billing_name: 'G', p_gstin: null, p_expected_payable_paise: 1 }), /changed/))
  const xi = await creator.rpc('creator_leg_extra_invoice_raise', { p_extra_id: x2.data, p_confirmed: true, p_billing_name: 'Test Creator G', p_gstin: null, p_expected_payable_paise: g3.creatorNetPaise })
  const gRef = (await admin.from('deals').select('deal_ref').eq('id', legOf(G)).single()).data!.deal_ref
  ok('G raises it: numbered CI-<ref>-X2, for the extra net', !xi.error && (xi.data as any)?.number === `CI-${gRef}-X2`, xi.error?.message ?? JSON.stringify(xi.data))
  ok('the PDF data says it is an extra', ((await creator.rpc('creator_leg_extra_invoice_doc', { p_extra_id: x2.data })).data as any)?.extra?.number === 2)
  const mainInv = await creator.rpc('creator_leg_invoice_raise', { p_deal_id: legOf(G), p_shoot_confirmed: true, p_billing_name: 'Test Creator G', p_gstin: null, p_expected_payable_paise: Number(tG.creator_net_paise) + Number(tG.allowance_paise) })
  ok('the main invoice is separate and still raisable', !mainInv.error, mainInv.error?.message ?? '')
  ok('raising the extra invoice twice is refused', said(await creator.rpc('creator_leg_extra_invoice_raise', { p_extra_id: x2.data, p_confirmed: true, p_billing_name: 'G', p_gstin: null, p_expected_payable_paise: g3.creatorNetPaise }), /already raised/))
  ok('the brand and other creators never read it', refused(await brand.rpc('creator_leg_extra_invoice_doc', { p_extra_id: x2.data })) && refused(await creatorD.rpc('creator_leg_extra_invoice_doc', { p_extra_id: x2.data })))
  const xp = await op.rpc('experience_console_extra_payout_request', { p_extra_id: x2.data, p_tds_paise: 0 })
  ok('operational staff request the extra payout', !xp.error, xp.error?.message ?? '')
  const xpr = (await admin.from('vendor_payouts').select('reason, extra_id, gross_paise, amount_paise, net_amount_paise').eq('id', xp.data as string).single()).data as any
  ok('a creator_extra payout of exactly the extra', xpr.reason === 'creator_extra' && xpr.extra_id === x2.data && Number(xpr.gross_paise) === 500000 && Number(xpr.amount_paise) === g3.creatorNetPaise)
  ok('one live payout per extra', said(await op.rpc('experience_console_extra_payout_request', { p_extra_id: x2.data, p_tds_paise: 0 }), /already has a payout/))
  ok('its invoice cannot be voided while its payout is live', said(await op.rpc('experience_console_creator_invoice_void', { p_invoice_id: (xi.data as any).id, p_reason: 'wrong name' }), /live payout/))
  ok('the database refuses an extra payout that is not the extra', refused(await admin.from('vendor_payouts').insert({ experience_id: E, deal_id: legOf(G), extra_id: x2.data, vendor_id: (await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id,
    reason: 'creator_extra', gross_paise: 999999, platform_pct: 30, platform_fee_paise: 299999, amount_paise: 700000, net_amount_paise: 700000, idempotency_key: `bad-x-${E}` })))
  ok('the main payout is still its own (G can be paid the main fee separately)', !refused(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: 0 })))
  ok('operational staff cannot approve; finance does', said(await op.rpc('experience_console_payout_approve', { p_payout_id: xp.data }), /Financial access/) && !refused(await fin.rpc('experience_console_payout_approve', { p_payout_id: xp.data })))
  const sl = await fin.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: xp.data, p_file_name: 'x.png' })
  await admin.storage.from('finance-docs').upload(sl.data as string, Buffer.from('png'), { contentType: 'image/png' }); uploaded.push(sl.data as string)
  ok('finance records it paid', !refused(await fin.rpc('experience_console_payout_paid', { p_payout_id: xp.data, p_paid_on: istToday(), p_method: 'upi', p_reference: 'UPI-X-1', p_proof_path: sl.data })))
  ok("paying an extra does not move G's deal (the main fee does)", (await admin.from('deals').select('status').eq('id', legOf(G)).single()).data?.status === 'agreed')
  gc = (await creator.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  ok('G sees the extra paid, with the reference', gc.extras[0].payout?.status === 'paid' && gc.extras[0].payout?.reference === 'UPI-X-1')
  const lr = ((await op.rpc('experience_console_payouts', { p_experience_id: E })).data as any).legs.find((l: any) => l.deal_id === legOf(G))
  ok('the console payouts list shows the extra under G, with its invoice and payout', lr?.extras?.[0]?.invoice?.number === `CI-${gRef}-X2` && lr.extras[0].payout?.status === 'paid')

  group('the P&L and completion include it')
  const p = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('creator cost includes the accepted extra', Number(p.creator_extras_gross_paise) === 500000 && Number(p.creator_extras_net_paise) === g3.creatorNetPaise, JSON.stringify({ g: p.creator_extras_gross_paise, n: p.creator_extras_net_paise }))
  ok('cash out includes the extra payout', Number(p.creator_paid_out_paise) >= g3.creatorNetPaise)
  const c = (await op.rpc('experience_console_completion', { p_experience_id: E })).data as any
  ok('completion counts the extra as paid', c.extras_to_pay === 1 && c.extras_paid === 1 && c.extras_open === 0, JSON.stringify({ d: c.extras_to_pay, p: c.extras_paid, o: c.extras_open }))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (uploaded.length) await admin.storage.from('finance-docs').remove(uploaded)
  for (const E of exps) {
    await admin.from('vendor_payouts').delete().eq('experience_id', E)
    await admin.from('deal_deliverable_items').delete().not('extra_id', 'is', null).in('deal_id', legDeals.length ? legDeals : ['00000000-0000-0000-0000-000000000000'])
    await admin.from('experience_creator_invoices').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
    await admin.from('experience_leg_extras').delete().eq('experience_id', E)
    await admin.from('experience_addons').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
  if (newVendorCreators.length) await admin.from('vendors').delete().in('creator_id', newVendorCreators)
  if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('events').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
  for (const E of exps) { await admin.from('experience_cost_lines').delete().eq('experience_id', E); await admin.from('experiences').delete().eq('id', E) }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[extras-test]%')
  const files = uploaded.length ? (await admin.storage.from('finance-docs').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
