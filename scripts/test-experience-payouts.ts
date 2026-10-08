/**
 * 0540, creator payouts and the completion gate, against STAGING with real
 * sessions: operational access, eligibility (shot, accepted, their part
 * complete), the locked net as the amount, TDS as a field, one live payout per
 * creator deal, maker-checker approval, paid outside the app with date,
 * method, UTR and proof, cancel and re-request, the creator's statement
 * (their own only), the P&L's cash out, and Complete gated on deliverables
 * approved as sold + every invoice paid + every creator paid + the brand's
 * sign-off + Guapd's (the Complete itself); reopen clears both sign-offs.
 *
 * Two temporary staff grants, removed after; everything made is deleted.
 * No action-layer code runs, so no one is notified.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-payouts.ts
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
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.users?.auth_id)
  const X = pool.find((c) => c.id !== G?.id && c.id !== D?.id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
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
  const one = await buildExperience(op, fin, B.brand_id, '[pay-test] Kiro', [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }, { id: X.id, rate: 500000 }], [{ type: 'UGC video', count: 1 }])
  const E = one.E, legOf = (w: { id: string }) => one.deal[w.id], rosterOf = (w: { id: string }) => one.roster[w.id]
  await admin.from('deals').update({ status: 'agreed' }).in('id', [legOf(G), legOf(D), legOf(X)])
  const sch = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  if (sch.error) throw new Error('schedule: ' + sch.error.message)
  const payouts = async (s: SupabaseClient = op) => (await s.rpc('experience_console_payouts', { p_experience_id: E })).data as any
  const legRow = async (w: { id: string }) => ((await payouts()).legs as any[]).find((l) => l.deal_id === legOf(w))

  group('access: payouts are operational; nobody else')
  for (const [n, s] of [['no access', none], ['brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: the payouts screen and a request are refused`, refused(await (s as SupabaseClient).rpc('experience_console_payouts', { p_experience_id: E }))
      && refused(await (s as SupabaseClient).rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: 0 })))
  }
  for (const [n, s] of [['operational staff', op], ['financial staff', fin], ['creator', creator], ['brand', brand]] as const) {
    let all = true
    for (const t of ['vendor_payouts', 'vendors', 'vendor_payout_details']) {
      const r = await (s as SupabaseClient).from(t).select('*').limit(1)
      if (!r.error && (r.data ?? []).length > 0) all = false
    }
    ok(`${n}: payout tables are not readable directly`, all)
  }

  group('eligibility: shot, accepted, their part complete')
  ok('before the shoot outcome: refused', said(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: 0 }), /accepted and shot/))
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  for (const w of [G, D]) await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(w), p_outcome: 'done', p_reason: null })
  await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(X), p_outcome: 'did_not_shoot', p_reason: 'Fell ill on the day' })
  ok('a creator who did not shoot is never paid', said(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(X), p_tds_paise: 0 }), /accepted and shot/))
  // A creator-submit leg whose deliverables Guapd has not approved: not complete, not payable.
  const { data: dDeal } = await admin.from('deals').select('settings_snapshot').eq('id', legOf(D)).single()
  await admin.from('deals').update({ settings_snapshot: { ...(dDeal!.settings_snapshot as object), deliverables_owner: 'creator', completion_trigger: 'on_delivery_accepted' } }).eq('id', legOf(D))
  ok("creator-submit, deliverables not yet approved by Guapd: refused", said(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(D), p_tds_paise: 0 }), /not complete/))
  await admin.from('deals').update({ settings_snapshot: dDeal!.settings_snapshot }).eq('id', legOf(D))
  ok('NULL TDS is refused (0 must be said)', said(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: null }), /TDS/))
  ok('negative TDS is refused', refused(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: -1 })))
  const gTerms = (await admin.from('experience_creator_terms').select('creator_gross_paise, platform_pct, creator_net_paise').eq('deal_id', legOf(G)).single()).data as any
  ok('TDS above the net is refused', refused(await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: Number(gTerms.creator_net_paise) + 1 })))

  group('request: the locked net, never typed; one live payout per creator')
  const rq = await op.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: 70000 })
  ok('operational staff request G\'s payout with ₹700 TDS', !rq.error, rq.error?.message ?? '')
  const PG = rq.data as string
  let pr = (await admin.from('vendor_payouts').select('status, reason, gross_paise, platform_pct, platform_fee_paise, amount_paise, tds_paise, net_amount_paise, idempotency_key, created_by').eq('id', PG).single()).data as any
  ok('the statement is G\'s locked terms: gross → 30% → net, then TDS', Number(pr.gross_paise) === Number(gTerms.creator_gross_paise) && Number(pr.platform_pct) === 30
    && Number(pr.amount_paise) === Number(gTerms.creator_net_paise) && Number(pr.platform_fee_paise) === Number(gTerms.creator_gross_paise) - Number(gTerms.creator_net_paise)
    && Number(pr.net_amount_paise) === Number(gTerms.creator_net_paise) - 70000, JSON.stringify(pr))
  ok('its duplicate key names the deal and attempt 1', pr.idempotency_key === `creator_fee:${legOf(G)}:1`)
  ok('a second request for G is refused', said(await fin.rpc('experience_console_payout_request', { p_deal_id: legOf(G), p_tds_paise: 0 }), /already has a payout/))
  ok('…and the database refuses a second live one even from the service role', refused(await admin.from('vendor_payouts').insert({ experience_id: E, deal_id: legOf(G), vendor_id: (await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id,
    reason: 'creator_fee', gross_paise: pr.gross_paise, platform_pct: pr.platform_pct, platform_fee_paise: pr.platform_fee_paise, amount_paise: pr.amount_paise, net_amount_paise: pr.amount_paise, idempotency_key: `dup-${E}` })))
  ok('a payout that is not the creator\'s locked terms is refused by the database', refused(await admin.from('vendor_payouts').insert({ experience_id: E, deal_id: legOf(D), vendor_id: (await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id,
    reason: 'creator_fee', gross_paise: 999999, platform_pct: 30, platform_fee_paise: 299999, amount_paise: 700000, net_amount_paise: 700000, idempotency_key: `bad-${E}` })))
  ok('TDS can change while requested', !refused(await op.rpc('experience_console_payout_set_tds', { p_payout_id: PG, p_tds_paise: 100000 }))
    && Number((await admin.from('vendor_payouts').select('net_amount_paise').eq('id', PG).single()).data!.net_amount_paise) === Number(gTerms.creator_net_paise) - 100000)

  group('maker-checker: a different person approves')
  ok('the requester cannot approve their own payout', said(await op.rpc('experience_console_payout_approve', { p_payout_id: PG }), /different person/))
  ok('…and the database refuses it even from the service role', refused(await admin.from('vendor_payouts').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: pr.created_by }).eq('id', PG).select('id')))
  ok('recording paid before approval is refused', said(await op.rpc('experience_console_payout_paid', { p_payout_id: PG, p_paid_on: istToday(), p_method: 'upi', p_reference: 'UTR-PAY-1', p_proof_path: 'x' }), /approved before/))
  ok('a proof slot before approval is refused', refused(await op.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: PG, p_file_name: 'proof.png' })))
  ok('someone else (finance) approves', !refused(await fin.rpc('experience_console_payout_approve', { p_payout_id: PG })))
  ok('approving twice is refused', refused(await fin.rpc('experience_console_payout_approve', { p_payout_id: PG })))
  ok('after approval the TDS is frozen', refused(await op.rpc('experience_console_payout_set_tds', { p_payout_id: PG, p_tds_paise: 0 }))
    && refused(await admin.from('vendor_payouts').update({ tds_paise: 0, net_amount_paise: pr.amount_paise }).eq('id', PG).select('id')))

  group('paid outside the app: date, method, UTR, proof')
  const sl = await op.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: PG, p_file_name: 'bank transfer.pdf' })
  ok('the proof slot is the payout\'s own path', String(sl.data).startsWith(`payout-proof/${PG}/`), String(sl.data ?? sl.error?.message))
  const paidArgs = (o: Record<string, unknown> = {}) => ({ p_payout_id: PG, p_paid_on: istToday(), p_method: 'bank_transfer', p_reference: 'UTR-PAY-G1', p_proof_path: sl.data, ...o })
  ok('before the proof is uploaded: refused', said(await op.rpc('experience_console_payout_paid', paidArgs()), /proof/))
  await admin.storage.from('finance-docs').upload(sl.data as string, Buffer.from('%PDF'), { contentType: 'application/pdf' }); uploaded.push(sl.data as string)
  ok('NULL date, NULL method, a future date and no reference are each refused',
    refused(await op.rpc('experience_console_payout_paid', paidArgs({ p_paid_on: null }))) && refused(await op.rpc('experience_console_payout_paid', paidArgs({ p_method: null })))
    && refused(await op.rpc('experience_console_payout_paid', paidArgs({ p_paid_on: '2099-01-01' }))) && refused(await op.rpc('experience_console_payout_paid', paidArgs({ p_reference: '' }))))
  ok('a cheque is not a payout method', refused(await op.rpc('experience_console_payout_paid', paidArgs({ p_method: 'cheque' }))))
  const pd = await op.rpc('experience_console_payout_paid', paidArgs())
  ok('recorded paid (the requester may record it once someone else approved)', !pd.error, pd.error?.message ?? '')
  pr = (await admin.from('vendor_payouts').select('status, external_ref, paid_on, method, proof_path, approved_by, created_by').eq('id', PG).single()).data as any
  ok('paid, with its reference, date, method and proof', pr.status === 'paid' && pr.external_ref === 'UTR-PAY-G1' && pr.paid_on === istToday() && pr.method === 'bank_transfer' && pr.proof_path === sl.data && pr.approved_by !== pr.created_by)
  ok('a paid payout is final (no cancel, no edit even by the service role)', refused(await op.rpc('experience_console_payout_cancel', { p_payout_id: PG, p_reason: 'test test' }))
    && refused(await admin.from('vendor_payouts').update({ external_ref: 'OTHER' }).eq('id', PG).select('id')))
  const { data: evs } = await admin.from('events').select('event_type, detail').eq('deal_id', legOf(G)).eq('event_type', 'experience.payout_paid')
  ok('it is on G\'s deal timeline (reference, no amounts)', (evs ?? []).length === 1 && !/paise|amount/.test(JSON.stringify(evs![0].detail)))

  group("the creator's statement (their own, only)")
  const ctx = (await creator.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  const PK = ['gross_paise', 'net_paise', 'paid_on', 'paid_paise', 'platform_fee_paise', 'platform_pct', 'reference', 'status', 'tds_paise'].join(',')
  ok('G sees exactly: gross → 30% fee → net → TDS → paid, the date and the reference', ctx.payout && Object.keys(ctx.payout).sort().join(',') === PK
    && ctx.payout.status === 'paid' && Number(ctx.payout.platform_pct) === 30 && Number(ctx.payout.tds_paise) === 100000 && ctx.payout.reference === 'UTR-PAY-G1', JSON.stringify(ctx.payout))
  ok('…never the proof, who requested or approved it, or the vendor', !/proof|approved_by|requested|vendor|payout-proof/.test(JSON.stringify(ctx)))
  ok("G cannot read D's leg (or payout)", refused(await creator.rpc('creator_leg_context', { p_deal_id: legOf(D) })))
  ok('D has no payout yet', ((await creatorD.rpc('creator_leg_context', { p_deal_id: legOf(D) })).data as any).payout === null)
  ok('the creator cannot open the proof', refused(await creator.rpc('experience_console_finance_file', { p_kind: 'payout-proof', p_id: PG })))
  ok('operational staff can open it', !refused(await op.rpc('experience_console_finance_file', { p_kind: 'payout-proof', p_id: PG })))

  group('cancel and request again (a new duplicate key)')
  const rqD = await fin.rpc('experience_console_payout_request', { p_deal_id: legOf(D), p_tds_paise: 0 })
  ok('finance requests D\'s payout', !rqD.error, rqD.error?.message ?? '')
  ok('cancel needs a reason', refused(await fin.rpc('experience_console_payout_cancel', { p_payout_id: rqD.data, p_reason: '' })))
  ok('cancelled with a reason', !refused(await fin.rpc('experience_console_payout_cancel', { p_payout_id: rqD.data, p_reason: 'TDS entered wrongly' })))
  ok('a cancelled payout is final', refused(await fin.rpc('experience_console_payout_approve', { p_payout_id: rqD.data })))
  const rqD2 = await fin.rpc('experience_console_payout_request', { p_deal_id: legOf(D), p_tds_paise: 0 })
  ok('a new request is allowed, with attempt 2 in its key', !rqD2.error && (await admin.from('vendor_payouts').select('idempotency_key').eq('id', rqD2.data as string).single()).data?.idempotency_key === `creator_fee:${legOf(D)}:2`)
  const PD = rqD2.data as string
  ok('the screen shows it, and that finance requested it (so finance cannot approve)', await (async () => { const l = await legRow(D); return l.payout.id === PD && (await fin.rpc('experience_console_payouts', { p_experience_id: E }).then((r) => ((r.data as any).legs as any[]).find((x) => x.deal_id === legOf(D)).payout.i_requested)) === true && l.cancelled_before === 1 })())

  group('the P&L: cash out to creators')
  const p = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('paid out = what left Guapd for G; one paid, one still to pay (X did not shoot)', Number(p.creator_paid_out_paise) === Number(gTerms.creator_net_paise) - 100000
    && Number(p.creator_tds_withheld_paise) === 100000 && p.creator_payouts_paid === 1 && p.creator_payouts_due === 1, JSON.stringify({ a: p.creator_paid_out_paise, b: p.creator_payouts_paid, c: p.creator_payouts_due }))
  ok('operational staff still cannot read the P&L', refused(await op.rpc('experience_pnl', { p_experience_id: E })))

  group('completion: delivered as sold + invoices paid + creators paid + both sign-offs')
  // Deliver: Guapd attaches and approves G's and D's video, shares them, the brand approves both.
  // Sold 3 videos, X did not shoot: the sale was revised to 2 (the plan the readiness check reads).
  const { data: ex } = await admin.from('experiences').select('agreed_plan').eq('id', E).single()
  const plan = ex!.agreed_plan as any
  await admin.from('experiences').update({ agreed_plan: { ...plan, videos_sold: 2, plan_videos: 2, creator_count: 2, totals: [{ type: 'UGC video', per_creator: 1, total: 2 }] } }).eq('id', E)
  let dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  const itemOf = (w: { id: string }) => ((dv.legs as any[]).find((l) => l.creator_id === w.id).items as any[])[0]
  for (const w of [G, D]) {
    await op.rpc('experience_console_item_attach', { p_item_id: itemOf(w).id, p_url: `https://drive.example.com/${w.id}`, p_storage_path: null, p_file_name: null })
    await fin.rpc('experience_console_item_review', { p_item_id: itemOf(w).id, p_decision: 'approve', p_note: null })
  }
  await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [itemOf(G).id, itemOf(D).id] })
  const comp = async () => (await op.rpc('experience_console_completion', { p_experience_id: E })).data as any
  let c = await comp()
  ok('Delivering, nothing else done: not ready, every blocker listed', c.status === 'delivering' && c.can_complete === false && !c.deliverables_ok && !c.invoices_ok && !c.payouts_ok && !c.brand_signed_off, JSON.stringify(c.blockers))
  ok('Complete is refused, saying why', said(await op.rpc('experience_console_complete', { p_experience_id: E }), /Not ready to complete.*approved everything sold.*No invoice.*not paid.*not signed off/))
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  for (const w of [G, D]) await op.rpc('experience_console_release_decide', { p_release_id: itemOf(w).release.id, p_decision: 'approved', p_channel: 'whatsapp', p_note: null })
  c = await comp()
  ok('the brand approved what was sold: deliverables done', c.deliverables_ok === true && c.can_complete === false)
  const fi1 = await fixtureInvoice(admin, { experienceId: E, brandId: B.brand_id, kind: 'initial', subtotalPaise: 7000000, status: 'issued' }); invoices.push(fi1.id)
  const fi2 = await fixtureInvoice(admin, { experienceId: E, brandId: B.brand_id, kind: 'additional', source: 'existing_footage', subtotalPaise: 100000 }); invoices.push(fi2.id)
  c = await comp()
  ok('an issued, unpaid invoice and a draft both block', c.invoices_ok === false && c.invoices_unpaid === 1 && c.invoices_draft === 1)
  await admin.from('service_invoices').update({ status: 'paid', payment_reference: 'UTR-BRAND', paid_at: new Date().toISOString() }).eq('id', fi1.id)
  await admin.from('service_invoices').delete().eq('id', fi2.id)
  c = await comp()
  ok('every invoice paid, no draft: invoices done', c.invoices_ok === true)
  ok('one creator still unpaid: payouts not done', c.payouts_ok === false && c.creators_to_pay === 2 && c.creators_paid === 1)
  await op.rpc('experience_console_payout_approve', { p_payout_id: PD })
  const sl2 = await fin.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: PD, p_file_name: 'd.png' })
  await admin.storage.from('finance-docs').upload(sl2.data as string, Buffer.from('png'), { contentType: 'image/png' }); uploaded.push(sl2.data as string)
  await fin.rpc('experience_console_payout_paid', { p_payout_id: PD, p_paid_on: istToday(), p_method: 'upi', p_reference: 'UPI-D-1', p_proof_path: sl2.data })
  c = await comp()
  ok('both who shot are paid (the one who did not shoot needs nothing): payouts done', c.payouts_ok === true && c.creators_paid === 2)
  ok('still refused without the brand\'s sign-off', said(await op.rpc('experience_console_complete', { p_experience_id: E }), /not signed off/))
  ok('a sign-off needs the channel (NULL refused, "portal" refused)', refused(await op.rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: null, p_note: null }))
    && refused(await op.rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: 'portal', p_note: null })))
  for (const [n, s] of [['brand', brand], ['creator', creator], ['no access', none]] as const) {
    ok(`${n}: cannot record a sign-off or complete`, refused(await (s as SupabaseClient).rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: 'email', p_note: null }))
      && refused(await (s as SupabaseClient).rpc('experience_console_complete', { p_experience_id: E })))
  }
  ok('staff record the brand\'s sign-off (email)', !refused(await op.rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: 'email', p_note: 'All good from our side' })))
  ok('recording it twice is refused', refused(await op.rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: 'email', p_note: null })))
  ok('clearing it needs a reason', refused(await op.rpc('experience_console_brand_signoff_clear', { p_experience_id: E, p_reason: '' })))
  ok('cleared with a reason, then recorded again', !refused(await op.rpc('experience_console_brand_signoff_clear', { p_experience_id: E, p_reason: 'Recorded too early' }))
    && !refused(await op.rpc('experience_console_brand_signoff', { p_experience_id: E, p_channel: 'call', p_note: null })))
  c = await comp()
  ok('everything holds: ready to complete', c.can_complete === true && c.blockers.filter((b: string) => !/from Delivering/.test(b)).length === 0, JSON.stringify(c.blockers))
  ok('Complete (Guapd\'s sign-off)', !refused(await op.rpc('experience_console_complete', { p_experience_id: E })))
  const { data: done } = await admin.from('experiences').select('status, guapd_signoff_at, guapd_signoff_by, brand_signoff_channel').eq('id', E).single()
  ok('complete, with both sign-offs on record', done!.status === 'complete' && !!done!.guapd_signoff_at && done!.guapd_signoff_by === OP.id && done!.brand_signoff_channel === 'call')
  ok('the P&L is final', ((await fin.rpc('experience_pnl', { p_experience_id: E })).data as any).source === 'snapshot')
  ok('no payout, payment or sign-off change on a Complete Experience', refused(await op.rpc('experience_console_brand_signoff_clear', { p_experience_id: E, p_reason: 'test test' })))
  ok('operational staff cannot reopen', refused(await op.rpc('experience_console_reopen', { p_experience_id: E, p_reason: 'Late cost' })))
  ok('finance reopens with a reason: BOTH sign-offs are cleared', !refused(await fin.rpc('experience_console_reopen', { p_experience_id: E, p_reason: 'Late makeup invoice' }))
    && await (async () => { const { data: r } = await admin.from('experiences').select('status, brand_signoff_at, guapd_signoff_at').eq('id', E).single(); return r!.status === 'delivering' && r!.brand_signoff_at === null && r!.guapd_signoff_at === null })())
  ok('…so completing again needs the brand\'s sign-off again', said(await op.rpc('experience_console_complete', { p_experience_id: E }), /not signed off/))

  group('audit: every payout and sign-off action, no amounts')
  const { data: ev } = await admin.from('ops_events').select('action, detail').in('actor_auth_id', [OP.auth_id, FIN.auth_id]).gte('created_at', startedAt)
  const acts = new Set((ev ?? []).map((e) => e.action))
  for (const a of ['experience.payout_requested', 'experience.payout_tds_set', 'experience.payout_approved', 'experience.payout_paid', 'experience.payout_cancelled',
    'experience.brand_signoff_recorded', 'experience.brand_signoff_cleared', 'experience.completed', 'experience.reopened']) ok(`audited: ${a}`, acts.has(a))
  const mine = (ev ?? []).filter((e) => /payout|signoff|completed|reopened/.test(e.action))
  ok('none of these audit rows carries an amount', mine.length > 0 && !mine.some((e) => /paise|amount|total|price|tds_/i.test(Object.keys(e.detail as object).join(' '))))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (uploaded.length) await admin.storage.from('finance-docs').remove(uploaded)
  for (const E of exps) {
    await admin.from('vendor_payouts').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
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
  const left = await admin.from('experiences').select('id').like('title', '[pay-test]%')
  const files = uploaded.length ? (await admin.storage.from('finance-docs').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
