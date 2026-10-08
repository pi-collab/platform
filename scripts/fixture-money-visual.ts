/**
 * Visual-check fixture for 0540 (invoices, payouts, completion), on STAGING.
 * One Experience in Delivering, through the real database functions:
 *   - three creators: two shot (one paid, one requested and awaiting approval), one did not shoot;
 *   - both videos shared; the brand approved one, the other awaits them;
 *   - Guapd's billing details (NOT GST-registered, provisional GSTIN) and the brand's;
 *   - invoice 1 issued with its stored PDF and a part payment (with proof); invoice 2 a draft;
 *   - no brand sign-off yet, so Completion lists what is left.
 * Two temporary staff: financial (FIN) and operational-only (OP). Guapd's
 * billing settings and the brand's profile are restored on --cleanup.
 *
 *   create:  NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-money-visual.ts
 *   remove:  … scripts/fixture-money-visual.ts --cleanup
 *
 * Nothing is sent to anyone (database functions only; no action code, so no notifications or emails).
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
import { renderInvoicePdf, type InvoiceDoc } from '../apps/web/lib/invoice-pdf'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const PREFIX = '[visual-4]'
const STATE = path.join(os.tmpdir(), 'guapd-fixture-money-visual.json')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session (auth rate limit?)')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }

async function cleanup() {
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
  if (st.files?.length) await admin.storage.from('finance-docs').remove(st.files)
  const { data: exps } = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  for (const e of exps ?? []) {
    const { data: invs } = await admin.from('service_invoices').select('pdf_path').eq('experience_id', e.id)
    const pdfs = (invs ?? []).map((i: any) => i.pdf_path).filter(Boolean)
    if (pdfs.length) await admin.storage.from('finance-docs').remove(pdfs)
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = (legs ?? []).map((l) => l.id)
    await admin.from('vendor_payouts').delete().eq('experience_id', e.id)
    await admin.from('service_invoice_payments').delete().eq('experience_id', e.id)
    await admin.from('service_invoices').delete().eq('experience_id', e.id)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', e.id)
    if (ids.length) { await admin.from('notifications').delete().in('deal_id', ids); await admin.from('events').delete().in('deal_id', ids); await admin.from('deals').delete().in('id', ids) }
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', e.id)
    await admin.from('experiences').delete().eq('id', e.id)
  }
  if (st.newVendorCreators?.length) await admin.from('vendors').delete().in('creator_id', st.newVendorCreators)
  for (const id of st.createdRates ?? []) await admin.from('creator_products').delete().eq('id', id)
  for (const p of st.priorRates ?? []) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  if ('priorSettings' in st) {
    await admin.from('guapd_billing_settings').delete().eq('id', true)
    if (st.priorSettings) await admin.from('guapd_billing_settings').insert({ id: true, ...st.priorSettings })
  }
  if (st.brandId) {
    await admin.from('brand_billing_profiles').delete().eq('brand_id', st.brandId)
    if (st.priorBilling) await admin.from('brand_billing_profiles').insert({ brand_id: st.brandId, ...st.priorBilling })
  }
  for (const g of st.grants ?? []) {
    if (st.startedAt) await admin.from('ops_events').delete().eq('actor_auth_id', g.auth).gte('created_at', st.startedAt)
    await admin.from('staff_access').delete().eq('user_id', g.id)
  }
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE)
  console.log('fixture removed')
}

async function create() {
  const startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd, name)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id)
  const X = pool.find((c) => c.id !== G?.id && c.id !== D?.id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id, email').not('auth_id', 'is', null).not('email', 'is', null).limit(200)
  const [FIN, OP] = (users ?? []).filter((u: any) => !busy.has(u.id) && /@/.test(u.email)) as any[]
  if (!B || !G || !D || !X || !FIN || !OP) throw new Error('missing actors')

  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')
  const { data: hadV } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id, X.id])
  const state: any = {
    startedAt, priorRates: had ?? [], createdRates: [], files: [], brandId: B.brand_id,
    newVendorCreators: [G.id, D.id, X.id].filter((id) => !(hadV ?? []).some((v: any) => v.creator_id === id)),
    priorSettings: (await admin.from('guapd_billing_settings').select('legal_name, address, state, gstin, gst_registered, pan, payment_instructions').maybeSingle()).data ?? null,
    priorBilling: (await admin.from('brand_billing_profiles').select('legal_name, address, state, gstin, pan, certificate_path').eq('brand_id', B.brand_id).maybeSingle()).data ?? null,
    grants: [{ id: FIN.id, auth: FIN.auth_id }, { id: OP.id, auth: OP.auth_id }],
  }
  fs.writeFileSync(STATE, JSON.stringify(state))
  must(await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }, { user_id: OP.id, experiences_operational: true, experiences_financial: false }]), 'grant')
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')
  await admin.from('guapd_billing_settings').delete().eq('id', true)
  await admin.from('brand_billing_profiles').delete().eq('brand_id', B.brand_id)
  const fin = await sessionFor(FIN.auth_id), op = await sessionFor(OP.auth_id)

  const creators = [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }, { id: X.id, rate: 600000 }]
  const E = must(await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: `${PREFIX} Kiro Beauty · Diwali UGC`, p_creator_count: 3, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' }), 'create') as string
  const q = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 3, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-10-01', p_shoot_city: 'Mumbai', p_message: null, p_channel: null }), 'quote')
  must(await fin.rpc('experience_console_accept', { p_quote_id: q, p_channel: 'email' }), 'accept')
  must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: creators.map((c) => c.id), p_added_by: 'guapd', p_channel: null }), 'roster')
  for (const r of must(await op.rpc('experience_console_roster', { p_experience_id: E }), 'roster read') as any[]) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
  for (const c of creators) { const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: c.id, p_day_rate_paise: c.rate }); if (s.data) state.createdRates.push(s.data) }
  const deal: Record<string, string> = {}, ros: Record<string, string> = {}
  for (const l of must(await op.rpc('experience_console_legs', { p_experience_id: E }), 'legs') as any[]) {
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 })
    const t = creatorLegTerms({ dayRatePaise: creators.find((c) => c.id === l.creator_id)!.rate, days: 1, track: l.track })
    deal[l.creator_id] = must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send') as string
    ros[l.creator_id] = l.roster_id
  }
  fs.writeFileSync(STATE, JSON.stringify(state))
  await admin.from('deals').update({ status: 'agreed' }).in('id', Object.values(deal))
  must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), 'schedule')
  for (const c of [G, D]) must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: ros[c.id], p_outcome: 'done', p_reason: null }), 'outcome')
  must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: ros[X.id], p_outcome: 'did_not_shoot', p_reason: 'Fell ill on the day' }), 'outcome X')
  const dv = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'deliverables') as any
  const item = (c: any) => ((dv.legs as any[]).find((l) => l.creator_id === c.id).items as any[])[0]
  for (const c of [G, D]) {
    must(await op.rpc('experience_console_item_attach', { p_item_id: item(c).id, p_url: `https://drive.google.com/file/d/${c.id.slice(0, 8)}/view`, p_storage_path: null, p_file_name: null }), 'attach')
    must(await fin.rpc('experience_console_item_review', { p_item_id: item(c).id, p_decision: 'approve', p_note: null }), 'approve')
  }
  must(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [item(G).id, item(D).id] }), 'release')
  const dv2 = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'deliverables 2') as any
  const rel = ((dv2.legs as any[]).find((l) => l.creator_id === G.id).items as any[])[0].release
  must(await op.rpc('experience_console_release_decide', { p_release_id: rel.id, p_decision: 'approved', p_channel: 'whatsapp', p_note: null }), 'decide')

  // Billing details, invoices, a part payment.
  must(await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Private Limited', p_address: '4th Floor, 12 Link Road, Andheri West, Mumbai 400053', p_state: 'Maharashtra',
    p_gstin: '27AAKCG1234M1Z5', p_gst_registered: false, p_pan: 'AAKCG1234M', p_payment_instructions: 'Bank transfer to Guapd Technologies Private Limited · HDFC Bank · A/c 50200012345678 · IFSC HDFC0000123. UPI: guapd@hdfcbank' }), 'settings')
  must(await fin.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: `${B.brands.name} Private Limited`, p_address: '2nd Floor, 88 MG Road, Bengaluru 560001', p_state: 'Karnataka', p_gstin: '29AABCK5678L1Z9', p_pan: null, p_certificate_path: null }), 'billing')
  const I1 = must(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'initial', p_source: null, p_description: 'UGC content production: Kiro Beauty Diwali shoot (3 videos)', p_subtotal_paise: 10500000,
    p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: '2026-10-31' }), 'draft 1') as string
  must(await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I1 }), 'issue 1')
  const doc = must(await fin.rpc('experience_console_invoice_doc', { p_invoice_id: I1 }), 'doc') as InvoiceDoc
  const pdfPath = must(await fin.rpc('experience_console_invoice_pdf_path', { p_invoice_id: I1 }), 'pdf path') as string
  const bytes = renderInvoicePdf(doc)
  fs.writeFileSync(path.join(os.tmpdir(), 'guapd-visual-invoice.pdf'), bytes)
  must(await admin.storage.from('finance-docs').upload(pdfPath, bytes, { contentType: 'application/pdf' }) as any, 'pdf upload')
  must(await fin.rpc('experience_console_invoice_set_pdf', { p_invoice_id: I1, p_path: pdfPath }), 'set pdf')
  const slot = must(await fin.rpc('experience_finance_upload_slot', { p_kind: 'invoice-payment', p_target_id: I1, p_file_name: 'neft-receipt.png' }), 'slot') as string
  await admin.storage.from('finance-docs').upload(slot, PNG, { contentType: 'image/png' }); state.files.push(slot)
  must(await fin.rpc('experience_console_invoice_payment_add', { p_invoice_id: I1, p_amount_paise: 5000000, p_tds_paise: 0, p_received_on: today(), p_method: 'bank_transfer', p_reference: 'HDFCN52026100812345', p_proof_path: slot }), 'payment')
  must(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'additional', p_source: 'existing_footage', p_description: 'Additional: two cut-downs from existing footage', p_subtotal_paise: 1500000,
    p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: null }), 'draft 2')

  // Payouts: G requested (OP), approved (FIN), paid with proof; D requested by FIN.
  const PG = must(await op.rpc('experience_console_payout_request', { p_deal_id: deal[G.id], p_tds_paise: 70000 }), 'request G') as string
  must(await fin.rpc('experience_console_payout_approve', { p_payout_id: PG }), 'approve G')
  const ps = must(await op.rpc('experience_finance_upload_slot', { p_kind: 'payout-proof', p_target_id: PG, p_file_name: 'upi-receipt.png' }), 'payout slot') as string
  await admin.storage.from('finance-docs').upload(ps, PNG, { contentType: 'image/png' }); state.files.push(ps)
  must(await op.rpc('experience_console_payout_paid', { p_payout_id: PG, p_paid_on: today(), p_method: 'upi', p_reference: 'UPI/628171234567', p_proof_path: ps }), 'paid G')
  must(await fin.rpc('experience_console_payout_request', { p_deal_id: deal[D.id], p_tds_paise: 0 }), 'request D')
  fs.writeFileSync(STATE, JSON.stringify(state))
  console.log(JSON.stringify({ E, FIN: { id: FIN.id, email: FIN.email }, OP: { id: OP.id, email: OP.email }, brandUser: B.user_id, creatorG: G.id, dealG: deal[G.id], pdf: path.join(os.tmpdir(), 'guapd-visual-invoice.pdf') }))
}

;(process.argv.includes('--cleanup') ? cleanup() : create()).catch((e) => { console.error(e); process.exit(1) })
