/**
 * Experience P&L + access, against STAGING (needs migration 0526).
 *
 * Builds a throwaway Experience, grants TEMPORARY staff_access to two real
 * users (one financial, one operational), and calls experience_pnl() /
 * experience_payouts() with real sessions. Restores every staff_access row it
 * touched and deletes everything it created.
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-pnl-access.ts
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
import { createAdminClient } from '../apps/web/lib/supabase/admin'
import { lockCreatorLegTerms, draftServiceInvoice } from '../apps/web/lib/experience-legs-server'
import { experienceMargin } from '../apps/web/lib/experience-money'

const admin = createAdminClient()
let passed = 0, failed = 0
const cleanup: Array<() => Promise<unknown>> = []
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const one = async (q: PromiseLike<{ data: any; error: any }>, w: string) => { const r = await q; if (r.error || !r.data) throw new Error(`${w}: ${r.error?.message}`); return r.data }

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const res = await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })
  const s = await res.json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
async function refusedRpc(name: string, c: SupabaseClient, fn: string) {
  const r = await c.rpc(fn, { p_experience_id: expId })
  ok(name, !!r.error, r.error?.message ?? 'RETURNED DATA')
}
let expId = ''

async function run() {
  // Real logins: brand member, creator, and three other users (fin / ops / none).
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id)').limit(30)
  const brandM = (bm ?? []).find((m: any) => m.users?.auth_id) as any
  const { data: crs } = await admin.from('creators').select('id, vetting_status, user_id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  const taken = new Set([brandM.user_id, C.user_id])
  const { data: others } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(60)
  const pool = (others ?? []).filter((u: any) => !taken.has(u.id))
  const [FIN, OPS, NONE] = pool
  if (!FIN || !OPS || !NONE) throw new Error('need three spare users with logins')

  // Remember and restore any staff_access these users already had.
  const { data: prior } = await admin.from('staff_access').select('*').in('user_id', [FIN.id, OPS.id, NONE.id, brandM.user_id, C.user_id])
  cleanup.push(async () => {
    await admin.from('staff_access').delete().in('user_id', [FIN.id, OPS.id, NONE.id, brandM.user_id, C.user_id])
    if (prior?.length) await admin.from('staff_access').insert(prior)
  })
  await admin.from('staff_access').delete().in('user_id', [FIN.id, OPS.id, NONE.id, brandM.user_id, C.user_id])
  await admin.from('staff_access').insert([
    { user_id: FIN.id, experiences_financial: true, experiences_operational: false },
    { user_id: OPS.id, experiences_financial: false, experiences_operational: true },
  ])

  // House rows (temporary if not seeded yet)
  let houseBrand = (await admin.from('brands').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseBrand) { houseBrand = (await one(admin.from('brands').insert({ name: 'Guapd (house, test)', is_guapd: true }).select('id').single(), 'hb')).id; cleanup.push(() => admin.from('brands').delete().eq('id', houseBrand!)) }
  let houseCreator = (await admin.from('creators').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseCreator) { houseCreator = (await one(admin.from('creators').insert({ full_name: 'Guapd (house, test)', is_guapd: true }).select('id').single(), 'hc')).id; cleanup.push(() => admin.from('creators').delete().eq('id', houseCreator!)) }

  // Experience: two legs (one agreed/locked, one pending), invoices, costs, a payout.
  const exp = await one(admin.from('experiences').insert({ brand_id: brandM.brand_id, title: '[pnl-test]', status: 'confirmed',
    brand_per_video_paise: 350_000, brand_deliverable_count: 70, brand_misc_paise: 0, brand_service_total_paise: 24_500_000 }).select('id').single(), 'exp')
  expId = exp.id
  cleanup.push(() => admin.from('experiences').delete().eq('id', expId))
  const base = { status: 'agreed', deliverables: 'shoot', revision_limit: 0, payment_terms: 'Net 15', last_offer_by: 'brand', fee_percent: 0, fee_mode: 'deducted', track: 'deals', payment_flow: 'guapd_principal_vendor_payout', experience_id: expId }
  const leg1 = (await one(admin.from('deals').insert({ ...base, brand_id: brandM.brand_id, creator_id: houseCreator, leg_role: 'brand_leg', title: '[pnl-test] L1', price_paise: 1 }).select('id').single(), 'l1')).id
  const legA = (await one(admin.from('deals').insert({ ...base, brand_id: houseBrand, creator_id: C.id, leg_role: 'creator_leg', title: '[pnl-test] A', price_paise: 1 }).select('id').single(), 'la')).id
  const { data: c2 } = await admin.from('creators').select('id').eq('is_guapd', false).neq('id', C.id).limit(1).single()
  const legB = (await one(admin.from('deals').insert({ ...base, brand_id: houseBrand, creator_id: c2!.id, leg_role: 'creator_leg', title: '[pnl-test] B', price_paise: 1 }).select('id').single(), 'lb')).id
  cleanup.push(async () => {
    await admin.from('vendor_payouts').delete().eq('experience_id', expId)
    await admin.from('experience_cost_lines').delete().eq('experience_id', expId)
    await admin.from('service_invoices').delete().eq('experience_id', expId)
    await admin.from('experience_creator_terms').delete().eq('experience_id', expId)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', expId)
    await admin.from('events').delete().in('deal_id', [leg1, legA, legB])
    await admin.from('deals').delete().in('id', [leg1, legA, legB])
  })
  const tA = await lockCreatorLegTerms(admin, { dealId: legA, experienceId: expId, creatorId: C.id, dayRatePaise: 1_000_000, days: 1 })
  await one(admin.from('experience_creator_terms').insert({ deal_id: legB, experience_id: expId, creator_id: c2!.id, creator_gross_paise: 0, platform_pct: 30, creator_net_paise: 0 }).select('deal_id').single(), 'pending terms')

  const inv1 = await draftServiceInvoice(admin, { experienceId: expId, brandId: brandM.brand_id, kind: 'initial', perVideoPaise: 350_000, deliverableCount: 70 })
  await admin.from('service_invoices').update({ status: 'issued' }).eq('id', inv1.id)
  const inv2 = await draftServiceInvoice(admin, { experienceId: expId, brandId: brandM.brand_id, kind: 'additional', source: 'existing_footage', perVideoPaise: 350_000, deliverableCount: 10, miscPaise: 500_000 })
  await admin.from('service_invoices').update({ status: 'issued' }).eq('id', inv2.id)
  await admin.from('service_invoices').update({ status: 'paid', payment_reference: 'UTR-PNL', paid_at: new Date().toISOString() }).eq('id', inv2.id)
  await draftServiceInvoice(admin, { experienceId: expId, brandId: brandM.brand_id, kind: 'additional', source: 'new_shoot', perVideoPaise: 350_000, deliverableCount: 5 }) // stays draft: excluded
  await one(admin.from('experience_cost_lines').insert([
    { experience_id: expId, label: 'Travel', category: 'travel', basis: 'flat_total', total_paise: 150_000, provided_by: 'guapd' },
    { experience_id: expId, label: 'Makeup (brand provides)', category: 'makeup', basis: 'flat_total', total_paise: 50_000, provided_by: 'brand' },
  ]).select('id'), 'costs')
  let vendor = (await admin.from('vendors').select('id').eq('creator_id', C.id).maybeSingle()).data as any
  if (!vendor) { vendor = await one(admin.from('vendors').insert({ kind: 'creator', creator_id: C.id, display_name: '[pnl-test] vendor' }).select('id').single(), 'v'); const vid = vendor.id; cleanup.push(() => admin.from('vendors').delete().eq('id', vid)) }
  await one(admin.from('vendor_payouts').insert({ experience_id: expId, deal_id: legA, vendor_id: vendor.id, reason: 'Day rate', amount_paise: tA.creatorNetPaise, net_amount_paise: tA.creatorNetPaise, idempotency_key: `pnl-test-${expId}` }).select('id').single(), 'payout')

  const fin = await sessionFor(FIN.auth_id), ops = await sessionFor(OPS.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(brandM.users.auth_id), creator = await sessionFor(C.users.auth_id)

  // ── Financial access: the P&L, and it matches the code ──
  group('financial access (opt-in): sees the P&L')
  const r = await fin.rpc('experience_pnl', { p_experience_id: expId })
  ok('financial user gets the P&L', !r.error, r.error?.message)
  const p = r.data as any
  const want = experienceMargin({ brandInvoiceSubtotalsPaise: [24_500_000, 4_000_000], creatorLegs: [{ creatorGrossPaise: tA.creatorGrossPaise, creatorNetPaise: tA.creatorNetPaise }], guapdCostsPaise: [150_000] })
  ok('margin = brand − Σ NET − costs, and equals the code\'s experienceMargin()', Number(p?.guapd_margin_paise) === want.guapdMarginPaise, `₹${(Number(p?.guapd_margin_paise) / 100).toFixed(2)}`)
  ok('sub-total (at gross) and fee kept match too, and reconcile', Number(p?.subtotal_paise) === want.subtotalPaise && Number(p?.platform_fee_kept_paise) === want.platformFeeKeptPaise && Number(p?.subtotal_paise) + Number(p?.platform_fee_kept_paise) === Number(p?.guapd_margin_paise))
  ok('revenue counts issued + paid invoices only (draft excluded): ₹2,85,000', Number(p?.brand_revenue_paise) === 28_500_000)
  ok('received = paid invoices only: ₹40,000', Number(p?.brand_received_paise) === 4_000_000)
  ok('costs = lines Guapd bears only (brand-provided makeup excluded): ₹1,500', Number(p?.guapd_costs_total_paise) === 150_000)
  ok('unagreed leg counted as pending, not as cost', Number(p?.legs_pending) === 1 && p?.per_leg?.length === 1)
  ok('per-leg breakdown carries that leg\'s own % and fee', Number(p?.per_leg?.[0]?.platform_pct) === tA.platformPct && Number(p?.per_leg?.[0]?.platform_fee_paise) === tA.platformFeePaise)
  ok('source is live while the Experience is open', p?.source === 'live')
  const fp = await fin.rpc('experience_payouts', { p_experience_id: expId })
  ok('financial user can also see payouts', !fp.error && (fp.data as any[])?.length === 1, fp.error?.message)

  // ── Operational access: payouts yes, P&L no ──
  group('operational access: payouts, NOT the P&L')
  await refusedRpc('operational user is refused the P&L', ops, 'experience_pnl')
  const op = await ops.rpc('experience_payouts', { p_experience_id: expId })
  ok('operational user sees creator payouts (with vendor name)', !op.error && (op.data as any[])?.length === 1 && !!(op.data as any[])[0].vendor_name, op.error?.message)

  // ── Everyone else ──
  group('no access (outreach-like), brand, creator, service role: refused')
  await refusedRpc('user with no staff_access: P&L refused', none, 'experience_pnl')
  await refusedRpc('user with no staff_access: payouts refused', none, 'experience_payouts')
  await refusedRpc('brand: P&L refused', brand, 'experience_pnl')
  await refusedRpc('brand: payouts refused', brand, 'experience_payouts')
  await refusedRpc('creator: P&L refused', creator, 'experience_pnl')
  await refusedRpc('creator: payouts refused', creator, 'experience_payouts')
  const sr = await admin.rpc('experience_pnl', { p_experience_id: expId })
  ok('SERVICE ROLE is refused too (no caller → no financial flag)', !!sr.error, sr.error?.message ?? 'RETURNED DATA')
  const direct = await fin.rpc('compute_experience_pnl', { p_experience_id: expId })
  ok('even a financial user cannot call the internal calculation directly', !!direct.error, direct.error?.message ?? 'RETURNED DATA')
  for (const [who, c] of [['brand', brand], ['financial user', fin]] as const) {
    const t = await c.from('staff_access').select('user_id')
    ok(`${who} cannot read staff_access`, !!t.error || (t.data ?? []).length === 0, t.error?.message ?? `${t.data?.length} rows`)
    const s = await c.from('experience_pnl_snapshots').select('pnl')
    ok(`${who} cannot read P&L snapshots directly`, !!s.error || (s.data ?? []).length === 0, s.error?.message ?? `${s.data?.length} rows`)
  }

  // ── Snapshot at completion ──
  group('snapshot at completion: history does not drift')
  await admin.from('experiences').update({ status: 'complete' }).eq('id', expId)
  const snap1 = (await fin.rpc('experience_pnl', { p_experience_id: expId })).data as any
  ok('completing the Experience snapshots the P&L', snap1?.source === 'snapshot' && !!snap1?.captured_at)
  ok('snapshot margin = the live margin at completion', Number(snap1?.guapd_margin_paise) === want.guapdMarginPaise)
  // the pending leg gets agreed afterwards at a big rate: live would change, snapshot must not
  await admin.from('experience_creator_terms').delete().eq('deal_id', legB)
  await lockCreatorLegTerms(admin, { dealId: legB, experienceId: expId, creatorId: c2!.id, grossPaise: 5_000_000 })
  const snap2 = (await fin.rpc('experience_pnl', { p_experience_id: expId })).data as any
  ok('a later leg change does NOT move the completed P&L', Number(snap2?.guapd_margin_paise) === want.guapdMarginPaise && snap2?.source === 'snapshot')
  await admin.from('experiences').update({ status: 'delivering' }).eq('id', expId)
  const live = (await fin.rpc('experience_pnl', { p_experience_id: expId })).data as any
  ok('reopening drops the snapshot; live P&L now includes the new leg', live?.source === 'live' && Number(live?.guapd_margin_paise) < want.guapdMarginPaise)
  const left = (await admin.from('experience_pnl_snapshots').select('experience_id').eq('experience_id', expId)).data ?? []
  ok('no snapshot stored while open', left.length === 0)

  // ── Revoking takes effect immediately ──
  group('revoking access')
  await admin.from('staff_access').update({ experiences_financial: false }).eq('user_id', FIN.id)
  await refusedRpc('financial flag turned off → P&L refused at once', fin, 'experience_pnl')
}

run()
  .catch(e => { console.error('\nError:', (e as Error).message); failed++ })
  .finally(async () => {
    for (const f of cleanup.reverse()) { try { await f() } catch (e) { console.log('cleanup:', (e as Error).message) } }
    console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
    if (failed) process.exitCode = 1
  })
