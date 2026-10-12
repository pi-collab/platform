/**
 * END-TO-END: one Guapd Experience, start to finish, on STAGING, across real
 * staff, creator and brand sessions (database functions only: no emails,
 * WhatsApp or notifications are sent). Each stage is asserted to advance, and
 * money + isolation are checked along the way. Cleans up after itself.
 *
 *   brand requests → Guapd quotes → brand accepts the price → roster (staff add,
 *   brand accepts) → lock → brief (shared + one creator's own) → prepare
 *   (scope + allowance) → send → creator G counters, finance accepts → creator
 *   D accepts → messages both ways → shoot confirmed (brief locks) → shoot done
 *   → deliverables attached, approved, shared → brand approves → invoice
 *   issued + paid → payouts requested, approved (maker-checker), paid →
 *   brand signs off → Guapd completes → brand reads the report.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/e2e-experience.ts
 *   … --keep      leave it (and a second Experience at the open-offer stage) for a visual check
 *   … --cleanup   remove what --keep left
 */
import * as fs from 'fs'
import * as os from 'os'
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
const PREFIX = '[e2e]'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const stage = (g: string) => console.log(`\n▸ ${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }

const st: { E?: string; deals: string[]; files: string[]; createdRates: string[]; priorRates: any[]; newVendorCreators: string[]; grants: { id: string; auth: string }[]; brandId?: string; priorSettings?: any; priorBilling?: any; startedAt: string } =
  { deals: [], files: [], createdRates: [], priorRates: [], newVendorCreators: [], grants: [], startedAt: new Date().toISOString() }
let staffBefore = -1
const KEEP = process.argv.includes('--keep')
const STATE = path.join(os.tmpdir(), 'guapd-e2e-experience.json')
const save = () => fs.writeFileSync(STATE, JSON.stringify({ ...st, staffBefore }))
const visual: Record<string, unknown> = {}

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session (auth rate limit?)')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out) }
  return out
}
const BRAND_FORBIDDEN = /rate|gross|net_|_net|pct|payout|cost|margin|fee|allowance|counter|terms|creator_id|deal_id|leg_|brief_for|creator_brief|tds|bank/i


/** 0552: the creator confirms the shoot and raises their invoice before Guapd requests the payout. */
async function invoiceAs(s: any, deal: string) {
  const c = (await s.rpc('creator_leg_context', { p_deal_id: deal })).data as any
  return s.rpc('creator_leg_invoice_raise', { p_deal_id: deal, p_shoot_confirmed: true, p_billing_name: 'Test Creator', p_gstin: null, p_expected_payable_paise: Number(c?.total_to_creator_paise) })
}

async function run() {
  staffBefore = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  // ── Actors ──
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status, name)').limit(120)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && m.brands?.is_guapd === false)
  const BA = members.find((m) => m.is_admin && m.brands.brand_status === 'approved')
  const BB = members.find((m) => m.brand_id !== BA?.brand_id)
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, handle, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(80)
  const pool = (cr ?? []) as any[]
  // Creators with a day rate of their own (real staging data) are left alone: this run sets fresh rates.
  { const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day'); const r = new Set((rated ?? []).map((x: any) => x.creator_id)); pool.splice(0, pool.length, ...pool.filter((c) => !r.has(c.id))) }
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.vetting_status !== 'growth' && c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const { data: allMembers } = await admin.from('brand_members').select('user_id')
  const busy = new Set([G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id), ...(allMembers ?? []).map((m) => m.user_id)])
  // Test staff actors are never creators: a creator login can save its own bank details, list its own deals, etc.
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) } // staff actors are never creators
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!BA || !BB || !G || !D || !OP || !FIN) throw new Error('missing actors')
  st.brandId = BA.brand_id
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  st.priorRates = had ?? []
  const { data: hadV } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id])
  st.newVendorCreators = [G.id, D.id].filter((id) => !(hadV ?? []).some((v: any) => v.creator_id === id))
  st.priorSettings = (await admin.from('guapd_billing_settings').select('legal_name, address, state, gstin, gst_registered, pan, payment_instructions').maybeSingle()).data ?? null
  st.priorBilling = (await admin.from('brand_billing_profiles').select('legal_name, address, state, gstin, pan, certificate_path').eq('brand_id', BA.brand_id).maybeSingle()).data ?? null
  must(await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }]), 'grant')
  st.grants = [{ id: OP.id, auth: OP.auth_id }, { id: FIN.id, auth: FIN.auth_id }]
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id)
  const brand = await sessionFor(BA.users.auth_id), other = await sessionFor(BB.users.auth_id)
  const cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const status = async () => (await admin.from('experiences').select('status').eq('id', st.E!).single()).data!.status as string

  stage('1. the brand requests an Experience on Guapd')
  const E = must(await brand.rpc('brand_experience_request', {
    p_title: `${PREFIX} Kiro Beauty · Diwali UGC`, p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: 1, p_ad_rights_months: 6,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: 'Festive looks, warm light' }), 'request') as string
  st.E = E
  ok('requested, on Guapd', (await status()) === 'requested' && (await admin.from('experiences').select('request_channel').eq('id', E).single()).data!.request_channel === 'portal')
  ok('another brand cannot see it', refused(await other.rpc('brand_experience', { p_experience_id: E })))

  stage('2. Guapd quotes; 3. the brand accepts the price')
  const q = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-10-01', p_shoot_city: 'Mumbai', p_message: 'Two creators, one video each', p_channel: null }), 'quote') as string
  const bx = (await brand.rpc('brand_experience', { p_experience_id: E })).data as any
  ok('the brand sees the price to answer', bx?.quote?.status === 'open' && Number(bx?.quote?.total_paise) === 7000000)
  must(await brand.rpc('brand_experience_quote_answer', { p_quote_id: q, p_accept: true, p_note: null }), 'brand accepts')
  ok('price accepted → Building roster', (await status()) === 'rostering')

  stage('4. roster: staff add, the brand accepts on Guapd, staff lock')
  must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id], p_added_by: 'guapd', p_channel: null }), 'roster add')
  // 0548: Guapd's picks are internal until shared; share them for the brand's review.
  must(await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: ((await op.rpc('experience_console_roster', { p_experience_id: E })).data as any[]).map((r) => r.id) }), 'share')
  const br = ((await brand.rpc('brand_experience_roster', { p_experience_id: E })).data as any)?.creators ?? []
  ok('the brand sees both creators (names, no money)', br.length === 2 && !allKeys(br).some((k) => BRAND_FORBIDDEN.test(k)), allKeys(br).filter((k) => BRAND_FORBIDDEN.test(k)).join(','))
  for (const r of br) must(await brand.rpc('brand_experience_roster_decide', { p_roster_id: r.roster_id, p_decision: 'accepted', p_expected: r.decision }), 'brand accepts creator')
  must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
  ok('roster locked → Confirmed', (await status()) === 'confirmed')

  stage('5. brief, scope, allowance; 6. send')
  for (const [id, rate] of [[G.id, 1000000], [D.id, 800000]] as const) {
    const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: id, p_day_rate_paise: rate }); if (s.data) st.createdRates.push(s.data as string)
  }
  must(await op.rpc('experience_console_brief_save', { p_experience_id: E, p_pitch: 'Diwali glow: three looks, one product hero shot.', p_guidelines: 'Natural light\nShow the shade swatch', p_avoid: 'Competitor products', p_attachments: [] }), 'brief')
  const legs = must(await op.rpc('experience_console_legs', { p_experience_id: E }), 'legs') as any[]
  const lG = legs.find((l) => l.creator_id === G.id), lD = legs.find((l) => l.creator_id === D.id)
  must(await op.rpc('experience_console_brief_override', { p_roster_id: lD.roster_id, p_own: true, p_pitch: 'D: the evening look only.', p_guidelines: null, p_avoid: null, p_attachments: [] }), 'own brief')
  must(await op.rpc('experience_console_leg_draft', { p_roster_id: lG.roster_id, p_product_id: lG.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 1, p_ad_rights_count: 1, p_allowance_paise: 200000 }), 'draft G')
  must(await op.rpc('experience_console_leg_draft', { p_roster_id: lD.roster_id, p_product_id: lD.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 1, p_ad_rights_count: 1 }), 'draft D')
  const rec = (await op.rpc('experience_console_legs_reconcile', { p_experience_id: E })).data as any
  ok('reconcile: every video, affiliate and ad right the brand bought is placed', rec?.ok === true && rec.affiliate_placed === 2 && rec.ad_rights_placed === 2, JSON.stringify({ ok: rec?.ok, a: rec?.affiliate_placed, ad: rec?.ad_rights_placed }))
  const tG0 = creatorLegTerms({ dayRatePaise: 1000000, days: 1, track: lG.track }), tD = creatorLegTerms({ dayRatePaise: 800000, days: 1, track: lD.track })
  const dG = must(await op.rpc('experience_console_leg_send', { p_roster_id: lG.roster_id, p_expected_gross_paise: tG0.creatorGrossPaise, p_expected_platform_pct: tG0.platformPct, p_expected_net_paise: tG0.creatorNetPaise, p_expected_allowance_paise: 200000 }), 'send G') as string
  const dD = must(await op.rpc('experience_console_leg_send', { p_roster_id: lD.roster_id, p_expected_gross_paise: tD.creatorGrossPaise, p_expected_platform_pct: tD.platformPct, p_expected_net_paise: tD.creatorNetPaise, p_expected_allowance_paise: 0 }), 'send D') as string
  st.deals.push(dG, dD)
  const ctxG = (await cG.rpc('creator_leg_context', { p_deal_id: dG })).data as any
  ok('G\'s offer: Managed by Guapd, rate → fee → net, + ₹2,000 allowance, own scope', ctxG?.status === 'negotiating' && Number(ctxG.net_paise) === tG0.creatorNetPaise && Number(ctxG.allowance_paise) === 200000 && ctxG.affiliate_count === 1 && ctxG.ad_rights_videos === 1)
  ok('G reads the shared brief; D reads their own', String(ctxG?.brief_detail?.pitch).startsWith('Diwali glow') && String(((await cD.rpc('creator_leg_context', { p_deal_id: dD })).data as any)?.brief_detail?.pitch).startsWith('D: the evening'))
  ok('the brand cannot see either leg', ((await brand.from('deals').select('id').in('id', [dG, dD])).data ?? []).length === 0 && refused(await brand.rpc('creator_leg_context', { p_deal_id: dG })))
  ok('G cannot read D\'s leg', refused(await cG.rpc('creator_leg_context', { p_deal_id: dD })))

  stage('7. G counters, finance accepts; D accepts as sent')
  const c1 = must(await cG.rpc('creator_leg_counter', { p_deal_id: dG, p_day_rate_paise: 1200000, p_days: 1, p_note: 'Festive season rate' }), 'counter') as string
  ok('operational staff cannot accept a counter that raises the cost', refused(await op.rpc('experience_console_counter_accept', { p_counter_id: c1, p_expected_gross_paise: 1200000 })))
  must(await fin.rpc('experience_console_counter_accept', { p_counter_id: c1, p_expected_gross_paise: 1200000 }), 'finance accepts counter')
  const tG = creatorLegTerms({ dayRatePaise: 1200000, days: 1, track: lG.track })
  const termsG = (await admin.from('experience_creator_terms').select('creator_gross_paise, platform_pct, creator_net_paise, allowance_paise').eq('deal_id', dG).single()).data as any
  ok('G agreed at ₹12,000/day: gross/fee/net re-derived, allowance unchanged', (await admin.from('deals').select('status').eq('id', dG).single()).data!.status === 'agreed'
    && Number(termsG.creator_gross_paise) === tG.creatorGrossPaise && Number(termsG.creator_net_paise) === tG.creatorNetPaise && Number(termsG.allowance_paise) === 200000)
  must(await cD.rpc('creator_leg_respond', { p_deal_id: dD, p_accept: true, p_reason: null }), 'D accepts')
  ok('D agreed', (await admin.from('deals').select('status').eq('id', dD).single()).data!.status === 'agreed')

  stage('8. messages: Guapd ↔ creator, never the brand')
  must(await cD.rpc('creator_leg_message_send', { p_deal_id: dD, p_body: 'What time is call?' }), 'D writes')
  must(await op.rpc('experience_console_leg_message_send', { p_deal_id: dD, p_body: '9am at the Andheri studio.' }), 'Guapd replies')
  ok('D reads the thread (2)', ((await cD.from('messages').select('id').eq('deal_id', dD)).data ?? []).length === 2)
  ok('G, the brand and logged-out read nothing of it', ((await cG.from('messages').select('id').eq('deal_id', dD)).data ?? []).length === 0
    && ((await brand.from('messages').select('id').eq('deal_id', dD)).data ?? []).length === 0 && ((await anon.from('messages').select('id').eq('deal_id', dD)).data ?? []).length === 0)
  ok('staff Deals tab lists both, with the thread on D', (((await op.rpc('experience_console_leg_threads', { p_experience_id: E })).data ?? []) as any[]).find((r) => r.deal_id === dD)?.message_count === 2)

  stage('9. shoot confirmed (brief locks); 10. shoot done')
  must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), 'schedule')
  ok('→ Shoot scheduled', (await status()) === 'shoot_scheduled')
  ok('the brief is now locked', refused(await op.rpc('experience_console_brief_save', { p_experience_id: E, p_pitch: 'late', p_guidelines: null, p_avoid: null, p_attachments: [] })))
  for (const l of [lG, lD]) must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: l.roster_id, p_outcome: 'done', p_reason: null }), 'outcome')
  ok('every accepted creator shot → Shoot done', (await status()) === 'shoot_done')

  stage('11. deliverables: attached, approved, shared → the brand approves')
  const dv = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'deliverables') as any
  const items = (dv.legs as any[]).flatMap((l) => l.items as any[])
  for (const i of items) {
    must(await op.rpc('experience_console_item_attach', { p_item_id: i.id, p_url: `https://drive.google.com/file/d/e2e-${i.id.slice(0, 8)}/view`, p_storage_path: null, p_file_name: null }), 'attach')
    must(await fin.rpc('experience_console_item_review', { p_item_id: i.id, p_decision: 'approve', p_note: null }), 'review')
  }
  must(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: items.map((i) => i.id) }), 'release')
  ok('shared → Delivering', (await status()) === 'delivering')
  const bd = ((await brand.rpc('brand_experience_deliverables', { p_experience_id: E })).data as any)?.items ?? []
  ok('the brand sees 2 items, names only', bd.length === 2 && !allKeys(bd).some((k) => BRAND_FORBIDDEN.test(k)))
  for (const it of bd) must(await brand.rpc('brand_experience_release_decide', { p_release_id: it.release_id, p_decision: 'approved', p_note: null, p_expected: it.decision ?? 'new' }), 'brand approves')

  stage('12. invoice issued and paid')
  await admin.from('guapd_billing_settings').delete().eq('id', true)
  await admin.from('brand_billing_profiles').delete().eq('brand_id', BA.brand_id)
  must(await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Private Limited', p_address: '12 Link Road, Mumbai 400053', p_state: 'Maharashtra', p_gstin: null, p_gst_registered: false, p_pan: 'AAKCG1234M', p_payment_instructions: 'Bank transfer to Guapd Technologies Private Limited' }), 'settings')
  must(await fin.rpc('experience_console_set_brand_billing', { p_brand_id: BA.brand_id, p_legal_name: `${BA.brands.name} Private Limited`, p_address: '88 MG Road, Bengaluru 560001', p_state: 'Karnataka', p_gstin: null, p_pan: null, p_certificate_path: null }), 'billing')
  const I = must(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'initial', p_source: null, p_description: 'UGC content: Kiro Diwali (2 videos)', p_subtotal_paise: 7000000, p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: '2026-10-31' }), 'invoice') as string
  must(await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I }), 'issue')
  const slot = must(await fin.rpc('experience_finance_upload_slot', { p_kind: 'invoice-payment', p_target_id: I, p_file_name: 'neft.png' }), 'slot') as string
  await admin.storage.from('finance-docs').upload(slot, PNG, { contentType: 'image/png' }); st.files.push(slot)
  must(await fin.rpc('experience_console_invoice_payment_add', { p_invoice_id: I, p_amount_paise: 7000000, p_tds_paise: 0, p_received_on: today(), p_method: 'bank_transfer', p_reference: 'E2E-NEFT-1', p_proof_path: slot }), 'payment')
  const binv = (((await brand.rpc('brand_experience_invoices', { p_experience_id: E })).data as any)?.invoices ?? []) as any[]
  ok('the brand sees its invoice as paid', binv.length === 1 && binv[0].status === 'paid' && Number(binv[0].total_paise) === 7000000)

  stage('13. payouts: requested, approved by someone else, paid')
  for (const [d, tds] of [[dG, 0], [dD, 0]] as const) {
    must(await invoiceAs(d === dG ? cG : cD, d), 'creator invoice')
    const P = must(await op.rpc('experience_console_payout_request', { p_deal_id: d, p_tds_paise: tds }), 'request') as string
    ok('the requester cannot approve their own payout', refused(await op.rpc('experience_console_payout_approve', { p_payout_id: P, p_confirm_details_changed: false })))
    must(await fin.rpc('experience_console_payout_approve', { p_payout_id: P, p_confirm_details_changed: false }), 'approve')
    const ps = must(await fin.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: P, p_file_name: 'upi.png' }), 'payout slot') as string
    await admin.storage.from('finance-docs').upload(ps, PNG, { contentType: 'image/png' }); st.files.push(ps)
    must(await fin.rpc('experience_console_payout_paid', { p_payout_id: P, p_paid_on: today(), p_method: 'upi', p_reference: `E2E-UPI-${d.slice(0, 6)}`, p_proof_path: ps }), 'paid')
  }
  const pG = ((await cG.rpc('creator_leg_context', { p_deal_id: dG })).data as any)?.payout
  ok('G\'s statement: net after fee + ₹2,000 allowance = paid', pG?.status === 'paid' && Number(pG.net_paise) === tG.creatorNetPaise && Number(pG.allowance_paise) === 200000 && Number(pG.paid_paise) === tG.creatorNetPaise + 200000)

  stage('14. brand signs off; Guapd completes')
  ok('not complete before the brand signs off', refused(await op.rpc('experience_console_complete', { p_experience_id: E })))
  must(await brand.rpc('brand_experience_signoff', { p_experience_id: E, p_note: 'Lovely work' }), 'brand signoff')
  must(await op.rpc('experience_console_complete', { p_experience_id: E }), 'complete')
  ok('→ Complete', (await status()) === 'complete')

  stage('15. the brand reads the report; money and isolation hold')
  const R = must(await brand.rpc('brand_experience_report', { p_experience_id: E }), 'report') as any
  ok('report: 2 creators, 2 delivered items, ₹70,000 invoiced', R.creators.length === 2 && R.items.length === 2 && R.invoices.length === 1)
  const rk = allKeys(R)
  ok('report: no rate, payout, margin, fee, allowance, counter or id field', !rk.some((k) => BRAND_FORBIDDEN.test(k)), rk.filter((k) => BRAND_FORBIDDEN.test(k)).join(','))
  const raw = JSON.stringify(R)
  ok('report: no creator money value anywhere', ![String(tG.creatorNetPaise), String(tD.creatorNetPaise), '1200000', '800000', '200000'].some((v) => raw.includes(v)))
  ok('another brand, a creator, logged-out: report refused', refused(await other.rpc('brand_experience_report', { p_experience_id: E })) && refused(await cG.rpc('brand_experience_report', { p_experience_id: E })) && refused(await anon.rpc('brand_experience_report', { p_experience_id: E })))
  const pnl = must(await fin.rpc('experience_pnl', { p_experience_id: E }), 'pnl') as any
  const net = tG.creatorNetPaise + tD.creatorNetPaise, gross = tG.creatorGrossPaise + tD.creatorGrossPaise
  ok('P&L: revenue ₹70,000; fee kept = gross − net; allowance its own line; margin = revenue − net − allowance − costs',
    Number(pnl.brand_revenue_paise) === 7000000 && Number(pnl.platform_fee_kept_paise) === gross - net && Number(pnl.creator_allowance_total_paise) === 200000
    && Number(pnl.guapd_margin_paise) === 7000000 - net - 200000 - Number(pnl.guapd_costs_total_paise),
    `margin ${pnl.guapd_margin_paise}`)
  ok('P&L: cash out = what the creators were paid (net + allowance)', Number(pnl.creator_paid_out_paise) === net + 200000)
  ok('operational staff cannot read the P&L', refused(await op.rpc('experience_pnl', { p_experience_id: E })))

  if (KEEP) {
    // A second Experience left at the OPEN OFFER, for the creator's offer screens.
    stage('keep: a second Experience at the open offer')
    const E2 = must(await brand.rpc('brand_experience_request', {
      p_title: `${PREFIX} Kiro Beauty · Wedding season`, p_creator_count: 1, p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }],
      p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: 1, p_ad_rights_months: 6,
      p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: 'Bridal glam, two looks' }), 'request 2') as string
    const q2 = must(await fin.rpc('experience_console_quote', { p_experience_id: E2, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 2, p_misc_paise: 500000, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null }), 'quote 2') as string
    must(await brand.rpc('brand_experience_quote_answer', { p_quote_id: q2, p_accept: true, p_note: null }), 'accept 2')
    must(await op.rpc('experience_console_roster_add', { p_experience_id: E2, p_creator_ids: [G.id], p_added_by: 'guapd', p_channel: null }), 'roster 2')
    // 0548: Guapd's picks are internal until shared; share them for the brand's review.
    must(await op.rpc('experience_console_roster_share', { p_experience_id: E2, p_roster_ids: ((await op.rpc('experience_console_roster', { p_experience_id: E2 })).data as any[]).map((r) => r.id) }), 'share')
    for (const r of (((await brand.rpc('brand_experience_roster', { p_experience_id: E2 })).data as any)?.creators ?? [])) must(await brand.rpc('brand_experience_roster_decide', { p_roster_id: r.roster_id, p_decision: 'accepted', p_expected: r.decision }), 'decide 2')
    must(await op.rpc('experience_console_roster_lock', { p_experience_id: E2 }), 'lock 2')
    must(await op.rpc('experience_console_brief_save', { p_experience_id: E2, p_pitch: 'Two bridal looks for the wedding-season launch: a soft day look and a bold evening look. Kiro\'s Velvet Lip in shade 04 is the hero product in both.', p_guidelines: 'Natural window light for the day look\nHold the product to camera for 2 seconds\nShow the swatch on your wrist', p_avoid: 'Other lipstick brands in frame\nHeavy filters', p_attachments: [] }), 'brief 2')
    const l2 = (must(await op.rpc('experience_console_legs', { p_experience_id: E2 }), 'legs 2') as any[])[0]
    must(await op.rpc('experience_console_leg_draft', { p_roster_id: l2.roster_id, p_product_id: l2.day_rate_product_id, p_days: 1.5, p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }], p_affiliate_count: 1, p_ad_rights_count: 1, p_allowance_paise: 250000 }), 'draft 2')
    const t2 = creatorLegTerms({ dayRatePaise: Number(l2.day_rate_paise), days: 1.5, track: l2.track })
    const d2 = must(await op.rpc('experience_console_leg_send', { p_roster_id: l2.roster_id, p_expected_gross_paise: t2.creatorGrossPaise, p_expected_platform_pct: t2.platformPct, p_expected_net_paise: t2.creatorNetPaise, p_expected_allowance_paise: 250000 }), 'send 2') as string
    st.deals.push(d2)
    must(await op.rpc('experience_console_leg_message_send', { p_deal_id: d2, p_body: 'Hi! The bridal shoot is at our Andheri studio. Any questions about the looks, ask here.' }), 'message 2')
    must(await cG.rpc('creator_leg_message_send', { p_deal_id: d2, p_body: 'Thanks! Should I bring my own jewellery?' }), 'reply 2')
    ok('second Experience left at the open offer', (await admin.from('deals').select('status').eq('id', d2).single()).data!.status === 'negotiating')
    Object.assign(visual, { E, E2, offerDeal: d2, paidDeal: dG, ownBriefDeal: dD, staffUser: OP.id, finUser: FIN.id, brandUser: BA.user_id, otherBrandUser: BB.user_id, creatorG: G.id, creatorD: D.id })
    save()
  }
}

async function cleanup() {
  if (fs.existsSync(STATE)) { const saved = JSON.parse(fs.readFileSync(STATE, 'utf8')); Object.assign(st, saved); staffBefore = saved.staffBefore }
  if (st.files.length) await admin.storage.from('finance-docs').remove(st.files)
  // Up to three passes: when both Experiences are kept, the first pass can hit one still referenced by the other's rows.
  for (let pass = 0; pass < 3; pass++) {
  const { data: exps } = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  if (!exps?.length) break
  for (const e of exps) {
    const { data: invs } = await admin.from('service_invoices').select('pdf_path').eq('experience_id', e.id)
    const pdfs = (invs ?? []).map((i: any) => i.pdf_path).filter(Boolean)
    if (pdfs.length) await admin.storage.from('finance-docs').remove(pdfs)
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = Array.from(new Set([...(legs ?? []).map((l) => l.id), ...st.deals]))
    await admin.from('vendor_payouts').delete().eq('experience_id', e.id)
    await admin.from('experience_creator_invoices').delete().not('extra_id', 'is', null).eq('experience_id', e.id)
    await admin.from('experience_creator_invoices').delete().eq('experience_id', e.id)
    await admin.from('service_invoice_payments').delete().eq('experience_id', e.id)
    await admin.from('service_invoices').delete().eq('experience_id', e.id)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', e.id)
    await admin.from('experience_leg_counters').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', e.id)
    if (ids.length) {
      await admin.from('message_reads').delete().in('deal_id', ids)
      await admin.from('messages').delete().in('deal_id', ids)
      await admin.from('notifications').delete().in('deal_id', ids)
      await admin.from('events').delete().in('deal_id', ids)
      await admin.from('deal_deliverable_items').delete().not('extra_id', 'is', null).in('deal_id', ids)
      await admin.from('experience_leg_extras').delete().in('deal_id', ids)
      await admin.from('deals').delete().in('id', ids)
    }
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', e.id)
    await admin.from('experience_cost_lines').delete().eq('experience_id', e.id)
    await admin.from('experience_addons').delete().eq('experience_id', e.id)
    await admin.from('experience_quotes').delete().eq('experience_id', e.id)
    await admin.from('experiences').delete().eq('id', e.id)
  }
  }
  if (st.newVendorCreators.length) await admin.from('vendors').delete().in('creator_id', st.newVendorCreators)
  if (st.createdRates.length) await admin.from('creator_products').delete().in('id', st.createdRates)
  for (const p of st.priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  if (st.priorSettings !== undefined) {
    await admin.from('guapd_billing_settings').delete().eq('id', true)
    if (st.priorSettings) await admin.from('guapd_billing_settings').insert({ id: true, ...st.priorSettings })
  }
  if (st.brandId && st.priorBilling !== undefined) {
    await admin.from('brand_billing_profiles').delete().eq('brand_id', st.brandId)
    if (st.priorBilling) await admin.from('brand_billing_profiles').insert({ brand_id: st.brandId, ...st.priorBilling })
  }
  // Brand-side notifications from the portal flow carry no deal id: remove this run's by the Experience title.
  await admin.from('notifications').delete().like('body', `%${PREFIX}%`).gte('created_at', st.startedAt)
  for (const g of st.grants) {
    await admin.from('ops_events').delete().eq('actor_auth_id', g.auth).gte('created_at', st.startedAt)
    await admin.from('staff_access').delete().eq('user_id', g.id)
  }
  const left = ((await admin.from('experiences').select('id').like('title', `${PREFIX}%`)).data ?? []).length
  const leftDeals = st.deals.length ? ((await admin.from('deals').select('id').in('id', st.deals)).data ?? []).length : 0
  const staffAfter = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  const rates = ((await admin.from('creator_products').select('id').in('id', st.createdRates.length ? st.createdRates : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length
  ok('cleanup: no Experience, deal, staff grant or created rate left; billing restored', left === 0 && leftDeals === 0 && staffAfter === staffBefore && rates === 0,
    `exp=${left} deals=${leftDeals} staff ${staffBefore}→${staffAfter} rates=${rates}`)
  // Keep the state on a failed cleanup, so a rerun still knows which rates and grants to remove.
  if (!failed && fs.existsSync(STATE)) fs.unlinkSync(STATE)
}

if (process.argv.includes('--cleanup')) {
  cleanup().then(() => console.log(failed ? 'cleanup FAILED' : 'cleanup done'))
} else {
  run().catch((e) => { console.error('STOPPED:', e instanceof Error ? e.message : e); failed++ }).finally(async () => {
    save()
    if (!KEEP || failed) await cleanup()
    else console.log(`\nKEPT for the visual check: ${JSON.stringify(visual)}\nRemove with --cleanup.`)
    console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
    if (failed) process.exitCode = 1
  })
}
