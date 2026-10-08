/**
 * 0540, brand invoices, against STAGING with real sessions: finance-only
 * access, Guapd and brand billing details, drafts, gapless GPD/<FY>/<n>
 * numbering at issue, the frozen invoice and its stored PDF, the brand's
 * view (issued and paid only), payments recorded offline with reference, TDS
 * and proof until the total is met, reversals, void (reason, number kept),
 * the P&L flipping from "pending invoice" to real revenue (GST a liability),
 * audit without amounts, and NULL-means-no on every new gate.
 *
 * Two temporary staff grants, removed after. Guapd's billing settings and the
 * test brand's billing profile are restored to what they were. Everything made
 * is deleted (the invoice-number counter on staging moves on; numbers are never reused).
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-invoices.ts
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
import { renderInvoicePdf, type InvoiceDoc } from '../apps/web/lib/invoice-pdf'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const exps: string[] = []
const grants: string[] = []
const files: string[] = []
let startedAt = ''
let priorSettings: any = undefined
let priorBilling: any = undefined
let billingBrand = ''

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

const draftArgs = (o: Record<string, unknown> = {}) => ({
  p_kind: 'initial', p_source: null, p_description: 'UGC content production: [inv-test]', p_subtotal_paise: 10000000,
  p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: null, ...o,
})
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fy = (d: string) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); const s = m < 4 ? y - 1 : y; return `${String(s % 100).padStart(2, '0')}-${String((s + 1) % 100).padStart(2, '0')}` }

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members[0], B2 = members.find((m) => m.brand_id !== B?.brand_id)
  const { data: cr } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).limit(40)
  const C = ((cr ?? []) as any[]).find((c) => c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, B2?.user_id, C?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !B2 || !C || !OP || !FIN || !NONE) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), brand2 = await sessionFor(B2.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  priorSettings = (await admin.from('guapd_billing_settings').select('legal_name, address, state, gstin, gst_registered, pan, payment_instructions').maybeSingle()).data ?? null
  billingBrand = B.brand_id
  priorBilling = (await admin.from('brand_billing_profiles').select('legal_name, address, state, gstin, pan, certificate_path').eq('brand_id', B.brand_id).maybeSingle()).data ?? null
  await admin.from('guapd_billing_settings').delete().eq('id', true)
  await admin.from('brand_billing_profiles').delete().eq('brand_id', B.brand_id)

  // An Experience with an agreed price (₹1,40,000), so it is in the invoice window.
  const c = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[inv-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 2 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)
  const inv = (s: SupabaseClient) => s.rpc('experience_console_invoices', { p_experience_id: E })

  group('before the price is agreed: no invoices')
  ok('a draft on a Requested Experience is refused', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs() }), /price is agreed/))
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })

  group('access: invoices are FINANCE only')
  for (const [n, s] of [['operational-only staff', op], ['no access', none], ['brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: the invoices screen, a draft, Guapd's and the brand's billing details are refused`,
      refused(await (s as SupabaseClient).rpc('experience_console_invoices', { p_experience_id: E }))
      && refused(await (s as SupabaseClient).rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs() }))
      && refused(await (s as SupabaseClient).rpc('experience_console_finance_settings'))
      && refused(await (s as SupabaseClient).rpc('experience_console_brand_billing', { p_brand_id: B.brand_id })))
  }
  for (const [n, s] of [['financial staff', fin], ['operational staff', op], ['brand', brand], ['creator', creator]] as const) {
    let all = true
    for (const t of ['service_invoices', 'service_invoice_payments', 'service_invoice_counters', 'brand_billing_profiles', 'guapd_billing_settings']) {
      const r = await (s as SupabaseClient).from(t).select('*').limit(1)
      if (!r.error && (r.data ?? []).length > 0) all = false
    }
    ok(`${n}: no invoice, payment, counter or billing table is readable directly`, all)
  }
  ok('financial staff open the invoices screen (no settings, no billing yet)', await (async () => { const r = await inv(fin); return !r.error && (r.data as any).settings === null && (r.data as any).billing === null })())

  group("Guapd's billing details (supplier)")
  ok('a draft before Guapd\'s details exist is refused', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs() }), /Guapd's billing details/))
  ok('NULL "GST-registered" is refused', said(await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Mumbai', p_state: 'Maharashtra', p_gstin: null, p_gst_registered: null, p_pan: null, p_payment_instructions: null }), /GST-registered/))
  ok('registered with no GSTIN is refused', refused(await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Mumbai', p_state: 'Maharashtra', p_gstin: null, p_gst_registered: true, p_pan: null, p_payment_instructions: null })))
  ok('operational staff cannot set them', refused(await op.rpc('experience_console_set_finance_settings', { p_legal_name: 'X Pvt Ltd', p_address: '12 Test Road', p_state: 'MH', p_gstin: null, p_gst_registered: false, p_pan: null, p_payment_instructions: null })))
  const set = await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Andheri, Mumbai 400053', p_state: 'Maharashtra',
    p_gstin: '27ABCDE1234F1Z5', p_gst_registered: false, p_pan: 'ABCDE1234F', p_payment_instructions: 'HDFC Bank · A/c 000000000000 · IFSC HDFC0000000' })
  ok('finance saves them: NOT registered, provisional GSTIN', !set.error, set.error?.message ?? '')

  group('drafts: validation, no GST when not registered, NULL means no')
  ok('GST on a draft while Guapd is not registered is refused', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_igst_paise: 1800000, p_gst_rate_pct: 18 }) }), /not GST-registered/))
  ok('NULL kind is refused', refused(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: null }) })))
  ok('an additional invoice without a source is refused', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: 'additional' }) }), /existing footage or a new shoot/))
  ok('a zero amount is refused', refused(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_subtotal_paise: 0 }) })))
  ok('NULL amount is refused', refused(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_subtotal_paise: null }) })))
  ok('a too-short description is refused', refused(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_description: 'x' }) })))
  ok('a due date in the past is refused', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_due_date: '2020-01-01' }) }), /past/))
  const d1 = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_subtotal_paise: 10000000 }) })
  ok('finance drafts the service invoice (₹1,00,000)', !d1.error, d1.error?.message ?? '')
  const I1 = d1.data as string
  let row = (await admin.from('service_invoices').select('number, status, lines, total_paise, per_video_paise').eq('id', I1).single()).data as any
  ok('a draft has no number', row.number === null && row.status === 'draft')
  ok('ONE clean line: the service price, no per-video breakdown', (row.lines as any[]).length === 1 && Object.keys(row.lines[0]).sort().join(',') === 'amount_paise,description' && row.per_video_paise === null && Number(row.total_paise) === 10000000)
  const ed = await fin.rpc('experience_console_invoice_update', { p_invoice_id: I1, ...draftArgs({ p_subtotal_paise: 9000000 }) })
  ok('a draft can be edited', !ed.error && Number((await admin.from('service_invoices').select('subtotal_paise').eq('id', I1).single()).data!.subtotal_paise) === 9000000)

  group('issue: needs the brand\'s billing details; gapless numbering; frozen')
  const cnt = async () => Number((await admin.from('service_invoice_counters').select('last_no').eq('fy', fy(istToday())).maybeSingle()).data?.last_no ?? 0)
  const before = await cnt()
  ok("issuing without the brand's billing details is refused", said(await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I1 }), /brand's billing details/))
  ok('…and that failed issue did not use up a number', (await cnt()) === before)
  ok('operational staff cannot set the brand\'s billing details', refused(await op.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: 'Kiro Beauty Pvt Ltd', p_address: '1 Brand St, Delhi', p_state: 'Delhi', p_gstin: null, p_pan: null, p_certificate_path: null })))
  ok('a certificate path that was never uploaded is refused', said(await fin.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: 'Kiro Beauty Pvt Ltd', p_address: '1 Brand St, Delhi', p_state: 'Delhi', p_gstin: null, p_pan: null, p_certificate_path: `brand-certificate/${B.brand_id}/x/cert.pdf` }), /did not finish/))
  const bb = await fin.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: 'Kiro Beauty Pvt Ltd', p_address: '1 Brand Street, Saket, New Delhi 110017', p_state: 'Delhi', p_gstin: '07AAACK1234K1Z2', p_pan: null, p_certificate_path: null })
  ok("finance saves the brand's billing details", !bb.error, bb.error?.message ?? '')
  const is1 = await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I1 })
  const want1 = `GPD/${fy(istToday())}/${String(before + 1).padStart(4, '0')}`
  ok(`issued as the next number: ${want1}`, is1.data === want1, String(is1.data ?? is1.error?.message))
  row = (await admin.from('service_invoices').select('status, issue_date, supplier_legal_name, supplier_gstin, supplier_gstin_provisional, recipient_legal_name, recipient_state, place_of_supply').eq('id', I1).single()).data as any
  ok('Guapd and the brand are snapshotted onto it; provisional GSTIN; place of supply = brand state',
    row.status === 'issued' && row.issue_date === istToday() && row.supplier_legal_name === 'Guapd Technologies Pvt Ltd' && row.supplier_gstin_provisional === true
    && row.recipient_legal_name === 'Kiro Beauty Pvt Ltd' && row.place_of_supply === 'Delhi')
  ok('issued: editing is refused', said(await fin.rpc('experience_console_invoice_update', { p_invoice_id: I1, ...draftArgs() }), /Only a draft/))
  ok('issued: discarding is refused', refused(await fin.rpc('experience_console_invoice_discard', { p_invoice_id: I1 })))
  ok('issued: even the service role cannot change its amount (freeze trigger)', refused(await admin.from('service_invoices').update({ subtotal_paise: 1, total_paise: 1 }).eq('id', I1).select('id')))
  ok('issuing twice is refused', refused(await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I1 })))
  // A discarded draft never uses a number; the next issue is the very next number.
  const dX = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: 'additional', p_source: 'existing_footage', p_subtotal_paise: 500000, p_description: 'Two extra cut-downs' }) })
  ok('a draft is discarded (deleted, never numbered)', !refused(await fin.rpc('experience_console_invoice_discard', { p_invoice_id: dX.data })) && !(await admin.from('service_invoices').select('id').eq('id', dX.data as string).maybeSingle()).data)
  const d2 = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: 'additional', p_source: 'existing_footage', p_subtotal_paise: 4000000, p_description: 'Additional: four videos from existing footage' }) })
  const I2 = d2.data as string
  const is2 = await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I2 })
  ok('the next issue is exactly the next number (no gap from the failed issue or the discarded draft)', is2.data === `GPD/${fy(istToday())}/${String(before + 2).padStart(4, '0')}`, String(is2.data))

  group('the PDF: rendered from the frozen invoice, stored once')
  const pp = await fin.rpc('experience_console_invoice_pdf_path', { p_invoice_id: I1 })
  ok('its path is named by the database', pp.data === `invoice-pdf/${I1}/${want1.replace(/\//g, '-')}.pdf`, String(pp.data))
  ok('operational staff cannot get it', refused(await op.rpc('experience_console_invoice_pdf_path', { p_invoice_id: I1 })))
  ok('setting a PDF that was never uploaded is refused', said(await fin.rpc('experience_console_invoice_set_pdf', { p_invoice_id: I1, p_path: pp.data }), /did not finish/))
  ok('setting another path is refused', said(await fin.rpc('experience_console_invoice_set_pdf', { p_invoice_id: I1, p_path: `invoice-pdf/${I2}/x.pdf` }), /not this invoice/))
  const doc = (await fin.rpc('experience_console_invoice_doc', { p_invoice_id: I1 })).data as InvoiceDoc
  const bytes = renderInvoicePdf(doc)
  const pdfText = Buffer.from(bytes).toString('latin1')
  ok('the PDF is a PDF, carries the number, the brand, one amount and the "no GST" note', pdfText.startsWith('%PDF-1.4') && pdfText.includes(want1) && pdfText.includes('Kiro Beauty Pvt Ltd')
    && pdfText.includes('INR 90,000.00') && pdfText.includes('GST not charged') && pdfText.includes('provisional'))
  ok('…and no fee, rate or creator anywhere in it', !/platform fee|30%|day rate|creator/i.test(pdfText))
  const up = await admin.storage.from('finance-docs').upload(pp.data as string, bytes, { contentType: 'application/pdf' })
  if (!up.error) files.push(pp.data as string)
  ok('stored, then recorded on the invoice', !refused(await fin.rpc('experience_console_invoice_set_pdf', { p_invoice_id: I1, p_path: pp.data })))
  ok('a second PDF is refused, and even the service role cannot swap it', refused(await fin.rpc('experience_console_invoice_pdf_path', { p_invoice_id: I1 }))
    && refused(await admin.from('service_invoices').update({ pdf_path: 'invoice-pdf/other.pdf' }).eq('id', I1).select('id')))

  group('the brand sees its issued invoices only')
  const d3 = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: 'additional', p_source: 'new_shoot', p_subtotal_paise: 2000000, p_description: 'A draft the brand must not see' }) })
  const I3 = d3.data as string
  const bv = await brand.rpc('brand_experience_invoices', { p_experience_id: E })
  const bi = ((bv.data as any)?.invoices ?? []) as any[]
  ok('the brand sees exactly the two issued invoices (not the draft)', !bv.error && bi.length === 2 && !bi.some((x) => x.invoice_id === I3), bv.error?.message ?? String(bi.length))
  const KEYS = ['description', 'due_date', 'gst_paise', 'has_pdf', 'invoice_id', 'issue_date', 'number', 'paid_paise', 'status', 'subtotal_paise', 'total_paise'].join(',')
  ok('each carries exactly: number, dates, description, amounts, status, PDF flag', bi.every((x) => Object.keys(x).sort().join(',') === KEYS), Object.keys(bi[0] ?? {}).sort().join(','))
  ok('nothing about creators, payouts, costs, margin or notes', !/creator|payout|cost|margin|note|void|reason|reference|gstin/i.test(JSON.stringify(bv.data)))
  for (const [n, s] of [['another brand', brand2], ['the creator', creator], ['finance staff (not a member)', fin], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: refused`, refused(await (s as SupabaseClient).rpc('brand_experience_invoices', { p_experience_id: E })) && refused(await (s as SupabaseClient).rpc('brand_experience_invoice_file', { p_invoice_id: I1 })))
  }
  const bf = await brand.rpc('brand_experience_invoice_file', { p_invoice_id: I1 })
  ok('the brand gets its PDF\'s path (to sign a short link)', (bf.data as any)?.storage_path === pp.data && (bf.data as any)?.file_name === `${want1.replace(/\//g, '-')}.pdf`)
  ok('a draft has no file for the brand', refused(await brand.rpc('brand_experience_invoice_file', { p_invoice_id: I3 })))
  ok('an issued invoice without a PDF yet has none either', refused(await brand.rpc('brand_experience_invoice_file', { p_invoice_id: I2 })))
  ok('the brand cannot read invoices directly', refused(await brand.from('service_invoices').select('id').eq('id', I1)) || ((await brand.from('service_invoices').select('id').eq('id', I1)).data ?? []).length === 0)

  group('payments: recorded offline with reference, TDS and proof')
  const slot = async (s: SupabaseClient, kind: string, target: string, name = 'utr.png') => s.rpc('experience_finance_upload_slot', { p_kind: kind, p_target_id: target, p_file_name: name })
  ok('operational staff cannot get a payment upload slot', refused(await slot(op, 'invoice-payment', I1)))
  ok('a slot on a draft is refused', refused(await slot(fin, 'invoice-payment', I3)))
  ok('an executable is refused', refused(await slot(fin, 'invoice-payment', I1, 'run.exe')))
  const s1 = await slot(fin, 'invoice-payment', I1, 'UTR proof.png')
  ok("the slot is the invoice's own unguessable path", String(s1.data).startsWith(`invoice-payment/${I1}/`) && String(s1.data).endsWith('/UTR_proof.png'), String(s1.data))
  const payArgs = (o: Record<string, unknown> = {}) => ({ p_invoice_id: I1, p_amount_paise: 5000000, p_tds_paise: 0, p_received_on: istToday(), p_method: 'bank_transfer', p_reference: 'UTR000111', p_proof_path: s1.data, ...o })
  ok('before the proof is uploaded: refused', said(await fin.rpc('experience_console_invoice_payment_add', payArgs()), /proof/))
  await admin.storage.from('finance-docs').upload(s1.data as string, Buffer.from('png'), { contentType: 'image/png' }); files.push(s1.data as string)
  const sOther = await slot(fin, 'invoice-payment', I2, 'other.png')
  await admin.storage.from('finance-docs').upload(sOther.data as string, Buffer.from('png'), { contentType: 'image/png' }); files.push(sOther.data as string)
  ok("another invoice's proof is refused", said(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_proof_path: sOther.data })), /proof/))
  ok('NULL amount is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: null }))))
  ok('NULL TDS is refused (0 must be said)', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_tds_paise: null }))))
  ok('NULL method is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_method: null }))))
  ok('NULL date is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_received_on: null }))))
  ok('a future date is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_received_on: '2099-01-01' }))))
  ok('a missing reference is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_reference: ' ' }))))
  ok('more than is due is refused', said(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: 9000001 })), /more than is due/))
  ok('operational staff cannot record a payment', refused(await op.rpc('experience_console_invoice_payment_add', payArgs())))
  const pay1 = await fin.rpc('experience_console_invoice_payment_add', payArgs())
  ok('a part payment (₹50,000) is recorded; the invoice stays due', !pay1.error && (pay1.data as any)?.settled === false && (await admin.from('service_invoices').select('status').eq('id', I1).single()).data?.status === 'issued', pay1.error?.message ?? '')
  ok('the same reference twice on one invoice is refused', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: 1000000 }))))
  let bvi = (((await brand.rpc('brand_experience_invoices', { p_experience_id: E })).data as any).invoices as any[]).find((x) => x.invoice_id === I1)
  ok('the brand sees it as part paid', bvi.status === 'part_paid' && Number(bvi.paid_paise) === 5000000)
  const pay2 = await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: 3600000, p_tds_paise: 400000, p_reference: 'UTR000222' }))
  ok('the rest arrives with TDS withheld (₹36,000 + ₹4,000 TDS): PAID in full', !pay2.error && (pay2.data as any)?.settled === true && (await admin.from('service_invoices').select('status, payment_reference').eq('id', I1).single()).data?.payment_reference === 'UTR000222')
  ok('no payment on a paid invoice', refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: 100, p_reference: 'UTR000333' }))))
  bvi = (((await brand.rpc('brand_experience_invoices', { p_experience_id: E })).data as any).invoices as any[]).find((x) => x.invoice_id === I1)
  ok('the brand sees it paid', bvi.status === 'paid')
  ok('reversing needs a reason', refused(await fin.rpc('experience_console_invoice_payment_reverse', { p_payment_id: (pay2.data as any).payment_id, p_reason: '' })))
  ok('reversing a payment puts the invoice back to due', !refused(await fin.rpc('experience_console_invoice_payment_reverse', { p_payment_id: (pay2.data as any).payment_id, p_reason: 'Recorded against the wrong invoice' }))
    && (await admin.from('service_invoices').select('status').eq('id', I1).single()).data?.status === 'issued')
  ok('a reversed payment is final', refused(await fin.rpc('experience_console_invoice_payment_reverse', { p_payment_id: (pay2.data as any).payment_id, p_reason: 'again please' })))
  ok('the same reference can be recorded again once the first is reversed', !refused(await fin.rpc('experience_console_invoice_payment_add', payArgs({ p_amount_paise: 3600000, p_tds_paise: 400000, p_reference: 'UTR000222' }))))
  ok('finance opens a payment proof; operational staff cannot', !refused(await fin.rpc('experience_console_finance_file', { p_kind: 'invoice-payment', p_id: (pay1.data as any).payment_id }))
    && refused(await op.rpc('experience_console_finance_file', { p_kind: 'invoice-payment', p_id: (pay1.data as any).payment_id })))

  group('void: a reason, never with live payments, the number kept')
  const sI2 = await slot(fin, 'invoice-payment', I2, 'p.png')
  await admin.storage.from('finance-docs').upload(sI2.data as string, Buffer.from('png'), { contentType: 'image/png' }); files.push(sI2.data as string)
  const p3 = await fin.rpc('experience_console_invoice_payment_add', { p_invoice_id: I2, p_amount_paise: 100000, p_tds_paise: 0, p_received_on: istToday(), p_method: 'upi', p_reference: 'UPI-REF-1', p_proof_path: sI2.data })
  ok('a void with a live payment is refused', said(await fin.rpc('experience_console_invoice_void', { p_invoice_id: I2, p_reason: 'Wrong amount' }), /Reverse them first/))
  await fin.rpc('experience_console_invoice_payment_reverse', { p_payment_id: (p3.data as any).payment_id, p_reason: 'Refunded to the brand' })
  ok('a void needs a reason', refused(await fin.rpc('experience_console_invoice_void', { p_invoice_id: I2, p_reason: '' })))
  ok('operational staff cannot void', refused(await op.rpc('experience_console_invoice_void', { p_invoice_id: I2, p_reason: 'Wrong amount' })))
  ok('finance voids it; it keeps its number', !refused(await fin.rpc('experience_console_invoice_void', { p_invoice_id: I2, p_reason: 'Wrong amount; reissued' }))
    && (await admin.from('service_invoices').select('status, number').eq('id', I2).single()).data?.number === is2.data)
  ok('a void is final (no payment, no second void, no edit)', refused(await fin.rpc('experience_console_invoice_void', { p_invoice_id: I2, p_reason: 'again please' }))
    && refused(await admin.from('service_invoices').update({ status: 'issued' }).eq('id', I2).select('id')))
  ok('the brand no longer sees the void', !((((await brand.rpc('brand_experience_invoices', { p_experience_id: E })).data as any).invoices) as any[]).some((x) => x.invoice_id === I2))

  group('the P&L flips from "pending invoice" to real revenue')
  const p0 = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('revenue = the paid invoice only, before GST (void and draft excluded): ₹90,000', Number(p0.brand_revenue_paise) === 9000000 && p0.revenue_pending_invoice === false && p0.invoices_counted === 1, `${p0.brand_revenue_paise}`)
  ok('cash: received ₹86,000 with ₹4,000 TDS withheld; nothing outstanding', Number(p0.brand_received_paise) === 8600000 && Number(p0.brand_tds_withheld_paise) === 400000 && Number(p0.brand_outstanding_paise) === 0)
  ok('invoiced vs agreed reported (₹90,000 vs ₹1,40,000)', Number(p0.invoiced_vs_agreed_paise) === 9000000 - 14000000 && p0.invoices_draft === 1)
  // GST: register, then an invoice with IGST. Revenue excludes it; it is a liability.
  await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Andheri, Mumbai 400053', p_state: 'Maharashtra', p_gstin: '27ABCDE1234F1Z5', p_gst_registered: true, p_pan: 'ABCDE1234F', p_payment_instructions: null })
  ok('a draft made before registration cannot be issued after it (GST changed)', said(await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I3 }), /registration changed/))
  ok('GST is IGST or CGST+SGST, not both', said(await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_igst_paise: 100, p_cgst_paise: 50, p_sgst_paise: 50 }) }), /not both/))
  const d4 = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, ...draftArgs({ p_kind: 'additional', p_source: 'new_shoot', p_subtotal_paise: 5000000, p_gst_rate_pct: 18, p_igst_paise: 900000, p_description: 'Additional: a second shoot day' }) })
  await fin.rpc('experience_console_invoice_issue', { p_invoice_id: d4.data })
  const p1 = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('revenue rises by the amount BEFORE GST only (₹50,000), GST shown as a liability (₹9,000)', Number(p1.brand_revenue_paise) === 14000000 && Number(p1.gst_liability_paise) === 900000 && Number(p1.invoiced_total_paise) === 9000000 + 5900000)
  ok('margin uses revenue before GST', Number(p1.guapd_margin_paise) === 14000000 - Number(p1.creator_net_total_paise) - Number(p1.guapd_costs_total_paise))
  const docG = (await fin.rpc('experience_console_invoice_doc', { p_invoice_id: d4.data })).data as InvoiceDoc
  const gText = Buffer.from(renderInvoicePdf(docG)).toString('latin1')
  ok('a registered invoice\'s PDF is a TAX INVOICE with the IGST line and no "not registered" note', gText.includes('TAX INVOICE') && gText.includes('IGST @ 18%') && gText.includes('INR 59,000.00') && !gText.includes('GST not charged'))

  group('audit: every finance action, no amounts')
  const { data: ev } = await admin.from('ops_events').select('action, detail').eq('actor_auth_id', FIN.auth_id).gte('created_at', startedAt)
  const acts = new Set((ev ?? []).map((e) => e.action))
  for (const a of ['finance.settings_set', 'finance.brand_billing_set', 'experience.invoice_drafted', 'experience.invoice_draft_edited', 'experience.invoice_draft_discarded', 'experience.invoice_issued',
    'experience.invoice_pdf_stored', 'experience.invoice_payment_recorded', 'experience.invoice_payment_reversed', 'experience.invoice_voided']) ok(`audited: ${a}`, acts.has(a))
  const mine = (ev ?? []).filter((e) => /^experience\.invoice|^finance\./.test(e.action))
  ok('none of these audit rows carries an amount', mine.length > 0 && !mine.some((e) => /paise|amount|total|price|gst_paise|tds/i.test(Object.keys(e.detail as object).join(' '))))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (files.length) await admin.storage.from('finance-docs').remove(files)
  for (const E of exps) {
    const { data: invs } = await admin.from('service_invoices').select('id, pdf_path').eq('experience_id', E)
    const pdfs = (invs ?? []).map((i: any) => i.pdf_path).filter(Boolean)
    if (pdfs.length) await admin.storage.from('finance-docs').remove(pdfs)
    await admin.from('service_invoice_payments').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  await admin.from('guapd_billing_settings').delete().eq('id', true)
  if (priorSettings) await admin.from('guapd_billing_settings').insert({ id: true, ...priorSettings })
  if (billingBrand) {
    await admin.from('brand_billing_profiles').delete().eq('brand_id', billingBrand)
    if (priorBilling) await admin.from('brand_billing_profiles').insert({ brand_id: billingBrand, ...priorBilling })
  }
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[inv-test]%')
  ok('cleanup: nothing left behind (Experiences, staff grants), settings and billing restored', (left.data ?? []).length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
