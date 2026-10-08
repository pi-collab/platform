/**
 * Experiences Phase 2, pure tests (no database): rounding, margin, two-leg
 * independence, the settings validator, deal flow.
 *
 * Run from the repo root:
 *   ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-money.ts
 */

import { platformFeePaise, creatorLegTerms, brandInvoiceSubtotal, experienceMargin, platformPctForTrack } from '../apps/web/lib/experience-money'
import { calculateFee } from '../apps/web/lib/fee'
import { validateDealSettings, resolveDealSettings } from '../apps/web/lib/deal-settings'
import { creatorUploadsDeliverables, isCreatorWorkComplete, creatorSteps } from '../apps/web/lib/deal-flow'

let passed = 0, failed = 0
const group = (g: string) => console.log(`\n${g}`)
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? passed++ : failed++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}
function throws(name: string, f: () => unknown) {
  let threw = false
  try { f() } catch { threw = true }
  threw ? passed++ : failed++
  console.log(`  ${threw ? '✅' : '❌'} ${name}${threw ? '' : '  (did not throw)'}`)
}

// ── Rounding: defined once, half up, in paise ──────────────────────────────
group('rounding: platformFeePaise (half up, integer paise)')
eq('30% of ₹0.01 (1p) = 0.3p → 0p', platformFeePaise(1, 30), 0)
eq('30% of 2p = 0.6p → 1p', platformFeePaise(2, 30), 1)
eq('30% of 5p = 1.5p → 2p (half rounds UP)', platformFeePaise(5, 30), 2)
eq('15% of 10p = 1.5p → 2p (half rounds UP)', platformFeePaise(10, 15), 2)
eq('15% of 3p = 0.45p → 0p', platformFeePaise(3, 15), 0)
eq('15% of 7p = 1.05p → 1p', platformFeePaise(7, 15), 1)
eq('30% of ₹3,333.33 (333333p) = 99999.9p → 100000p', platformFeePaise(333_333, 30), 100_000)
eq('30% of ₹10,000.01 (1000001p) = 300000.3p → 300000p', platformFeePaise(1_000_001, 30), 300_000)
eq('30% of ₹10,000.05 (1000005p) = 300001.5p → 300002p', platformFeePaise(1_000_005, 30), 300_002)
eq('12.5% of 4p = 0.5p → 1p', platformFeePaise(4, 12.5), 1)
eq('0% of anything = 0', platformFeePaise(99_999_999, 0), 0)
eq('100% = the whole amount', platformFeePaise(123_457, 100), 123_457)
eq('30% of ₹10,000 = ₹3,000 exactly', platformFeePaise(1_000_000, 30), 300_000)
eq('very large: 30% of ₹10 crore', platformFeePaise(10_000_000_000, 30), 3_000_000_000)
throws('negative amount refused', () => platformFeePaise(-1, 30))
throws('fractional paise refused', () => platformFeePaise(10.5, 30))
throws('pct with 3 decimals refused', () => platformFeePaise(100, 12.345))
throws('pct over 100 refused', () => platformFeePaise(100, 101))

group('rounding agrees with the existing fee maths (lib/fee.ts calculateFee)')
{
  const amounts = [0, 1, 2, 3, 5, 7, 99, 100, 333, 999, 7_500, 333_333, 1_000_001, 1_000_005, 2_500_050, 99_999_999]
  for (let a = 0; a < 2000; a++) amounts.push(a * 7 + 3)
  // Experience rates are the track rates (30, 15): whole numbers, where the
  // two must be identical on every amount.
  let trackMismatch = 0, n = 0
  for (const amt of amounts) for (const pct of [15, 30]) {
    n++
    const fee = calculateFee(amt, pct, 'deducted')
    if (fee.fee_paise !== platformFeePaise(amt, pct) || fee.creator_receives_paise !== amt - platformFeePaise(amt, pct)) trackMismatch++
  }
  eq(`identical on all ${n} cases at the track rates (15%, 30%)`, trackMismatch, 0)

  // Fixed 2026-10-05: calculateFee now uses the same rule (lib/money-round.ts),
  // so the two must agree on EVERY rate, fractional ones included. Before the
  // fix, an exact half paisa rounded DOWN through float error (33.3% of 7500p).
  let anyRate = 0
  for (const amt of amounts) for (const pct of [0, 10, 12.5, 20, 33.3, 33.33, 7.25]) {
    if (calculateFee(amt, pct, 'deducted').fee_paise !== platformFeePaise(amt, pct)) anyRate++
  }
  eq('identical on every rate, fractional included (the float bug is fixed)', anyRate, 0)
  eq('33.3% of 7500p = 2497.5p → 2498p in BOTH (was 2497 in calculateFee)', [calculateFee(7_500, 33.3, 'deducted').fee_paise, platformFeePaise(7_500, 33.3)], [2_498, 2_498])
}

group('creator leg: gross → fee → net always reconciles')
{
  let bad = 0
  for (let g = 0; g < 50_000; g += 13) for (const t of ['growth', 'deals'] as const) {
    const r = creatorLegTerms({ grossPaise: g, track: t })
    if (r.creatorNetPaise + r.platformFeePaise !== r.creatorGrossPaise || r.creatorNetPaise < 0) bad++
  }
  eq('net + fee = gross for every gross 0–₹500 in 13p steps, both tracks', bad, 0)
}
eq('Growth creator ₹10,000 → 30% → ₹7,000', creatorLegTerms({ grossPaise: 1_000_000, track: 'growth' }), { creatorGrossPaise: 1_000_000, platformTrack: 'growth', platformPct: 30, platformFeePaise: 300_000, creatorNetPaise: 700_000 })
eq('Deals creator ₹10,000 → 15% → ₹8,500', creatorLegTerms({ grossPaise: 1_000_000, track: 'deals' }).creatorNetPaise, 850_000)
eq('day rate ₹10,000.01 × 1.5 days = ₹15,000.02 (1500001.5p → 1500002p)', creatorLegTerms({ dayRatePaise: 1_000_001, days: 1.5, track: 'growth' }).creatorGrossPaise, 1_500_002)
eq('track %: growth 30, deals 15', [platformPctForTrack('growth'), platformPctForTrack('deals')], [30, 15])
throws('days = 0 refused', () => creatorLegTerms({ dayRatePaise: 100, days: 0, track: 'growth' }))

// ── Brand leg ───────────────────────────────────────────────────────────────
group('brand leg: per_video × count + misc')
eq('Kiro: 70 × ₹3,500 + ₹0 = ₹2,45,000', brandInvoiceSubtotal({ perVideoPaise: 350_000, deliverableCount: 70, miscPaise: 0 }), 24_500_000)
eq('with ₹12,345.67 misc', brandInvoiceSubtotal({ perVideoPaise: 350_000, deliverableCount: 70, miscPaise: 1_234_567 }), 25_734_567)
eq('additional: 10 more at ₹3,500 + ₹5,000 edit', brandInvoiceSubtotal({ perVideoPaise: 350_000, deliverableCount: 10, miscPaise: 500_000 }), 4_000_000)
throws('half a video refused', () => brandInvoiceSubtotal({ perVideoPaise: 350_000, deliverableCount: 1.5, miscPaise: 0 }))

// ── Margin ──────────────────────────────────────────────────────────────────
group('platform fee is per creator leg, at each leg\'s own %, then summed')
{
  const growth = () => creatorLegTerms({ grossPaise: 1_000_000, track: 'growth' })
  const deals = () => creatorLegTerms({ grossPaise: 1_000_000, track: 'deals' })
  const all7 = experienceMargin({ brandInvoiceSubtotalsPaise: [0], creatorLegs: Array.from({ length: 7 }, growth), guapdCostsPaise: [] })
  eq('7 Growth × ₹10,000 → platform fee ₹21,000', all7.platformFeeKeptPaise, 2_100_000)
  const mixed = experienceMargin({ brandInvoiceSubtotalsPaise: [0], creatorLegs: [...Array.from({ length: 5 }, growth), deals(), deals()], guapdCostsPaise: [] })
  eq('5 Growth + 2 Deals × ₹10,000 → ₹18,000 (NOT a blanket 30% = ₹21,000)', mixed.platformFeeKeptPaise, 1_800_000)
}

group('margin = brand − Σ creator NET − costs; sub-total + fee kept reconciles')
{
  const legs = [1, 2, 3].map(() => creatorLegTerms({ grossPaise: 1_000_000, track: 'growth' }))
  const m = experienceMargin({ brandInvoiceSubtotalsPaise: [24_500_000], creatorLegs: legs, guapdCostsPaise: [150_000, 50_000] })
  eq('Kiro sub-total = ₹2,45,000 − 3×₹10,000 gross − ₹2,000 = ₹2,13,000', m.subtotalPaise, 21_300_000)
  eq('platform fee kept = 3 × ₹3,000 (per leg)', m.platformFeeKeptPaise, 900_000)
  eq('Guapd margin = ₹2,45,000 − 3×₹7,000 net − ₹2,000 = ₹2,22,000', m.guapdMarginPaise, 22_200_000)
  eq('sub-total + fee kept = margin (one number, two views)', m.subtotalPaise + m.platformFeeKeptPaise, m.guapdMarginPaise)

  // Palak's staging figures, 2026-10-05
  const deals = (g: number) => creatorLegTerms({ grossPaise: g, track: 'deals' })
  const st = experienceMargin({ brandInvoiceSubtotalsPaise: [24_500_000, 4_000_000, 1_750_000], creatorLegs: [deals(1_000_000), deals(24_999_998)], guapdCostsPaise: [] })
  eq('staging: sub-total ₹42,500.02', st.subtotalPaise, 4_250_002)
  eq('staging: platform fee kept ₹39,000.00', st.platformFeeKeptPaise, 3_900_000)
  eq('staging: Guapd margin ₹81,500.02', st.guapdMarginPaise, 8_150_002)
  eq('staging: costs line shown as ₹0', st.guapdCostsTotalPaise, 0)

  const odd = experienceMargin({ brandInvoiceSubtotalsPaise: [333_333, 1], creatorLegs: [creatorLegTerms({ grossPaise: 333_333, track: 'growth' })], guapdCostsPaise: [1] })
  eq('odd amounts: sub-total 0, fee 100000p, margin 100000p, all whole paise', [odd.subtotalPaise, odd.platformFeeKeptPaise, odd.guapdMarginPaise], [0, 100_000, 100_000])
  const loss = experienceMargin({ brandInvoiceSubtotalsPaise: [100_000], creatorLegs: [deals(200_000)], guapdCostsPaise: [] })
  eq('a loss shows negative, not hidden (₹1,000 − ₹1,700 net = −₹700)', loss.guapdMarginPaise, -70_000)
  eq('no invoices yet → margin 0', experienceMargin({ brandInvoiceSubtotalsPaise: [], creatorLegs: [], guapdCostsPaise: [] }).guapdMarginPaise, 0)
}

// ── Independence (pure) ─────────────────────────────────────────────────────
group('two-leg independence (pure functions)')
{
  const brand = { perVideoPaise: 350_000, deliverableCount: 70, miscPaise: 0 }
  const creator = { grossPaise: 1_000_000, track: 'growth' as const }
  const brandBefore = brandInvoiceSubtotal(brand)
  const creatorBefore = creatorLegTerms(creator).creatorNetPaise
  // creator rate goes up 5× → brand invoice unchanged
  const brandAfterCreatorChange = brandInvoiceSubtotal(brand)
  const creatorAfterRaise = creatorLegTerms({ ...creator, grossPaise: 5_000_000 }).creatorNetPaise
  eq('creator rate ×5 → brand invoice unchanged', brandAfterCreatorChange, brandBefore)
  eq('…and the creator pay did change (sanity)', creatorAfterRaise !== creatorBefore, true)
  // brand price halves → creator pay unchanged
  const creatorAfterBrandChange = creatorLegTerms(creator).creatorNetPaise
  eq('brand price halved → creator pay unchanged', creatorAfterBrandChange, creatorBefore)
  eq('…and the brand invoice did change (sanity)', brandInvoiceSubtotal({ ...brand, perVideoPaise: 175_000 }) !== brandBefore, true)
  // The functions' inputs cannot even name the other leg.
  // @ts-expect-error  brand pricing takes no creator fields
  brandInvoiceSubtotal({ perVideoPaise: 1, deliverableCount: 1, miscPaise: 0, creatorGrossPaise: 1 })
  // @ts-expect-error  creator terms take no brand fields
  creatorLegTerms({ grossPaise: 1, track: 'growth', perVideoPaise: 1 })
  eq('type system refuses cross-leg inputs (see @ts-expect-error above; tsc fails if they ever compile)', true, true)
}

// ── Validator ───────────────────────────────────────────────────────────────
group('settings validator: accepts the Kiro template')
const kiro = {
  kind: 'experience', completion_trigger: 'on_shoot_done', deliverables_owner: 'guapd', pricing_basis: 'per_deliverable',
  payment_flow: 'guapd_principal_vendor_payout', brand_per_video_paise_default: 350_000,
  follow_on: { type: 'affiliate', trigger: 'sales_final', basis: 'pct_of_sales', invoicer: 'creator' },
  cost_line_categories: ['per_video', 'day_rate', 'retainer', 'travel', 'food', 'editing', 'photography', 'styling', 'makeup', 'misc'],
}
eq('Kiro template v2 valid', validateDealSettings(kiro).ok, true)
eq('Kiro template valid with exposedOnly', validateDealSettings(kiro, { exposedOnly: true }).ok, true)
eq('resolveDealSettings snapshots it', resolveDealSettings({ id: 't', version: 2, settings: kiro }).template_version, 2)

group('settings validator: REJECTS aggregator flows and cross-leg money links')
const reject = (name: string, cfg: unknown) => {
  const r = validateDealSettings(cfg)
  r.ok ? failed++ : passed++
  console.log(`  ${r.ok ? '❌ ACCEPTED' : '✅'} ${name}${r.ok ? '' : ` — ${r.errors[0]}`}`)
}
reject('route_split (pool brand money, split to creators)', { ...kiro, kind: 'deal', payment_flow: 'route_split' })
reject('brand_pays_creator_direct on a template', { ...kiro, kind: 'deal', payment_flow: 'brand_pays_creator_direct' })
reject('Experience with brand → creator direct flow', { ...kiro, payment_flow: 'brand_pays_creator_direct' })
reject('brand price derived from creator cost (cost_plus)', { ...kiro, brand_pricing: 'cost_plus' })
reject('brand price = creator cost + markup', { ...kiro, brand_markup_pct: 30 })
reject('creator pay derived from brand invoice', { ...kiro, creator_pay_from_brand_invoice: true })
reject('split brand payment to creators', { ...kiro, split_to_creators: true })
reject('pool funds', { ...kiro, pool_brand_funds: true })
reject('disburse brand money', { ...kiro, disburse_on_brand_payment: true })
reject('escrow', { ...kiro, escrow: true })
reject('payer/payee override (brand pays creator)', { ...kiro, payer: 'brand', payee: 'creator' })
reject('linkage hidden inside follow_on', { ...kiro, follow_on: { ...kiro.follow_on, pay_creator_from_brand: true } })
reject('unknown key of any kind (strict)', { ...kiro, anything_new: 1 })
reject('unknown payment_flow value', { ...kiro, payment_flow: 'guapd_collects_and_forwards' })
reject('missing payment_flow', { ...kiro, payment_flow: undefined })
{
  const r = validateDealSettings({ ...kiro, completion_trigger: 'on_content_posted' }, { exposedOnly: true })
  eq('schema-valid but unexposed value refused when exposedOnly', r.ok, false)
  eq('…and accepted without exposedOnly (schema stays flexible)', validateDealSettings({ ...kiro, completion_trigger: 'on_content_posted' }).ok, true)
}
group('settings validator: who provides the deliverables decides when the creator is done (0538)')
eq('a creator-submit Experience template (creator + on_delivery_accepted) is valid and offered', validateDealSettings({ ...kiro, deliverables_owner: 'creator', completion_trigger: 'on_delivery_accepted' }, { exposedOnly: true }).ok, true)
reject('creator submits but is "done" at shoot done (would be payable before Guapd approves)', { ...kiro, deliverables_owner: 'creator', completion_trigger: 'on_shoot_done' })
reject('creator submits but is "done" when posted', { ...kiro, deliverables_owner: 'creator', completion_trigger: 'on_content_posted' })
throws('resolveDealSettings throws on an invalid template', () => resolveDealSettings({ id: 't', version: 1, settings: { ...kiro, payment_flow: 'route_split' } }))

// ── Deal flow ───────────────────────────────────────────────────────────────
group('deal flow from settings')
const kiroFlow = { completion_trigger: 'on_shoot_done' as const, deliverables_owner: 'guapd' as const }
eq('Kiro: creator does not upload', creatorUploadsDeliverables(kiroFlow), false)
eq('Kiro: creator work complete once the shoot is done', isCreatorWorkComplete(kiroFlow, { shootDone: true, isPosted: false, deliveryAccepted: false }), true)
eq('Kiro: not complete before the shoot', isCreatorWorkComplete(kiroFlow, { shootDone: false, isPosted: true, deliveryAccepted: true }), false)
eq('Kiro steps: no deliver/review step', creatorSteps(kiroFlow), ['offer', 'agreed', 'shoot_scheduled', 'shoot_done', 'paid'])
eq('creator-submit: shot but not approved is NOT complete', isCreatorWorkComplete({ completion_trigger: 'on_delivery_accepted', deliverables_owner: 'creator' }, { shootDone: true, isPosted: false, deliveryAccepted: false }), false)
eq('creator-submit: complete once Guapd approved', isCreatorWorkComplete({ completion_trigger: 'on_delivery_accepted', deliverables_owner: 'creator' }, { shootDone: true, isPosted: false, deliveryAccepted: true }), true)
eq('creator uploads, whatever the trigger: approval still required', isCreatorWorkComplete({ completion_trigger: 'on_shoot_done', deliverables_owner: 'creator' }, { shootDone: true, isPosted: false, deliveryAccepted: false }), false)
eq('creator-owned, on_delivery_accepted: uploads + review', creatorSteps({ completion_trigger: 'on_delivery_accepted', deliverables_owner: 'creator' }), ['offer', 'agreed', 'deliver', 'review', 'paid'])

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
if (failed) process.exitCode = 1
