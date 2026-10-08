/**
 * 0537: the cost sheet, the margin / P&L, and the brand price as finance-only,
 * against STAGING with real sessions. Two temporary staff grants (one
 * operational-only, one financial), removed after; everything made is deleted.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-costs-pnl.ts
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
import { creatorLegTerms, costLineTotalPaise, experienceMargin } from '../apps/web/lib/experience-money'
import { fixtureInvoice } from './fixture-invoice'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
let E = '', startedAt = ''
const grants: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []
const invoices: string[] = []

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
const pnlOf = async (s: SupabaseClient) => (await s.rpc('experience_pnl', { p_experience_id: E })).data as any
const stored = async () => (await admin.from('experience_pnl_snapshots').select('pnl, guapd_margin_paise, is_final, refreshed_reason').eq('experience_id', E).maybeSingle()).data as any

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd, name)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const rest = pool.filter((c) => c.id !== G?.id)
  const D = rest.find((c) => c.vetting_status !== 'growth' && c.users?.auth_id)
  const [X, Y] = rest.filter((c) => c.id !== D?.id).slice(0, 2)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(160)
  const [OP, FIN, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !X || !Y || !OP || !FIN || !NONE) throw new Error('missing test actors')

  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(G.users.auth_id)
  const anon = createClient(URL, ANON)

  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id, Y.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id, X.id, Y.id]).eq('pricing_type', 'per_day')

  // An Experience: 4 creators × 1 UGC video, sold 4.
  const c = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[costs-test] Kiro shoot', p_creator_count: 4, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  E = c.data as string

  group('the brand price is finance only (decision c)')
  const qArgs = { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: 'Our price is ₹35,000 a video', p_channel: null }
  ok('operational staff cannot send a quote', refused(await op.rpc('experience_console_quote', qArgs)))
  const q = await fin.rpc('experience_console_quote', qArgs)
  ok('financial staff can', !q.error, q.error?.message ?? '')
  ok('operational staff cannot accept the price', refused(await op.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })))
  const qo = ((await op.rpc('experience_console_quotes', { p_experience_id: E })).data ?? []) as any[]
  ok('operational staff see the quote with no amounts and no message', qo.length === 1 && qo[0].total_paise === null && qo[0].per_video_paise === null && qo[0].message === null && qo[0].deliverable_count === 4)
  const qf = ((await fin.rpc('experience_console_quotes', { p_experience_id: E })).data ?? []) as any[]
  ok('financial staff see the amounts and message', Number(qf[0].total_paise) === 14000000 && qf[0].message?.includes('35,000'))
  await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  const go = (await op.rpc('experience_console_get', { p_experience_id: E })).data as any
  const gf = (await fin.rpc('experience_console_get', { p_experience_id: E })).data as any
  ok('operational: can_see_brand_price false, every brand money field null', go.can_see_brand_price === false && go.brand_service_total_paise === null && go.brand_per_video_paise === null && go.brand_misc_paise === null)
  ok('…but still sees the plan, date and city', go.agreed_plan?.videos_sold === 4 && go.shoot_city === 'Mumbai')
  ok('financial: sees the brand price', gf.can_see_brand_price === true && Number(gf.brand_service_total_paise) === 14000000)
  ok('operational staff are refused the P&L', refused(await op.rpc('experience_pnl', { p_experience_id: E })))

  // Roster and legs (operational work).
  await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id, X.id, Y.id], p_added_by: 'guapd', p_channel: null })
  let roster = ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  for (const r of roster) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  const lk = await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  if (lk.error) throw new Error('lock: ' + lk.error.message)
  const rates: Record<string, number> = { [G.id]: 1000000, [D.id]: 800000, [X.id]: 500000, [Y.id]: 600000 }
  const days: Record<string, number> = { [G.id]: 3, [D.id]: 1, [X.id]: 1, [Y.id]: 1 }
  for (const id of Object.keys(rates)) { const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: id, p_day_rate_paise: rates[id] }); createdRates.push(s.data as string) }
  let legs = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const dealOf: Record<string, string> = {}
  const net: Record<string, number> = {}, gross: Record<string, number> = {}
  for (const l of legs) {
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: days[l.creator_id], p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 })
    const t = creatorLegTerms({ dayRatePaise: rates[l.creator_id], days: days[l.creator_id], track: l.track })
    const s = await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    dealOf[l.creator_id] = s.data as string; legDeals.push(s.data as string); net[l.creator_id] = t.creatorNetPaise; gross[l.creator_id] = t.creatorGrossPaise
  }

  group('only ACCEPTED legs count (decision b)')
  let p = await pnlOf(fin)
  ok('all four sent, none answered: no creator cost counted', Number(p.creator_net_total_paise) === 0 && p.legs_counted === 0 && p.legs_awaiting === 4, JSON.stringify({ n: p.creator_net_total_paise, a: p.legs_awaiting }))
  await admin.from('deals').update({ status: 'agreed' }).in('id', [dealOf[G.id], dealOf[D.id]])
  await admin.from('deals').update({ status: 'declined' }).eq('id', dealOf[Y.id])
  p = await pnlOf(fin)
  ok('two accepted count; one awaiting and one declined do not', p.legs_counted === 2 && p.legs_awaiting === 1 && p.legs_declined === 1 && Number(p.creator_net_total_paise) === net[G.id] + net[D.id])
  ok('the awaiting one is shown as a footnote figure only', Number(p.awaiting_net_paise) === net[X.id])

  group('revenue = invoiced; honest ₹0 before any invoice (decision a)')
  ok('no invoice: revenue ₹0, pending invoice, the agreed price is NOT substituted', Number(p.brand_revenue_paise) === 0 && p.revenue_pending_invoice === true && Number(p.brand_agreed_paise) === 14000000)

  group('the cost sheet (operational)')
  const add = (s: SupabaseClient, extra: Record<string, unknown>) => s.rpc('experience_console_cost_add', {
    p_experience_id: E, p_label: 'Makeup artist', p_category: 'makeup', p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null,
    p_total_paise: 900000, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null, ...extra })
  for (const [n, s] of [['no access', none], ['brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: cost sheet read and write refused`, refused(await (s as SupabaseClient).rpc('experience_console_costs', { p_experience_id: E })) && refused(await add(s as SupabaseClient, {})))
  }
  const c1 = await add(op, {})
  ok('operational staff add a ₹9,000 makeup cost', !c1.error, c1.error?.message ?? '')
  const perUnit = costLineTotalPaise({ quantity: 2.5, unitRatePaise: 120033 })
  ok('per-unit total computed half up (2.5 × ₹1,200.33 = ₹3,000.83)', perUnit === 300083)
  ok('a tampered per-unit total is refused', refused(await add(op, { p_label: 'Studio', p_category: 'studio', p_basis: 'per_unit', p_quantity: 2.5, p_unit_rate_paise: 120033, p_total_paise: 300000 })))
  const c2 = await add(op, { p_label: 'Studio', p_category: 'studio', p_basis: 'per_unit', p_quantity: 2.5, p_unit_rate_paise: 120033, p_total_paise: perUnit })
  ok('the correct per-unit total is stored', !c2.error, c2.error?.message ?? '')
  for (const cat of ['day_rate', 'per_video', 'retainer']) ok(`creator-pay category "${cat}" is refused (no double count)`, refused(await add(op, { p_category: cat })))
  const cb = await add(op, { p_label: 'Outfits', p_category: 'styling', p_total_paise: 200000, p_provided_by: 'brand' })
  ok('a brand-provided item can be noted', !cb.error)
  const { data: otherLeg } = await admin.from('deals').select('id').eq('leg_role', 'creator_leg').neq('experience_id', E).limit(1)
  if (otherLeg?.[0]) ok("another Experience's creator cannot be linked", refused(await add(op, { p_creator_leg_deal_id: otherLeg[0].id })))
  ok("this Experience's creator can be linked (their travel)", !refused(await add(op, { p_label: 'Travel for G', p_category: 'travel', p_total_paise: 250000, p_creator_leg_deal_id: dealOf[G.id] })))
  let costs = (await op.rpc('experience_console_costs', { p_experience_id: E })).data as any
  const travel = costs.lines.find((l: any) => l.label === 'Travel for G')
  ok('the cost sheet total counts Guapd-paid lines only (9,000 + 3,000.83 + 2,500)', Number(costs.guapd_total_paise) === 900000 + perUnit + 250000)
  ok('a stale edit is refused', refused(await op.rpc('experience_console_cost_update', { p_cost_id: travel.id, p_label: 'Travel', p_category: 'travel', p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 260000, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null, p_expected_updated_at: '2020-01-01T00:00:00Z' })))
  ok('removing needs a reason', refused(await op.rpc('experience_console_cost_remove', { p_cost_id: travel.id, p_reason: '', p_expected_updated_at: travel.updated_at })))
  const rm = await op.rpc('experience_console_cost_remove', { p_cost_id: travel.id, p_reason: 'Brand is paying travel', p_expected_updated_at: travel.updated_at })
  ok('a line is removed with a reason (soft)', !rm.error, rm.error?.message ?? '')
  const { data: kept } = await admin.from('experience_cost_lines').select('removed_at, removed_reason').eq('id', travel.id).single()
  ok('…kept on record, not erased', !!kept?.removed_at && kept?.removed_reason === 'Brand is paying travel')
  ok('a removed line cannot be edited', refused(await op.rpc('experience_console_cost_update', { p_cost_id: travel.id, p_label: 'x', p_category: 'travel', p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 1, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null, p_expected_updated_at: travel.updated_at })))
  ok('Phase 4 columns cannot be set, even by the service role', refused(await admin.from('experience_cost_lines').insert({ experience_id: E, label: 'x', category: 'misc', basis: 'flat_total', total_paise: 1, provided_by: 'guapd', billable_to_brand: true })))
  ok('brand and creator sessions cannot read cost lines or snapshots directly',
    refused(await brand.from('experience_cost_lines').select('id').eq('experience_id', E)) && refused(await creator.from('experience_pnl_snapshots').select('experience_id')))
  const audits = ((await admin.from('ops_events').select('action').eq('actor_auth_id', OP.auth_id).gte('created_at', startedAt).like('action', 'experience.cost_%')).data ?? []).map((a) => a.action)
  ok('every cost write is audited', audits.filter((a) => a === 'experience.cost_added').length === 4 && audits.includes('experience.cost_removed'), audits.join(','))

  group('the margin: one number, two ways, stored while open')
  // 0540: invoice fixtures (production issues them only through the finance console functions).
  const inv1 = await fixtureInvoice(admin, { experienceId: E, brandId: B.brand_id, kind: 'initial', subtotalPaise: 10000000, status: 'issued' })
  invoices.push(inv1.id)
  const inv2 = await fixtureInvoice(admin, { experienceId: E, brandId: B.brand_id, kind: 'additional', source: 'existing_footage', subtotalPaise: 5000000 })
  invoices.push(inv2.id)
  p = await pnlOf(fin)
  const costTotal = 900000 + perUnit
  const m = experienceMargin({ brandInvoiceSubtotalsPaise: [10000000], creatorLegs: [G.id, D.id].map((id) => ({ creatorGrossPaise: gross[id], creatorNetPaise: net[id] })), guapdCostsPaise: [costTotal] })
  ok('revenue = the issued invoice only (draft excluded): ₹1,00,000', Number(p.brand_revenue_paise) === 10000000 && p.revenue_pending_invoice === false && p.invoices_counted === 1)
  ok('margin = invoiced − Σ creator net − costs (database matches the money module)', Number(p.guapd_margin_paise) === m.guapdMarginPaise && Number(p.guapd_margin_paise) === 10000000 - (net[G.id] + net[D.id]) - costTotal, `${p.guapd_margin_paise} vs ${m.guapdMarginPaise}`)
  ok('sub-total + platform fee kept = margin', Number(p.subtotal_paise) + Number(p.platform_fee_kept_paise) === Number(p.guapd_margin_paise))
  ok('fee kept is per creator at their own %', Number(p.platform_fee_kept_paise) === (gross[G.id] - net[G.id]) + (gross[D.id] - net[D.id]))
  let st = await stored()
  ok('the stored margin equals the live one, and the generated column equals the jsonb', Number(st.guapd_margin_paise) === Number(p.guapd_margin_paise) && Number(st.pnl.guapd_margin_paise) === Number(st.guapd_margin_paise) && st.is_final === false)
  await admin.from('deals').update({ status: 'agreed' }).eq('id', dealOf[X.id])
  st = await stored()
  ok('a creator accepting refreshes the stored margin', Number(st.guapd_margin_paise) === 10000000 - (net[G.id] + net[D.id] + net[X.id]) - costTotal, st.refreshed_reason)

  group('complete freezes; late costs need an audited reopen (decision d)')
  await admin.from('experiences').update({ status: 'delivering' }).eq('id', E)
  // 0540: Complete is gated (deliverables approved, invoices paid, creators paid, both sign-offs):
  // tested in test-experience-payouts.ts. Here the freeze itself is what is tested, so the
  // status is set directly once the gate is shown to refuse.
  ok('Complete is refused until everything is delivered, invoiced, paid and signed off (0540)', said(await op.rpc('experience_console_complete', { p_experience_id: E }), /Not ready to complete/))
  await admin.from('experiences').update({ status: 'complete' }).eq('id', E)
  st = await stored()
  const frozen = Number(st.guapd_margin_paise)
  ok('the P&L is now final', st.is_final === true && (await pnlOf(fin)).source === 'snapshot')
  ok('a cost on a Complete Experience is refused', refused(await add(op, { p_label: 'Late makeup invoice' })))
  await admin.from('deals').update({ status: 'declined' }).eq('id', dealOf[X.id])
  ok('a later change to an input does not move the frozen margin', Number((await stored()).guapd_margin_paise) === frozen)
  ok('operational staff cannot reopen', refused(await op.rpc('experience_console_reopen', { p_experience_id: E, p_reason: 'late invoice' })))
  ok('reopening needs a reason', refused(await fin.rpc('experience_console_reopen', { p_experience_id: E, p_reason: '' })))
  ok('financial staff reopen with a reason', !refused(await fin.rpc('experience_console_reopen', { p_experience_id: E, p_reason: 'Makeup invoice arrived late' })))
  st = await stored()
  ok('reopen un-freezes and recomputes (the declined creator drops out)', st.is_final === false && Number(st.guapd_margin_paise) === 10000000 - (net[G.id] + net[D.id]) - costTotal)
  ok('the late cost can now be added', !refused(await add(op, { p_label: 'Late makeup invoice', p_total_paise: 150000 })))
  ok('…and it reaches the stored margin', Number((await stored()).guapd_margin_paise) === 10000000 - (net[G.id] + net[D.id]) - costTotal - 150000)
  await admin.from('experiences').update({ status: 'complete' }).eq('id', E)
  ok('complete again re-freezes', (await stored()).is_final === true)
  const ra = (await admin.from('ops_events').select('detail').eq('target_id', E).eq('action', 'experience.reopened')).data ?? []
  ok('the reopen is audited with its reason, and no margin figure in the audit row', ra.length === 1 && (ra[0].detail as any).reason === 'Makeup invoice arrived late' && !JSON.stringify(ra[0].detail).includes('margin'))

  group('nothing reaches the brand or the creator')
  ok('the brand cannot call the P&L or the cost sheet', refused(await brand.rpc('experience_pnl', { p_experience_id: E })) && refused(await brand.rpc('experience_console_costs', { p_experience_id: E })))
  ok('the brand cannot read its Experience price through the console', refused(await brand.rpc('experience_console_get', { p_experience_id: E })))
  const ctx = await creator.rpc('creator_leg_context', { p_deal_id: dealOf[G.id] })
  const keys = Object.keys((ctx.data ?? {}) as object)
  const vals = JSON.stringify(Object.values((ctx.data ?? {}) as object))
  const badKey = keys.find((k) => /brand_.*paise|margin|cost|invoice|agreed|revenue/.test(k))
  ok("the creator's own leg context carries no brand price, cost or margin", !ctx.error && !badKey && !/\b14000000\b|\b10000000\b/.test(vals), ctx.error?.message ?? badKey ?? '')
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (E) {
    await admin.from('experience_roster').update({ leg_deal_id: null }).eq('experience_id', E)
    if (invoices.length) await admin.from('service_invoices').delete().in('id', invoices)
    await admin.from('experience_cost_lines').delete().eq('experience_id', E)
    if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
    await admin.from('experiences').delete().eq('id', E)
  }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[costs-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
