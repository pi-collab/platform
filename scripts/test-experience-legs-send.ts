/**
 * 0533–0535: Experience creator legs (Leg 2) and the shoot package, against
 * STAGING with real sessions. Grants TEMPORARY operational access to one real
 * user and removes it; deletes everything it made (legs, Experience, day
 * rates it created, ops_events, notifications).
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-legs-send.ts
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
/** Refused, and by the guard named in the pattern rather than some other error. */
const refusedBy = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const LEG_GUARD = /changes only through Guapd/
let E = '', staffUserId = '', startedAt = ''
const legDeals: string[] = []
const createdRates: string[] = []
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function run() {
  startedAt = new Date().toISOString()
  // ── Actors ──
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd, name)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: logged } = await admin.from('creators').select('id, user_id, vetting_status, users(auth_id)')
    .eq('is_guapd', false).eq('is_bookable', true).not('user_id', 'is', null).limit(40)
  const withLogin = (logged ?? []).filter((c: any) => c.users?.auth_id) as any[]
  const G = withLogin.find((c) => c.vetting_status === 'growth')      // Growth: 30%
  const D = withLogin.find((c) => c.vetting_status !== 'growth')      // Deals: 15%
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(120)
  const [STAFF, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !STAFF || !NONE) throw new Error('missing test actors (need a brand, a Growth and a Deals creator with logins)')

  await admin.from('staff_access').insert({ user_id: STAFF.id, experiences_operational: true })
  staffUserId = STAFF.id
  const staff = await sessionFor(STAFF.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id)
  const cg = await sessionFor(G.users.auth_id), cd = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const houseBrand = (await admin.from('brands').select('id').eq('is_guapd', true).single()).data!.id
  const houseCreator = (await admin.from('creators').select('id').eq('is_guapd', true).single()).data?.id

  // Remember any day rate these creators already had, to restore it after.
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')

  // An agreed Experience: 2 creators × (2 UGC video + 1 Story), affiliate on 1
  // of each creator's videos, ad rights on all for 3 months; 4 videos sold.
  const c = await staff.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[legs-test] Kiro shoot', p_creator_count: 2,
    p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }],
    p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: null, p_ad_rights_months: 3,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null,
    p_brief: 'BRAND-INTERNAL: we pay 3,500 a video', p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  E = c.data as string
  const q = await staff.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 350000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-11', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await staff.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id], p_added_by: 'guapd', p_channel: null })
  let roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  const rid = (creatorId: string) => roster.find((r) => r.creator_id === creatorId).id
  const RG = rid(G.id), RD = rid(D.id)

  group('before the roster is locked')
  ok('a leg cannot be drafted while the roster is still being built', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 2 }], p_affiliate_count: 0 })))
  for (const r of [RG, RD]) await staff.rpc('experience_console_roster_decide', { p_roster_id: r, p_decision: 'accepted', p_channel: 'email' })
  const lk = await staff.rpc('experience_console_roster_lock', { p_experience_id: E })
  ok('roster locks; Experience is Confirmed', !lk.error, lk.error?.message ?? '')

  group('gating: only staff with operational access, refused by the database')
  for (const [n, s] of [['no access (outreach-like)', none], ['the Experience brand', brand], ['a creator', cg], ['anonymous', anon], ['service role', admin]] as const) {
    const cl = s as SupabaseClient
    const all = [
      await cl.rpc('experience_console_legs', { p_experience_id: E }),
      await cl.rpc('experience_console_legs_reconcile', { p_experience_id: E }),
      await cl.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 }),
      await cl.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: 1, p_expected_platform_pct: 30, p_expected_net_paise: 1 }),
      await cl.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1000000 }),
      await cl.rpc('experience_console_set_creator_brief', { p_experience_id: E, p_brief: 'x' }),
      await cl.rpc('experience_console_creator_brief', { p_experience_id: E }),
      await cl.rpc('experience_console_creator_pool'),
    ]
    ok(`${n}: every leg read and write refused`, all.every(refused))
  }
  for (const fn of ['experience_legs_reconcile', 'experience_creator_track']) {
    const arg = fn === 'experience_legs_reconcile' ? { p_experience_id: E } : { p_creator_id: G.id }
    ok(`internal ${fn} cannot be called by staff or the service role`, refused(await staff.rpc(fn, arg)) && refused(await admin.rpc(fn, arg)))
  }

  group('the starting point: the locked plan, with no day rates yet')
  let legs = ((await staff.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const leg = (r: string) => legs.find((l) => l.roster_id === r)
  ok('both locked, accepted creators are listed', legs.length === 2)
  ok('track comes from the creator: Growth and Deals', leg(RG).track === 'growth' && leg(RD).track === 'deals')
  let rec = (await staff.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data as any
  ok('undrafted creators count at the roster plan: 4 of 4 videos, 2 of 2 affiliate', rec.ok === true && rec.videos_placed === 4 && rec.affiliate_placed === 2 && rec.affiliate_target === 2, JSON.stringify(rec))
  ok('sending without a day rate is refused', refused(await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: 0, p_expected_platform_pct: 30, p_expected_net_paise: 0 })))

  group('staff set day rates on the creators\' behalf (audited)')
  ok('a day rate below ₹1 or with paise is refused', refused(await staff.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1000050 })))
  const sr1 = await staff.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1000000 })
  const sr2 = await staff.rpc('experience_console_set_day_rate', { p_creator_id: D.id, p_day_rate_paise: 800000 })
  ok('staff set ₹10,000/day (Growth) and ₹8,000/day (Deals)', !sr1.error && !sr2.error, sr1.error?.message ?? sr2.error?.message ?? '')
  createdRates.push(sr1.data as string, sr2.data as string)
  const sr3 = await staff.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1000000 })
  ok('setting it again reprices the same package, not a second one', sr3.data === sr1.data)
  const audit = (await admin.from('ops_events').select('detail').eq('target_id', sr1.data as string).eq('action', 'creator.day_rate_set_by_staff')).data ?? []
  ok('each staff change is audited with the rate before and after', audit.length === 2 && (audit[0].detail as any).day_rate_paise_after === 1000000)
  legs = ((await staff.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const PG = leg(RG).day_rate_product_id, PD = leg(RD).day_rate_product_id
  ok('the console sees each creator\'s active day rate', Number(leg(RG).day_rate_paise) === 1000000 && Number(leg(RD).day_rate_paise) === 800000)
  const pool = ((await staff.rpc('experience_console_creator_pool')).data ?? []) as any[]
  ok('the creator pool (0536) shows staff each creator\'s day rate and track', Number(pool.find((p) => p.id === G.id)?.day_rate_paise) === 1000000 && pool.find((p) => p.id === D.id)?.track === 'deals')
  ok('the creator pool never lists the house creator', !pool.some((p) => p.id === (houseCreator ?? '')))

  group('reconcile on adjust: the total can never go past what was sold')
  const over = await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })
  ok('Growth creator up to 3 videos while the other still has 2 (5 of 4): refused', refused(over), over.error?.message ?? '')
  legs = ((await staff.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  ok('…and nothing was saved', leg(RG).leg_deliverables === null)
  const down = await staff.rpc('experience_console_leg_draft', { p_roster_id: RD, p_product_id: PD, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })
  ok('lowering the Deals creator to 1 video first is allowed (3 of 4, under)', !down.error && (down.data as any).over === false && (down.data as any).ok === false && (down.data as any).videos_placed === 3, down.error?.message ?? JSON.stringify(down.data))
  const up = await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })
  ok('then raising the Growth creator to 3 fits: 4 of 4, uneven creators, ok', !up.error && (up.data as any).ok === true, up.error?.message ?? JSON.stringify(up.data))
  ok('a Story over its own total (3 of 2) is refused per type', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RD, p_product_id: PD, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 2 }], p_affiliate_count: 1 })))

  group('affiliate is a flag on videos, never a deliverable of its own')
  ok('more affiliate videos than the leg\'s videos (4 of 3) is refused', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 4 })))
  ok('affiliate past the agreed total (2 + 1 = 3 of 2) is refused', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 2 })))
  ok('"Affiliate" is not a deliverable type', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Affiliate', count: 1 }], p_affiliate_count: 1 })))

  group('days drive money only; they never scale deliverables')
  const d3 = await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 3, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })
  ok('3 days instead of 2: still 4 of 4 videos placed', !d3.error && (d3.data as any).videos_placed === 4 && (d3.data as any).ok === true)
  ok('days with three decimals are refused', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 1.555, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })))
  ok("another creator's day rate cannot be used", refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PD, p_days: 3, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }], p_affiliate_count: 1 })))

  group('send: the money module, re-derived in the database, frozen')
  const tg = creatorLegTerms({ dayRatePaise: 1000000, days: 3, track: 'growth' })
  ok('money module: ₹10,000 × 3 = ₹30,000 → 30% → ₹21,000', tg.creatorGrossPaise === 3000000 && tg.platformPct === 30 && tg.creatorNetPaise === 2100000)
  ok('a tampered gross is refused', refused(await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: 2000000, p_expected_platform_pct: 30, p_expected_net_paise: 1400000 })))
  ok('the wrong track % (15 for a Growth creator) is refused', refused(await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: 3000000, p_expected_platform_pct: 15, p_expected_net_paise: 2550000 })))
  const sendG = await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: tg.creatorGrossPaise, p_expected_platform_pct: tg.platformPct, p_expected_net_paise: tg.creatorNetPaise })
  ok('send with the money module\'s figures succeeds', !sendG.error, sendG.error?.message ?? '')
  const DG = sendG.data as string; legDeals.push(DG)
  const td = creatorLegTerms({ dayRatePaise: 800000, days: 1, track: 'deals' })
  ok('money module: ₹8,000 × 1 → 15% → ₹6,800', td.creatorGrossPaise === 800000 && td.platformPct === 15 && td.creatorNetPaise === 680000)
  const sendD = await staff.rpc('experience_console_leg_send', { p_roster_id: RD, p_expected_gross_paise: td.creatorGrossPaise, p_expected_platform_pct: td.platformPct, p_expected_net_paise: td.creatorNetPaise })
  ok('the Deals creator\'s leg sends at 15%', !sendD.error, sendD.error?.message ?? '')
  const DD = sendD.data as string; legDeals.push(DD)

  const { data: dealRow } = await admin.from('deals').select('brand_id, creator_id, leg_role, experience_id, status, price_paise, payment_flow, track, experience_brand_name').eq('id', DG).single()
  ok('the leg is a deal on the house brand, to the creator, status negotiating', dealRow!.brand_id === houseBrand && dealRow!.creator_id === G.id && dealRow!.leg_role === 'creator_leg' && dealRow!.experience_id === E && dealRow!.status === 'negotiating')
  ok('no marketplace price on the leg; principal flow; creator track; brand name only', dealRow!.price_paise === null && dealRow!.payment_flow === 'guapd_principal_vendor_payout' && dealRow!.track === 'growth' && dealRow!.experience_brand_name === B.brands.name)
  const { data: items } = await admin.from('deal_deliverable_items').select('label, affiliate_link, added_by, visible_to_creator, price_paise').eq('deal_id', DG)
  ok('one item per unit: 3 UGC videos + 1 Story', (items ?? []).length === 4 && (items ?? []).filter((i) => i.label.startsWith('UGC video')).length === 3)
  ok('exactly 1 video carries the affiliate link, and never the Story', (items ?? []).filter((i) => i.affiliate_link).length === 1 && (items ?? []).every((i) => !i.affiliate_link || i.label.startsWith('UGC')))
  ok('items are Guapd\'s, visible to the creator, unpriced', (items ?? []).every((i) => i.added_by === 'guapd' && i.visible_to_creator && i.price_paise === null))
  const { data: terms } = await admin.from('experience_creator_terms').select('day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at').eq('deal_id', DG).single()
  ok('terms frozen: ₹10,000 × 3, 30% Growth, ₹30,000 → ₹21,000, from the package, locked',
    Number(terms!.day_rate_paise) === 1000000 && Number(terms!.days) === 3 && Number(terms!.creator_gross_paise) === 3000000 && Number(terms!.platform_pct) === 30
    && Number(terms!.creator_net_paise) === 2100000 && terms!.platform_track === 'growth' && terms!.product_id === PG && terms!.pricing_type === 'per_day' && !!terms!.locked_at, JSON.stringify(terms))
  ok('a locked term cannot be changed, even by the service role', refused(await admin.from('experience_creator_terms').update({ creator_net_paise: 2500000 }).eq('deal_id', DG)))
  ok('a per_day term whose gross is not day rate × days is refused (ect_gross_formula)', refused(await admin.from('experience_creator_terms').insert({
    deal_id: DD, experience_id: E, creator_id: D.id, day_rate_paise: 800000, days: 1, creator_gross_paise: 900000, platform_pct: 15, creator_net_paise: 765000, product_id: PD, pricing_type: 'per_day' })))
  ok('a sent leg cannot be re-drafted', refused(await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: PG, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 })))
  ok('…or sent twice', refused(await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: tg.creatorGrossPaise, p_expected_platform_pct: 30, p_expected_net_paise: tg.creatorNetPaise })))
  await staff.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1500000 })
  const t2 = (await admin.from('experience_creator_terms').select('day_rate_paise').eq('deal_id', DG).single()).data
  ok('changing the creator\'s day rate later does not move the sent leg', Number(t2!.day_rate_paise) === 1000000)
  const ev = (await admin.from('events').select('event_type, detail').eq('deal_id', DG).eq('event_type', 'experience.leg_sent')).data ?? []
  ok('the leg\'s timeline records the send with its terms', ev.length === 1 && (ev[0].detail as any).net_paise === 2100000)
  const sentAudit = (await admin.from('ops_events').select('detail').eq('target_id', DG).eq('action', 'experience.leg_sent')).data ?? []
  ok('ops_events records the send with gross and net before/after', sentAudit.length === 1 && (sentAudit[0].detail as any).gross_paise_after === 3000000 && (sentAudit[0].detail as any).net_paise_after === 2100000)

  group('the Experience brand (Kiro) sees no creator leg')
  const bd = await brand.from('deals').select('id').in('id', [DG, DD])
  ok('cannot read either leg deal', !bd.error && (bd.data ?? []).length === 0)
  const bt = await brand.from('experience_creator_terms').select('deal_id').eq('experience_id', E)
  ok('cannot read creator terms', !!bt.error || (bt.data ?? []).length === 0)
  ok('cannot read the roster leg columns', refused(await brand.from('experience_roster').select('leg_deliverables').eq('experience_id', E)))
  ok('cannot read the creator brief column', refused(await brand.from('experiences').select('creator_brief').eq('id', E)))
  ok('cannot read a creator\'s context', refused(await brand.rpc('creator_leg_context', { p_deal_id: DG })))
  const bp = await brand.from('creator_products').select('id, pricing_type').in('creator_id', [G.id, D.id])
  ok('cannot read either creator\'s day rate (marketplace packages only)', !bp.error && (bp.data ?? []).every((p: any) => p.pricing_type === 'per_deliverable'), JSON.stringify(bp.data))

  group('the creator: their own leg, their own terms, the curated brief only')
  await staff.rpc('experience_console_set_creator_brief', { p_experience_id: E, p_brief: 'Arrive 9am, bring two outfits.' })
  const ctx = await cg.rpc('creator_leg_context', { p_deal_id: DG })
  const cx = ctx.data as any
  ok('reads their context: brand name, shoot date and city, curated brief', !ctx.error && cx.brand_name === B.brands.name && cx.shoot_city === 'Mumbai' && cx.brief === 'Arrive 9am, bring two outfits.', ctx.error?.message ?? '')
  ok('their scope and terms: 3 UGC + 1 Story, 1 affiliate, ad rights on 3 videos for 3 months, ₹10,000 × 3 → 30% → ₹21,000',
    cx.videos === 3 && cx.affiliate_count === 1 && cx.ad_rights_months === 3 && cx.ad_rights_videos === 3 && Number(cx.gross_paise) === 3000000 && Number(cx.net_paise) === 2100000 && Number(cx.platform_pct) === 30)
  const keys = JSON.stringify(cx)
  ok('never the brand price, the brand\'s own brief, other creators or margin', !/brand_service_total|per_video|BRAND-INTERNAL|margin|roster|creator_count/.test(keys) && !keys.includes('350000'))
  ok("cannot read another creator's leg context", refused(await cg.rpc('creator_leg_context', { p_deal_id: DD })))
  const ot = await cg.from('experience_creator_terms').select('deal_id').in('deal_id', [DG, DD])
  ok('reads only their own terms row', !ot.error && (ot.data ?? []).length === 1 && ot.data![0].deal_id === DG)
  const od = await cg.from('deals').select('id').eq('id', DD)
  ok("cannot read another creator's leg deal", !od.error && (od.data ?? []).length === 0)
  const ce = await cg.from('experiences').select('id').eq('id', E)
  ok('cannot read the Experience row', !!ce.error || (ce.data ?? []).length === 0)
  const cr = await cg.from('experience_roster').select('id').eq('experience_id', E)
  ok('cannot read the roster', !!cr.error || (cr.data ?? []).length === 0)
  const cpo = await cg.from('creator_products').select('id, pricing_type').eq('creator_id', D.id)
  ok("cannot read another creator's day rate", !cpo.error && (cpo.data ?? []).every((p: any) => p.pricing_type === 'per_deliverable'))

  group('the creator cannot write to a leg except accept / decline')
  ok('cannot accept through the marketplace path (a direct status update): refused by the leg guard', refusedBy(await cg.from('deals').update({ status: 'agreed' }).eq('id', DG), LEG_GUARD))
  ok('…nor accept with a price of their own (passes the marketplace guard, stopped by the leg guard)', refusedBy(await cg.from('deals').update({ status: 'agreed', price_paise: 1 }).eq('id', DG), LEG_GUARD))
  ok('cannot set a price directly (stopped first by the marketplace guard)', refused(await cg.from('deals').update({ price_paise: 1 }).eq('id', DG)))
  ok('cannot post a message on the leg', refusedBy(await cg.from('messages').insert({ deal_id: DG, body: 'hi', sender_party: 'creator' }), LEG_GUARD))
  const anyItem = (await admin.from('deal_deliverable_items').select('id').eq('deal_id', DG).limit(1).single()).data!
  ok('cannot submit or change an item', refusedBy(await cg.from('deal_deliverable_items').update({ external_url: 'https://x.y' }).eq('id', anyItem.id), LEG_GUARD))
  ok('cannot upload a deliverable', refusedBy(await cg.from('deliverables').insert({ deal_id: DG, version: 1, external_url: 'https://x.y' }), LEG_GUARD))
  ok('no invoice can be raised on a leg, even by the service role', refusedBy(await admin.from('invoices').insert({ deal_id: DG, status: 'draft' }), /No invoice/))
  ok('a leg cannot be marked paid, even by the service role', refusedBy(await admin.from('deals').update({ status: 'paid' }).eq('id', DG), /No payment/))
  ok("another creator cannot answer this leg", refused(await cd.rpc('creator_leg_respond', { p_deal_id: DG, p_accept: true, p_reason: null })))
  const acc = await cg.rpc('creator_leg_respond', { p_deal_id: DG, p_accept: true, p_reason: null })
  ok('the creator accepts their own leg', !acc.error && acc.data === 'agreed', acc.error?.message ?? '')
  ok('…once', refused(await cg.rpc('creator_leg_respond', { p_deal_id: DG, p_accept: false, p_reason: null })))
  const accRow = (await admin.from('deals').select('status, agreed_at, rights_confirmed_at').eq('id', DG).single()).data!
  ok('accepting records agreed_at and the rights confirmation', accRow.status === 'agreed' && !!accRow.agreed_at && !!accRow.rights_confirmed_at)

  group('a decline frees that creator\'s videos')
  const dec = await cd.rpc('creator_leg_respond', { p_deal_id: DD, p_accept: false, p_reason: 'Dates clash' })
  ok('the Deals creator declines', !dec.error && dec.data === 'declined', dec.error?.message ?? '')
  rec = (await staff.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data as any
  ok('their 1 video, 1 Story and 1 affiliate drop out: 3 of 4 placed, still not over', rec.videos_placed === 3 && rec.affiliate_placed === 1 && rec.over === false && rec.ok === false, JSON.stringify(rec))

  group('the shoot package itself (creator side)')
  const own = await cg.from('creator_products').select('id, pricing_type, price_paise').eq('creator_id', G.id).eq('pricing_type', 'per_day').eq('is_active', true)
  ok('the creator reads their own day rate', !own.error && (own.data ?? []).length === 1 && Number(own.data![0].price_paise) === 1500000)
  ok('a second active day rate is refused', refused(await cg.from('creator_products').insert({ creator_id: G.id, pricing_type: 'per_day', product_type: 'Shoot day', price_paise: 500000, price_mode: 'exact', display_price: false })))
  ok('a day rate shown as a range is refused', refused(await admin.from('creator_products').update({ price_mode: 'range', price_max_paise: 2000000 }).eq('id', PG)))
  ok('a day rate can never be price-displayed (0535)', refused(await admin.from('creator_products').update({ display_price: true }).eq('id', PG)))
  ok('a marketplace package still needs its channel', refused(await cg.from('creator_products').insert({ creator_id: G.id, product_type: 'Instagram Reel', price_paise: 500000, price_mode: 'exact' })))
  const anonP = await anon.from('creator_products').select('id').eq('creator_id', G.id)
  ok('anonymous reads no packages at all', !!anonP.error || (anonP.data ?? []).length === 0)

  group('the public storefront never lists a day rate')
  const { data: sfs } = await admin.from('creator_storefronts').select('slug, creator_id').eq('is_published', true).eq('show_rates', true).limit(1)
  if (sfs?.[0]) {
    const tmp = await admin.from('creator_products').insert({ creator_id: sfs[0].creator_id, pricing_type: 'per_day', product_type: 'Shoot day', price_paise: 4200000, price_mode: 'exact', display_price: false, is_active: false }).select('id').single()
    if (tmp.data) createdRates.push(tmp.data.id)
    // Active only if that creator has none active already.
    if (tmp.data) await admin.from('creator_products').update({ is_active: true }).eq('id', tmp.data.id)
    const sf = await anon.rpc('get_public_storefront', { p_slug: sfs[0].slug })
    ok('get_public_storefront: no "Shoot day" and no day-rate figure in packages', !sf.error && !JSON.stringify((sf.data as any)?.packages ?? []).includes('Shoot day') && !JSON.stringify(sf.data ?? {}).includes('4200000'), sf.error?.message ?? '')
  } else ok('get_public_storefront check skipped: no published storefront', true)

  group('audit')
  const acts = new Set(((await admin.from('ops_events').select('action').eq('actor_auth_id', STAFF.auth_id).gte('created_at', startedAt)).data ?? []).map((a) => a.action))
  for (const a of ['creator.day_rate_set_by_staff', 'experience.leg_drafted', 'experience.leg_sent', 'experience.creator_brief_set']) ok(`ops_events has ${a}`, acts.has(a))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (E) {
    await admin.from('experience_roster').update({ leg_deal_id: null }).eq('experience_id', E)
    if (legDeals.length) {
      await admin.from('notifications').delete().in('deal_id', legDeals)
      await admin.from('deals').delete().in('id', legDeals)
    }
    const { data: qids } = await admin.from('experience_quotes').select('id').eq('experience_id', E)
    const { data: rids } = await admin.from('experience_roster').select('id').eq('experience_id', E)
    await admin.from('ops_events').delete().in('target_id', [E, ...legDeals, ...(qids ?? []).map((x) => x.id), ...(rids ?? []).map((x) => x.id), ...createdRates])
    await admin.from('experiences').delete().eq('id', E)
  }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates)
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  if (staffUserId) {
    await admin.from('ops_events').delete().eq('actor_auth_id', (await admin.from('users').select('auth_id').eq('id', staffUserId).single()).data?.auth_id ?? '').gte('created_at', startedAt)
    await admin.from('notifications').delete().eq('user_id', staffUserId).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', staffUserId)
  }
  const left = await admin.from('experiences').select('id').like('title', '[legs-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
