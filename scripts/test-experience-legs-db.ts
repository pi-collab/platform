/**
 * Experiences Phase 2, database tests against STAGING (needs migration 0525).
 *
 * Uses the real server function lockCreatorLegTerms with the service role, and
 * invoice fixtures (0540: invoices and payouts go through the access-checked
 * console functions, tested in test-experience-invoices / -payouts), on a throwaway
 * Experience. Deletes everything it creates, including its ops_events rows.
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-legs-db.ts
 */

import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL!.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }

import { createAdminClient } from '../apps/web/lib/supabase/admin'
import { lockCreatorLegTerms } from '../apps/web/lib/experience-legs-server'
import { fixtureInvoice, issuedFields } from './fixture-invoice'
import { creatorLegTerms } from '../apps/web/lib/experience-money'

const admin = createAdminClient()
let passed = 0, failed = 0
const cleanup: Array<() => Promise<unknown>> = []
const group = (g: string) => console.log(`\n${g}`)
function ok(name: string, cond: boolean, detail = '') { cond ? passed++ : failed++; console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }
async function refused(name: string, f: () => PromiseLike<{ error: { message: string } | null }> | Promise<unknown>) {
  let msg = ''
  try { const r: any = await f(); if (r && r.error) msg = r.error.message } catch (e) { msg = (e as Error).message }
  ok(name, !!msg, msg || 'NOT refused')
}
const one = async (q: PromiseLike<{ data: any; error: any }>, what: string) => { const r = await q; if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`); return r.data }

async function run() {
  // Two real creators (not the house account) and a real brand.
  const { data: crs } = await admin.from('creators').select('id, vetting_status').eq('is_guapd', false).limit(10)
  const [C1, C2, C3] = crs ?? []
  const { data: br } = await admin.from('brands').select('id').eq('is_guapd', false).limit(1).single()
  const brandId = br!.id as string

  let houseBrand = (await admin.from('brands').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseBrand) { houseBrand = (await one(admin.from('brands').insert({ name: 'Guapd (house, test)', is_guapd: true }).select('id').single(), 'house brand')).id; cleanup.push(() => admin.from('brands').delete().eq('id', houseBrand!)) }
  let houseCreator = (await admin.from('creators').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseCreator) { houseCreator = (await one(admin.from('creators').insert({ full_name: 'Guapd (house, test)', is_guapd: true }).select('id').single(), 'house creator')).id; cleanup.push(() => admin.from('creators').delete().eq('id', houseCreator!)) }

  const exp = await one(admin.from('experiences').insert({ brand_id: brandId, title: '[p2-test] Experience', status: 'confirmed',
    brand_per_video_paise: 350_000, brand_deliverable_count: 70, brand_misc_paise: 0, brand_service_total_paise: 24_500_000 }).select('id').single(), 'experience')
  cleanup.push(() => admin.from('experiences').delete().eq('id', exp.id))
  const legBase = { status: 'agreed', deliverables: 'shoot', revision_limit: 0, payment_terms: 'Net 15', last_offer_by: 'brand', fee_percent: 0, fee_mode: 'deducted',
    track: 'deals', payment_flow: 'guapd_principal_vendor_payout', completion_trigger: 'on_shoot_done', deliverables_owner: 'guapd', pricing_basis: 'per_deliverable', experience_id: exp.id }
  const mkLeg = async (creatorId: string, title: string) => (await one(admin.from('deals').insert({ ...legBase, brand_id: houseBrand, creator_id: creatorId, leg_role: 'creator_leg', title, price_paise: 1 }).select('id').single(), title)).id as string
  const leg1 = (await one(admin.from('deals').insert({ ...legBase, brand_id: brandId, creator_id: houseCreator, leg_role: 'brand_leg', title: '[p2-test] Leg 1', price_paise: 24_500_000 }).select('id').single(), 'leg 1')).id
  const legA = await mkLeg(C1.id, '[p2-test] Leg A')
  const legB = await mkLeg(C2.id, '[p2-test] Leg B')
  const legC = await mkLeg(C3.id, '[p2-test] Leg C')
  cleanup.push(async () => {
    await admin.from('experience_creator_terms').delete().eq('experience_id', exp.id)
    await admin.from('service_invoices').delete().eq('experience_id', exp.id)
    await admin.from('events').delete().in('deal_id', [leg1, legA, legB, legC])
    await admin.from('deals').delete().in('id', [leg1, legA, legB, legC])
  })

  // ── Track at send time, snapshotted and locked ──
  group('creator terms: track % at send time, locked')
  const tA = await lockCreatorLegTerms(admin, { dealId: legA, experienceId: exp.id, creatorId: C1.id, dayRatePaise: 1_000_000, days: 1 })
  const wantPct = C1.vetting_status === 'growth' ? 30 : 15
  ok(`creator A is ${C1.vetting_status}: platform % = ${wantPct}`, tA.platformPct === wantPct, `${tA.creatorGrossPaise} → ${tA.platformPct}% → ${tA.creatorNetPaise}`)
  const rowA = await one(admin.from('experience_creator_terms').select('creator_gross_paise, platform_pct, platform_track, creator_net_paise, locked_at').eq('deal_id', legA).single(), 'terms A')
  ok('stored terms match the computed ones and are locked', rowA.creator_net_paise === tA.creatorNetPaise && !!rowA.locked_at && rowA.platform_track === tA.platformTrack)
  await refused('editing a LOCKED leg\'s rate is refused (t_ect_freeze)', () => admin.from('experience_creator_terms').update({ creator_gross_paise: 2_000_000, creator_net_paise: 1_400_000 }).eq('deal_id', legA))
  await refused('re-locking a locked leg is refused (server)', () => lockCreatorLegTerms(admin, { dealId: legA, experienceId: exp.id, creatorId: C1.id, grossPaise: 5_000_000 }))
  await refused('a net that breaks the rounding rule is refused (CHECK ect_net_formula)', () => admin.from('experience_creator_terms').insert({
    deal_id: legC, experience_id: exp.id, creator_id: C3.id, creator_gross_paise: 1_000_005, platform_pct: 30, creator_net_paise: 700_004 }))
  ok('…the correct net (₹10,000.05 → 30% → 700003p) is what the function produces', creatorLegTerms({ grossPaise: 1_000_005, track: 'growth' }).creatorNetPaise === 700_003)

  // ── Independence in the database ──
  group('two-leg independence (database)')
  const inv = await fixtureInvoice(admin, { experienceId: exp.id, brandId, kind: 'initial', subtotalPaise: 24_500_000 })
  ok('initial invoice = ₹2,45,000 (one clean service price)', inv.subtotalPaise === 24_500_000)
  // creator rate changes: add a leg at a very different rate
  await lockCreatorLegTerms(admin, { dealId: legB, experienceId: exp.id, creatorId: C2.id, dayRatePaise: 9_999_999, days: 2.5 })
  const invAfter = await one(admin.from('service_invoices').select('subtotal_paise, total_paise').eq('id', inv.id).single(), 'invoice')
  ok('creator rates change (new leg at ₹99,999.99 × 2.5 days) → brand invoice unchanged', invAfter.subtotal_paise === 24_500_000 && invAfter.total_paise === 24_500_000)
  // brand price changes
  const netsBefore = (await one(admin.from('experience_creator_terms').select('deal_id, creator_net_paise').eq('experience_id', exp.id).order('deal_id'), 'nets')).map((r: any) => r.creator_net_paise)
  const { error: priceErr } = await admin.from('experiences').update({ brand_per_video_paise: 175_000, brand_service_total_paise: 12_250_000 }).eq('id', exp.id)
  ok('brand price halved on the Experience', !priceErr, priceErr?.message)
  const netsAfter = (await one(admin.from('experience_creator_terms').select('deal_id, creator_net_paise').eq('experience_id', exp.id).order('deal_id'), 'nets')).map((r: any) => r.creator_net_paise)
  ok('brand price changes → every creator\'s pay unchanged', JSON.stringify(netsBefore) === JSON.stringify(netsAfter), JSON.stringify(netsAfter))
  await refused('Experience total that disagrees with per_video × count + misc is refused', () => admin.from('experiences').update({ brand_service_total_paise: 1 }).eq('id', exp.id))

  // ── Follow-on / additional invoices ──
  group('additional invoices (more videos later)')
  const legsBefore = (await admin.from('deals').select('id', { count: 'exact' }).eq('experience_id', exp.id).eq('leg_role', 'creator_leg')).count
  const add = await fixtureInvoice(admin, { experienceId: exp.id, brandId, kind: 'additional', source: 'existing_footage', subtotalPaise: 4_000_000 })
  ok('existing_footage: ₹40,000, its own invoice', add.subtotalPaise === 4_000_000 && add.id !== inv.id)
  const legsAfter = (await admin.from('deals').select('id', { count: 'exact' }).eq('experience_id', exp.id).eq('leg_role', 'creator_leg')).count
  ok('existing_footage moved no creator leg', legsBefore === legsAfter)
  await refused('an additional invoice without a source is refused by the database (CHECK si_additional_has_source)', () => admin.from('service_invoices').insert({ experience_id: exp.id, brand_id: brandId, kind: 'additional', description: 'Extra videos', subtotal_paise: 0, total_paise: 0 }))
  const ns = await fixtureInvoice(admin, { experienceId: exp.id, brandId, kind: 'additional', source: 'new_shoot', subtotalPaise: 1_750_000 })
  ok('new_shoot invoice is created independently of any creator leg', ns.subtotalPaise === 1_750_000)

  // ── Issued invoices are frozen ──
  group('issued invoices are frozen')
  await admin.from('service_invoices').update(issuedFields()).eq('id', inv.id)
  await refused('changing an issued invoice\'s amount is refused (t_si_freeze)', () => admin.from('service_invoices').update({ subtotal_paise: 1, total_paise: 1, per_video_paise: null }).eq('id', inv.id))
  const paid = await admin.from('service_invoices').update({ status: 'paid', payment_reference: 'UTR-TEST-1', paid_at: new Date().toISOString() }).eq('id', inv.id).select('status').single()
  ok('recording the brand\'s payment on an issued invoice is allowed', paid.data?.status === 'paid', paid.error?.message)
  await refused('marking paid without a reference is refused (CHECK si_paid_has_reference)', () => admin.from('service_invoices').update({ status: 'paid' }).eq('id', add.id))

  // ── P&L ── moved to scripts/test-experience-pnl-access.ts (migration 0526):
  // it is served only by experience_pnl() to a user with financial access.

  // ── Payouts ── moved to scripts/test-experience-payouts.ts (0540): they go
  // through access-checked database functions (maker-checker, proof), never the
  // service role, so the Phase 2 payout service was retired.
}

run()
  .catch(e => { console.error('\nError:', (e as Error).message); failed++ })
  .finally(async () => {
    for (const f of cleanup.reverse()) { try { await f() } catch (e) { console.log('cleanup:', (e as Error).message) } }
    console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
    if (failed) process.exitCode = 1
  })
