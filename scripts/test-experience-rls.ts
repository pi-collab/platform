/**
 * Experiences RLS verification (migrations 0522–0524), against STAGING.
 *
 * Builds one throwaway Experience between a real brand login and a real
 * creator login — both legs, creator terms (with margin), finance row, cost
 * line, vendor + payout details, payout, service invoice, follow-on, roster
 * entry, creator_private, and two Leg 2 items (one hidden) — then reads it all
 * back as the brand and as the creator. "Refused" = an error OR zero rows.
 * Everything it creates is deleted at the end.
 *
 * If no Guapd house brand/creator exists yet (Phase 3 seeds them), it creates
 * temporary ones and removes them afterwards.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-experience-rls.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }
const admin = createClient(URL, SERVICE)

type Row = { group: string; check: string; ok: boolean; detail: string }
const results: Row[] = []
const cleanup: Array<() => Promise<unknown>> = []

// Setup rows are untyped (no generated DB types in this repo).
function must(r: { data: any; error: { message: string } | null }, what: string): any {
  if (r.error || r.data == null) throw new Error(`setup: ${what}: ${r.error?.message ?? 'no data'}`)
  return r.data
}

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const res = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }),
  })
  const s = await res.json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

/** Expect the read to be refused: an error, or no rows. */
async function refused(group: string, check: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await q
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0
  results.push({ group, check, ok: !!error || rows === 0, detail: error ? `refused: ${error.message}` : `${rows} row(s)` })
}
/** Expect the read to succeed with exactly n rows (and optionally check them). */
async function allowed(group: string, check: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>, n = 1, test?: (rows: any[]) => string | null) {
  const { data, error } = await q
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[]
  const problem = error ? error.message : rows.length !== n ? `${rows.length} rows, expected ${n}` : test?.(rows) ?? null
  results.push({ group, check, ok: !problem, detail: problem ?? `${rows.length} row(s)` })
}

async function run() {
  // ── Real logins: one brand member, two creators ────────────────────────────
  const { data: members } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id)').limit(30)
  const bm = (members ?? []).find(m => (m.users as any)?.auth_id)
  const { data: crs } = await admin.from('creators').select('id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const creatorsWithLogin = (crs ?? []).filter(c => (c.users as any)?.auth_id)
  if (!bm || creatorsWithLogin.length < 1) throw new Error('need a brand member and a creator with logins')
  const brandId = bm.brand_id as string
  const C = creatorsWithLogin[0], C2 = creatorsWithLogin[1]

  // ── Guapd house rows (temporary if Phase 3 has not seeded them) ────────────
  let houseBrand = (await admin.from('brands').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseBrand) {
    houseBrand = must(await admin.from('brands').insert({ name: 'Guapd (house, RLS test)', is_guapd: true }).select('id').single(), 'house brand').id
    cleanup.push(() => admin.from('brands').delete().eq('id', houseBrand!))
  }
  let houseCreator = (await admin.from('creators').select('id').eq('is_guapd', true).maybeSingle()).data?.id as string | undefined
  if (!houseCreator) {
    houseCreator = must(await admin.from('creators').insert({ full_name: 'Guapd (house, RLS test)', is_guapd: true }).select('id').single(), 'house creator').id
    cleanup.push(() => admin.from('creators').delete().eq('id', houseCreator!))
  }

  // ── The Experience and its legs ────────────────────────────────────────────
  const tpl = must(await admin.from('deal_templates').select('id, version, settings').eq('slug', 'experience-ugc-day-shoot').single(), 'template')
  const exp = must(await admin.from('experiences').insert({
    brand_id: brandId, title: '[rls-test] Experience', status: 'confirmed', template_id: tpl.id, template_version: tpl.version,
    settings_snapshot: tpl.settings, brand_service_total_paise: 24_500_000,
  }).select('id').single(), 'experience')
  cleanup.push(() => admin.from('experiences').delete().eq('id', exp.id))

  const legBase = { status: 'agreed', deliverables: '70 × UGC video', revision_limit: 0, payment_terms: 'Net 15',
    last_offer_by: 'brand', fee_percent: 0, fee_mode: 'deducted', track: 'deals', payment_flow: 'guapd_principal_vendor_payout',
    completion_trigger: 'on_shoot_done', deliverables_owner: 'guapd', pricing_basis: 'per_deliverable', experience_id: exp.id,
    template_id: tpl.id, template_version: tpl.version, settings_snapshot: tpl.settings }
  const leg1 = must(await admin.from('deals').insert({ ...legBase, brand_id: brandId, creator_id: houseCreator, leg_role: 'brand_leg',
    title: '[rls-test] Leg 1', price_paise: 24_500_000 }).select('id').single(), 'leg 1')
  const leg2 = must(await admin.from('deals').insert({ ...legBase, brand_id: houseBrand, creator_id: C.id, leg_role: 'creator_leg',
    title: '[rls-test] Leg 2', price_paise: 1_000_000, fee_percent: 30 }).select('id').single(), 'leg 2')
  cleanup.push(() => admin.from('deals').delete().in('id', [leg1.id, leg2.id]))

  must(await admin.from('experience_creator_terms').insert({ deal_id: leg2.id, experience_id: exp.id, creator_id: C.id,
    day_rate_paise: 1_000_000, days: 1, creator_gross_paise: 1_000_000, platform_pct: 30, creator_net_paise: 700_000, guapd_margin_paise: 300_000 }).select('deal_id').single(), 'terms')
  must(await admin.from('experience_finance').insert({ experience_id: exp.id, vendor_cost_total_paise: 700_000, guapd_margin_total_paise: 23_800_000, internal_note: 'SECRET internal' }).select('experience_id').single(), 'finance')
  must(await admin.from('experience_roster').insert({ experience_id: exp.id, creator_id: C.id, added_by: 'guapd' }).select('id').single(), 'roster')
  const items = must(await admin.from('deal_deliverable_items').insert([
    { deal_id: leg2.id, label: 'Visible video', platform: 'instagram', handle: 'x', added_by: 'guapd', visible_to_creator: true },
    { deal_id: leg2.id, label: 'Hidden video', platform: 'instagram', handle: 'x', added_by: 'guapd', visible_to_creator: false },
  ]).select('id, label'), 'items')
  cleanup.push(() => admin.from('deal_deliverable_items').delete().in('id', items.map(i => i.id)))

  // Reuse a real vendor / creator_private row if one exists; delete only what we create.
  let vendor = (await admin.from('vendors').select('id').eq('creator_id', C.id).maybeSingle()).data as { id: string } | null
  if (!vendor) {
    vendor = must(await admin.from('vendors').insert({ kind: 'creator', creator_id: C.id, display_name: '[rls-test] vendor' }).select('id').single(), 'vendor')
    const vid = vendor.id
    cleanup.push(() => admin.from('vendors').delete().eq('id', vid))
    must(await admin.from('vendor_payout_details').insert({ vendor_id: vid, upi_vpa: 'secret@upi', pan: 'ABCDE1234F' }).select('vendor_id').single(), 'payout details')
  }
  const line = must(await admin.from('experience_cost_lines').insert({ experience_id: exp.id, creator_leg_deal_id: leg2.id, label: 'Day rate', category: 'day_rate',
    basis: 'per_unit', quantity: 1, unit_rate_paise: 1_000_000, total_paise: 1_000_000, provided_by: 'creator', billable_to_brand: false, payable_to_vendor_id: vendor.id }).select('id').single(), 'cost line')
  const inv = must(await admin.from('service_invoices').insert({ experience_id: exp.id, brand_id: brandId, kind: 'initial', status: 'issued',
    lines: [{ label: 'UGC production service', amount_paise: 24_500_000 }], subtotal_paise: 24_500_000, total_paise: 24_500_000 }).select('id, number').single(), 'invoice')
  const fo = must(await admin.from('deal_follow_ons').insert({ experience_id: exp.id, deal_id: leg2.id, creator_id: C.id, type: 'affiliate', trigger: 'sales_final',
    basis: 'pct_of_sales', invoicer: 'creator', pct: 5, guapd_margin_paise: 999 }).select('id').single(), 'follow-on')
  const payout = must(await admin.from('vendor_payouts').insert({ experience_id: exp.id, deal_id: leg2.id, vendor_id: vendor.id, cost_line_id: line.id,
    reason: 'Day rate (net of 30%)', amount_paise: 700_000, net_amount_paise: 700_000, idempotency_key: `rls-test-${exp.id}` }).select('id').single(), 'payout')
  const hadPrivate = !!(await admin.from('creator_private').select('creator_id').eq('creator_id', C.id).maybeSingle()).data
  if (!hadPrivate) must(await admin.from('creator_private').insert({ creator_id: C.id, shoot_day_rate_paise: 1_000_000, pan: 'ABCDE1234F' }).select('creator_id').single(), 'creator_private')
  cleanup.push(async () => {
    await admin.from('vendor_payouts').delete().eq('id', payout.id)
    await admin.from('deal_follow_ons').delete().eq('id', fo.id)
    await admin.from('experience_cost_lines').delete().eq('experience_id', exp.id)
    await admin.from('service_invoices').delete().eq('id', inv.id)
    await admin.from('experience_creator_terms').delete().eq('deal_id', leg2.id)
    await admin.from('experience_roster').delete().eq('experience_id', exp.id)
    await admin.from('experience_finance').delete().eq('experience_id', exp.id)
    if (!hadPrivate) await admin.from('creator_private').delete().eq('creator_id', C.id)
    await admin.from('events').delete().in('deal_id', [leg1.id, leg2.id])
  })

  const brand = await sessionFor((bm.users as any).auth_id)
  const creator = await sessionFor((C.users as any).auth_id)

  // ── BRAND: must never see creator money, margin, internal data or Leg 2 ────
  const G = 'brand: no creator money'
  await refused(G, 'creator terms (rate, gross, pct, net)', brand.from('experience_creator_terms').select('creator_gross_paise, platform_pct, creator_net_paise, day_rate_paise'))
  await refused(G, 'guapd_margin_paise column', brand.from('experience_creator_terms').select('guapd_margin_paise'))
  await refused(G, 'experience_finance (margin total, internal note)', brand.from('experience_finance').select('guapd_margin_total_paise, internal_note'))
  await refused(G, 'experiences.settings_snapshot (template internals)', brand.from('experiences').select('settings_snapshot').eq('id', exp.id))
  await refused(G, 'cost sheet', brand.from('experience_cost_lines').select('total_paise').eq('experience_id', exp.id))
  await refused(G, 'creator day rate (creator_private)', brand.from('creator_private').select('shoot_day_rate_paise'))
  await refused(G, 'vendors', brand.from('vendors').select('display_name'))
  await refused(G, 'vendor payout details', brand.from('vendor_payout_details').select('upi_vpa, pan'))
  await refused(G, 'vendor payouts', brand.from('vendor_payouts').select('amount_paise').eq('experience_id', exp.id))
  await refused(G, 'follow-ons', brand.from('deal_follow_ons').select('pct').eq('experience_id', exp.id))
  await refused(G, 'Leg 2 deal row (cross-leg)', brand.from('deals').select('id, price_paise').eq('id', leg2.id))
  await refused(G, 'Leg 2 items (cross-leg)', brand.from('deal_deliverable_items').select('id').eq('deal_id', leg2.id))
  const GB = 'brand: sees its own'
  await allowed(GB, 'own Experience (service price only)', brand.from('experiences').select('id, title, status, brand_service_total_paise').eq('id', exp.id), 1,
    r => r[0].brand_service_total_paise === 24_500_000 ? null : 'wrong service price')
  await allowed(GB, 'own Leg 1 deal', brand.from('deals').select('id, price_paise').eq('id', leg1.id))
  await allowed(GB, 'own service invoice', brand.from('service_invoices').select('id, number, total_paise').eq('id', inv.id), 1,
    r => /^GUAPD\/\d\d-\d\d\/\d{4}$/.test(r[0].number) ? null : `bad number ${r[0].number}`)
  await allowed(GB, 'own roster (profiles, no money columns exist)', brand.from('experience_roster').select('creator_id, brand_decision, locked').eq('experience_id', exp.id))

  // ── CREATOR: own rate / 30% / net only; never margin or Leg 1 ──────────────
  const GC = 'creator: no margin, no Leg 1'
  await refused(GC, 'guapd_margin_paise on own terms', creator.from('experience_creator_terms').select('guapd_margin_paise'))
  await refused(GC, 'experience_finance', creator.from('experience_finance').select('guapd_margin_total_paise'))
  await refused(GC, 'margin on own follow-on', creator.from('deal_follow_ons').select('guapd_margin_paise'))
  await refused(GC, 'Leg 1 deal row (cross-leg)', creator.from('deals').select('id, price_paise').eq('id', leg1.id))
  await refused(GC, 'experiences (brand price)', creator.from('experiences').select('brand_service_total_paise').eq('id', exp.id))
  await refused(GC, 'service invoices', creator.from('service_invoices').select('total_paise').eq('experience_id', exp.id))
  await refused(GC, 'roster', creator.from('experience_roster').select('id').eq('experience_id', exp.id))
  await refused(GC, 'cost sheet', creator.from('experience_cost_lines').select('total_paise'))
  await refused(GC, 'own creator_private (service-only)', creator.from('creator_private').select('shoot_day_rate_paise'))
  await refused(GC, 'vendor payout details', creator.from('vendor_payout_details').select('upi_vpa'))
  await refused(GC, 'hidden item on own leg', creator.from('deal_deliverable_items').select('id').eq('deal_id', leg2.id).eq('label', 'Hidden video'))
  const GCO = 'creator: sees its own'
  await allowed(GCO, 'own terms: rate, 30%, net', creator.from('experience_creator_terms').select('creator_gross_paise, platform_pct, creator_net_paise').eq('deal_id', leg2.id), 1,
    r => r[0].creator_gross_paise === 1_000_000 && Number(r[0].platform_pct) === 30 && r[0].creator_net_paise === 700_000 ? null : JSON.stringify(r[0]))
  await allowed(GCO, 'own Leg 2 deal', creator.from('deals').select('id').eq('id', leg2.id))
  await allowed(GCO, 'visible item on own leg', creator.from('deal_deliverable_items').select('id').eq('deal_id', leg2.id))
  await allowed(GCO, 'own payout (status)', creator.from('vendor_payouts').select('net_amount_paise, status').eq('id', payout.id))
  await allowed(GCO, 'own follow-on (pct)', creator.from('deal_follow_ons').select('pct, status').eq('id', fo.id))

  // ── Cross-creator ──────────────────────────────────────────────────────────
  if (C2) {
    const other = await sessionFor((C2.users as any).auth_id)
    await refused('cross-creator', "another creator's terms", other.from('experience_creator_terms').select('creator_net_paise').eq('deal_id', leg2.id))
    await refused('cross-creator', "another creator's payout", other.from('vendor_payouts').select('amount_paise').eq('id', payout.id))
  } else {
    results.push({ group: 'cross-creator', check: 'second creator login', ok: true, detail: 'SKIPPED: only one creator with a login' })
  }

  // ── Writes: none for users ─────────────────────────────────────────────────
  const W = 'writes refused'
  let r: any = await brand.from('experiences').insert({ brand_id: brandId, title: 'x' })
  results.push({ group: W, check: 'brand inserts an Experience', ok: !!r.error, detail: r.error?.message ?? 'INSERTED' })
  await brand.from('service_invoices').update({ status: 'paid' }).eq('id', inv.id)
  const invNow = (await admin.from('service_invoices').select('status').eq('id', inv.id).single()).data
  results.push({ group: W, check: 'brand marks its service invoice paid', ok: invNow?.status === 'issued', detail: `status ${invNow?.status}` })
  await creator.from('experience_creator_terms').update({ creator_net_paise: 9_999_999 }).eq('deal_id', leg2.id)
  const tNow = (await admin.from('experience_creator_terms').select('creator_net_paise').eq('deal_id', leg2.id).single()).data
  results.push({ group: W, check: 'creator raises own net', ok: tNow?.creator_net_paise === 700_000, detail: `net ${tNow?.creator_net_paise}` })

  // ── Integrity triggers ─────────────────────────────────────────────────────
  const I = 'integrity'
  r = await admin.from('deals').insert({ ...legBase, brand_id: brandId, creator_id: C.id, leg_role: 'creator_leg', title: 'bad leg', price_paise: 1 })
  results.push({ group: I, check: 'a leg putting brand and creator on one deal', ok: !!r.error, detail: r.error?.message ?? 'INSERTED' })
  r = await admin.from('deals').insert({ ...legBase, payment_flow: 'route_split', brand_id: houseBrand, creator_id: C.id, leg_role: 'creator_leg', title: 'route', price_paise: 1 })
  results.push({ group: I, check: 'route_split on an Experience leg', ok: !!r.error, detail: r.error?.message ?? 'INSERTED' })
  // And on an ordinary deal, so the dedicated CHECK is what refuses it, not the leg trigger.
  r = await admin.from('deals').insert({ brand_id: brandId, creator_id: C.id, status: 'negotiating', title: 'route', deliverables: 'x',
    price_paise: 1, payment_flow: 'route_split' })
  results.push({ group: I, check: 'route_split on an ordinary deal (CHECK)', ok: !!r.error && /route_split_disabled/.test(r.error.message), detail: r.error?.message ?? 'INSERTED' })
  if (!r.error) await admin.from('deals').delete().eq('title', 'route').is('experience_id', null).eq('brand_id', brandId)
  if (C2) {
    r = await admin.from('experience_creator_terms').insert({ deal_id: leg2.id, experience_id: exp.id, creator_id: C2.id })
    results.push({ group: I, check: "terms naming another creator on this leg", ok: !!r.error, detail: r.error?.message ?? 'INSERTED' })
  }
  // Should none of those be refused, remove what slipped through.
  await admin.from('deals').delete().in('title', ['bad leg', 'route']).eq('experience_id', exp.id)
}

run()
  .catch(e => { console.error('Error:', e.message ?? e); process.exitCode = 1 })
  .finally(async () => {
    for (const f of cleanup.reverse()) { try { await f() } catch (e) { console.log('cleanup:', (e as Error).message) } }
    let group = ''
    for (const x of results) {
      if (x.group !== group) { group = x.group; console.log(`\n${group}`) }
      console.log(`  ${x.ok ? '✅' : '❌'} ${x.check} — ${x.detail}`)
    }
    const bad = results.filter(x => !x.ok)
    console.log(bad.length ? `\n${bad.length} FAILED of ${results.length}` : `\nALL ${results.length} PASSED`)
    if (bad.length) process.exitCode = 1
  })
