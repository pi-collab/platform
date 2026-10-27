/**
 * 0578, Razorpay pay-in (brand -> Guapd, Leg 1 invoice), against STAGING with
 * real sessions and Razorpay TEST mode. The money-integrity cases:
 *
 *   (a) the checkout says "success" (valid signature) but no webhook arrives:
 *       the invoice is NOT paid
 *   (b) the same webhook delivered twice: ONE payment recorded
 *   (c) a tampered amount: an order for anything but the server's balance is
 *       refused, and a captured amount that differs from our order never
 *       touches the invoice
 *   (d) a bad / missing webhook signature: 400, nothing recorded
 *   (e) part payments: Kiro paid half offline; the online quote is the other
 *       half, a pending brand report reduces it, and the capture settles it
 *
 * plus access (brand admin only, other brands / anon / creators refused, the
 * order and capture functions service-role only), NULL-means-no, and the real
 * Razorpay create-order call with the test keys.
 *
 * The webhook is exercised through the real route handler with a test webhook
 * secret, signed the way Razorpay signs. Payment ids are synthetic: nothing is
 * charged. One real Razorpay TEST order is created (it stays unpaid in the
 * test dashboard; Razorpay has no delete).
 *
 * One temporary staff grant, removed after. Guapd's billing settings and the
 * test brand's billing profile are restored. Everything made is deleted,
 * children first, and the run fails if anything is left.
 *
 * Needs 0578 applied on staging. Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-razorpay-payin.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { createHmac, randomBytes } from 'crypto'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!URL.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }
if (!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) { console.error('ABORT: not a Razorpay TEST key'); process.exit(1) }
// The route is driven with a test webhook secret; the real one (if set) is not needed or used.
const WH = `whsec_test_${randomBytes(12).toString('hex')}`
process.env.RAZORPAY_WEBHOOK_SECRET = WH

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)

const exps: string[] = []
const grants: string[] = []
const orderIds: string[] = []
const payIds: string[] = []
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

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fakePay = () => { const id = `pay_T${randomBytes(7).toString('hex')}`; payIds.push(id); return id }
const sign = (body: string, secret = WH) => createHmac('sha256', secret).update(body).digest('hex')
const captured = (paymentId: string, orderId: string, amount: number, currency = 'INR') => JSON.stringify({
  entity: 'event', event: 'payment.captured', created_at: Math.floor(Date.now() / 1000),
  payload: { payment: { entity: { id: paymentId, entity: 'payment', order_id: orderId, amount, currency, status: 'captured', method: 'card', created_at: Math.floor(Date.now() / 1000) } } },
})

async function run() {
  startedAt = new Date().toISOString()
  const { POST } = await import('../apps/web/app/api/razorpay/webhook/route')
  const { checkoutSignatureValid, createRazorpayOrder } = await import('../apps/web/lib/razorpay-payin')
  const hook = async (body: string, signature: string | null, eventId = `evt_T${randomBytes(6).toString('hex')}`) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-razorpay-event-id': eventId }
    if (signature !== null) headers['x-razorpay-signature'] = signature
    const res = await POST(new Request('http://localhost/api/razorpay/webhook', { method: 'POST', headers, body }))
    return { status: res.status, json: await res.json().catch(() => ({})) as any }
  }

  // Actors: a brand ADMIN (B), a member of another brand (B2), a creator, one finance staff grant.
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd)').limit(80)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members.find((m) => m.is_admin === true), B2 = members.find((m) => m.brand_id !== B?.brand_id)
  const Bmember = members.find((m) => m.brand_id === B?.brand_id && m.is_admin !== true) ?? null
  const { data: cr } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).limit(40)
  const C = ((cr ?? []) as any[]).find((c) => c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, B2?.user_id, C?.user_id, Bmember?.user_id, ...(access ?? []).map((a) => a.user_id)])
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) }
  { const { data: mu } = await admin.from('brand_members').select('user_id'); for (const x of mu ?? []) busy.add((x as any).user_id) }
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const FIN = (users ?? []).find((u: any) => !busy.has(u.id)) as any
  if (!B || !B2 || !C || !FIN) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(FIN.id)
  const fin = await sessionFor(FIN.auth_id), brand = await sessionFor(B.users.auth_id), brand2 = await sessionFor(B2.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const member = Bmember ? await sessionFor(Bmember.users.auth_id) : null
  const anon = createClient(URL, ANON)

  priorSettings = (await admin.from('guapd_billing_settings').select('legal_name, address, state, gstin, gst_registered, pan, payment_instructions').maybeSingle()).data ?? null
  billingBrand = B.brand_id
  priorBilling = (await admin.from('brand_billing_profiles').select('legal_name, address, state, gstin, pan, certificate_path').eq('brand_id', B.brand_id).maybeSingle()).data ?? null

  // Fixture: an Experience with an issued ₹1,00,000 invoice (not GST-registered, so total = subtotal).
  const c = await fin.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[rzp-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 2 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  if (q.error) throw new Error('quote: ' + q.error.message)
  const acc = await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  if (acc.error) throw new Error('accept: ' + acc.error.message)
  const st = await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Andheri, Mumbai 400053', p_state: 'Maharashtra', p_gstin: '27ABCDE1234F1Z5', p_gst_registered: false, p_pan: 'ABCDE1234F', p_payment_instructions: null })
  if (st.error) throw new Error('settings: ' + st.error.message)
  const bb = await fin.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: 'Kiro Beauty Pvt Ltd', p_address: '1 Brand Street, Saket, New Delhi 110017', p_state: 'Delhi', p_gstin: null, p_pan: null, p_certificate_path: null })
  if (bb.error) throw new Error('billing: ' + bb.error.message)
  const d = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'initial', p_source: null, p_description: 'UGC content production: [rzp-test]', p_subtotal_paise: 10000000, p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: null })
  if (d.error) throw new Error('draft: ' + d.error.message)
  const I = d.data as string
  const iss = await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I })
  if (iss.error) throw new Error('issue: ' + iss.error.message)
  const number = iss.data as string
  const view = async () => {
    const r = await brand.rpc('brand_experience_invoices', { p_experience_id: E })
    return ((r.data as any)?.invoices ?? []).find((x: any) => x.invoice_id === I)
  }
  const sipRows = async () => ((await admin.from('service_invoice_payments').select('id, amount_paise, method, reference, reversed_at').eq('invoice_id', I)).data ?? []) as any[]
  const rppRows = async () => ((await admin.from('razorpay_payin_payments').select('razorpay_payment_id, outcome, review_reason, invoice_payment_id').eq('invoice_id', I)).data ?? []) as any[]

  group('(e) part payment: Kiro paid half offline')
  // An offline receipt as finance records it (proof path stands in for the upload).
  const half = await admin.from('service_invoice_payments').insert({ invoice_id: I, experience_id: E, amount_paise: 5000000, tds_paise: 0, received_on: istToday(), method: 'bank_transfer', reference: 'UTR-RZPTEST-HALF', proof_path: `invoice-payment/${I}/rzp-test/half.pdf` })
  ok('fixture: ₹50,000 received offline', !half.error, half.error?.message ?? '')
  let v = await view()
  ok('the brand sees ₹1,00,000 total, ₹50,000 received, ₹50,000 balance, part paid', Number(v.total_paise) === 10000000 && Number(v.paid_paise) === 5000000 && Number(v.balance_paise) === 5000000 && v.status === 'part_paid')
  let quote = await brand.rpc('brand_experience_payin_quote', { p_invoice_id: I })
  ok('the online amount is the balance, worked out by the database: ₹50,000 INR', !quote.error && Number((quote.data as any).amount_paise) === 5000000 && (quote.data as any).currency === 'INR' && (quote.data as any).number === number, quote.error?.message ?? '')
  const rep = await brand.rpc('brand_experience_payment_report', { p_invoice_id: I, p_amount_paise: 1000000, p_tds_paise: 0, p_paid_on: istToday(), p_method: 'upi', p_reference: 'UPI-RZPTEST-1', p_note: null })
  ok('fixture: the brand marks ₹10,000 paid by UPI (Guapd still checking)', !rep.error, rep.error?.message ?? '')
  quote = await brand.rpc('brand_experience_payin_quote', { p_invoice_id: I })
  ok('…the online amount drops to ₹40,000 so nothing is paid twice', !quote.error && Number((quote.data as any).amount_paise) === 4000000)
  ok('…and an order for the old ₹50,000 is refused: the balance changed', said(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TSTALE000001', p_invoice_id: I, p_amount_paise: 5000000, p_receipt: number, p_created_by: B.user_id }), /balance on this invoice changed/))
  const reportId = (await admin.from('service_invoice_payment_reports').select('id').eq('invoice_id', I).single()).data!.id
  const rj = await fin.rpc('experience_console_payment_report_decide', { p_report_id: reportId, p_decision: 'rejected', p_payment_id: null, p_reason: 'Not in the bank [rzp-test]' })
  ok('fixture: finance rejects that report; the balance is ₹50,000 again', !rj.error && Number((await view()).balance_paise) === 5000000, rj.error?.message ?? '')

  group('access: brand ADMIN only; the order and capture functions are server-only')
  ok('another brand cannot get a quote for this invoice', refused(await brand2.rpc('brand_experience_payin_quote', { p_invoice_id: I })))
  ok('a creator cannot', refused(await creator.rpc('brand_experience_payin_quote', { p_invoice_id: I })))
  ok('anonymous cannot', refused(await anon.rpc('brand_experience_payin_quote', { p_invoice_id: I })))
  if (member) ok('a non-admin member of the same brand cannot', said(await member.rpc('brand_experience_payin_quote', { p_invoice_id: I }), /admin/))
  else console.log('  (skipped: no non-admin member on the test brand)')
  ok('NULL invoice is refused', refused(await brand.rpc('brand_experience_payin_quote', { p_invoice_id: null })))
  ok('a made-up invoice is refused', refused(await brand.rpc('brand_experience_payin_quote', { p_invoice_id: '00000000-0000-0000-0000-000000000000' })))
  for (const [n, s] of [['brand admin', brand], ['finance staff', fin], ['anonymous', anon]] as const) {
    ok(`${n}: cannot file an order or record a capture`,
      refused(await (s as SupabaseClient).rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TFORGED00001', p_invoice_id: I, p_amount_paise: 5000000, p_receipt: number, p_created_by: null }))
      && refused(await (s as SupabaseClient).rpc('razorpay_payin_capture', { p_payment_id: 'pay_TFORGED00001', p_order_id: 'order_TFORGED00001', p_amount_paise: 5000000, p_currency: 'INR', p_method: 'card', p_event_id: null, p_captured_at: new Date().toISOString() })))
    let readable = false
    for (const t of ['razorpay_payin_orders', 'razorpay_payin_payments']) {
      const r = await (s as SupabaseClient).from(t).select('id').limit(1)
      if (!r.error && (r.data ?? []).length > 0) readable = true
    }
    ok(`${n}: neither Razorpay table is readable directly`, !readable)
  }

  group('(c) the amount is the server\'s, never the browser\'s')
  ok('an order for ₹1 instead of the ₹50,000 balance is refused', said(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TTAMPER00001', p_invoice_id: I, p_amount_paise: 100, p_receipt: number, p_created_by: B.user_id }), /balance on this invoice changed/))
  ok('an order for more than the balance is refused', refused(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TTAMPER00002', p_invoice_id: I, p_amount_paise: 10000000, p_receipt: number, p_created_by: B.user_id })))
  ok('an order with another invoice\'s receipt is refused', said(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TTAMPER00003', p_invoice_id: I, p_amount_paise: 5000000, p_receipt: 'GPD/00-00/9999', p_created_by: B.user_id }), /receipt/))
  ok('NULL amount is refused', refused(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: 'order_TTAMPER00004', p_invoice_id: I, p_amount_paise: null, p_receipt: number, p_created_by: B.user_id })))

  group('Razorpay TEST mode: create the order for the server amount')
  const ro = await createRazorpayOrder({ amountPaise: 5000000, receipt: number, notes: { invoice_id: I, experience_id: E, test: 'rzp-test' } })
  ok('Razorpay accepts the test keys and creates an order for exactly ₹50,000 INR', ro.ok, ro.ok ? ro.orderId : ro.error)
  if (!ro.ok) throw new Error('cannot continue without an order')
  const ORDER = ro.orderId
  const rec = await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: ORDER, p_invoice_id: I, p_amount_paise: 5000000, p_receipt: number, p_created_by: B.user_id })
  ok('the order is filed against the invoice', !rec.error, rec.error?.message ?? '')
  if (!rec.error) orderIds.push(ORDER)
  quote = await brand.rpc('brand_experience_payin_quote', { p_invoice_id: I })
  ok('a second click reuses the unpaid order instead of opening another', (quote.data as any)?.order_id === ORDER)
  ok('the same Razorpay order cannot be filed twice', refused(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: ORDER, p_invoice_id: I, p_amount_paise: 5000000, p_receipt: number, p_created_by: B.user_id })))

  group('(a) checkout "success" without a webhook changes nothing')
  const P1 = fakePay()
  const goodSig = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${ORDER}|${P1}`).digest('hex')
  ok('a correctly signed checkout response verifies', checkoutSignatureValid(ORDER, P1, goodSig))
  ok('a wrong checkout signature does not', !checkoutSignatureValid(ORDER, P1, goodSig.replace(/.$/, (x) => (x === '0' ? '1' : '0'))))
  ok('a checkout signature for another order does not', !checkoutSignatureValid('order_TOTHER000001', P1, goodSig))
  ok('missing fields do not', !checkoutSignatureValid(ORDER, '', goodSig) && !checkoutSignatureValid(ORDER, P1, ''))
  v = await view()
  ok('…and with no webhook the invoice is NOT paid: still ₹50,000 received, ₹50,000 due', Number(v.paid_paise) === 5000000 && Number(v.balance_paise) === 5000000 && v.status === 'part_paid' && (await sipRows()).length === 1 && (await rppRows()).length === 0)

  group('(d) the webhook signature is mandatory')
  const body1 = captured(P1, ORDER, 5000000)
  let h = await hook(body1, sign(body1, 'whsec_wrong_secret'))
  ok('signed with the wrong secret: 400', h.status === 400)
  h = await hook(body1, null)
  ok('unsigned: 400', h.status === 400)
  h = await hook(body1.replace('5000000', '5000001'), sign(body1))
  ok('body changed after signing: 400', h.status === 400)
  h = await hook(body1, 'not-hex')
  ok('a malformed signature: 400', h.status === 400)
  v = await view()
  ok('…none of them recorded anything', Number(v.paid_paise) === 5000000 && (await sipRows()).length === 1 && (await rppRows()).length === 0)
  {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    h = await hook(body1, sign(body1))
    process.env.RAZORPAY_WEBHOOK_SECRET = saved
    ok('with no webhook secret configured: 500, nothing verifies', h.status === 500 && (await rppRows()).length === 0)
  }

  group('other events and malformed payments')
  const failedBody = JSON.stringify({ entity: 'event', event: 'payment.failed', created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: { id: fakePay(), order_id: ORDER, amount: 5000000, currency: 'INR', status: 'failed' } } } })
  h = await hook(failedBody, sign(failedBody))
  ok('a signed payment.failed is acknowledged and ignored', h.status === 200 && h.json.ignored === true && (await rppRows()).length === 0)
  const noAmount = JSON.stringify({ entity: 'event', event: 'payment.captured', created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: { id: fakePay(), order_id: ORDER, currency: 'INR' } } } })
  h = await hook(noAmount, sign(noAmount))
  ok('a signed capture with no amount: 400 (NULL means no)', h.status === 400 && (await rppRows()).length === 0)
  ok('the capture function refuses NULL amount / order / time', refused(await admin.rpc('razorpay_payin_capture', { p_payment_id: fakePay(), p_order_id: ORDER, p_amount_paise: null, p_currency: 'INR', p_method: 'card', p_event_id: null, p_captured_at: new Date().toISOString() }))
    && refused(await admin.rpc('razorpay_payin_capture', { p_payment_id: fakePay(), p_order_id: null, p_amount_paise: 5000000, p_currency: 'INR', p_method: 'card', p_event_id: null, p_captured_at: new Date().toISOString() }))
    && refused(await admin.rpc('razorpay_payin_capture', { p_payment_id: fakePay(), p_order_id: ORDER, p_amount_paise: 5000000, p_currency: 'INR', p_method: 'card', p_event_id: null, p_captured_at: null })))

  group('(c) a captured amount that differs from our order never touches the invoice')
  const PT = fakePay(), bodyT = captured(PT, ORDER, 100)
  h = await hook(bodyT, sign(bodyT))
  let rows = await rppRows()
  ok('₹1 captured against the ₹50,000 order: filed as needs_review, not on the invoice', h.status === 200 && h.json.outcome === 'needs_review' && rows.some((r) => r.razorpay_payment_id === PT && r.outcome === 'needs_review' && /amount differs/.test(r.review_reason)))
  const PU = fakePay(), bodyU = captured(PU, 'order_TNOTOURS0001', 5000000)
  h = await hook(bodyU, sign(bodyU))
  const unknown = (await admin.from('razorpay_payin_payments').select('outcome, review_reason, invoice_id').eq('razorpay_payment_id', PU).maybeSingle()).data as any
  ok('a capture on an order Guapd never created: needs_review, no invoice', h.status === 200 && unknown?.outcome === 'needs_review' && unknown?.invoice_id === null && /not one Guapd created/.test(unknown?.review_reason ?? ''))
  const PX = fakePay(), bodyX = captured(PX, ORDER, 5000000, 'USD')
  h = await hook(bodyX, sign(bodyX))
  ok('a capture in another currency: needs_review', h.json.outcome === 'needs_review')
  v = await view()
  ok('…the invoice still shows ₹50,000 received, ₹50,000 due', Number(v.paid_paise) === 5000000 && Number(v.balance_paise) === 5000000 && (await sipRows()).length === 1)

  group('the real path: a verified payment.captured settles the balance')
  const evt = `evt_T${randomBytes(6).toString('hex')}`
  h = await hook(body1, sign(body1), evt)
  ok('webhook: 200 recorded', h.status === 200 && h.json.outcome === 'recorded', JSON.stringify(h.json))
  v = await view()
  ok('(e) the brand now sees ₹1,00,000 received, ₹0 balance, Paid', Number(v.paid_paise) === 10000000 && Number(v.balance_paise) === 0 && v.status === 'paid')
  const sip = (await sipRows()).find((r) => r.reference === P1)
  ok('one ledger row: ₹50,000, method razorpay, reference = the Razorpay payment id', !!sip && Number(sip.amount_paise) === 5000000 && sip.method === 'razorpay')
  const inv = (await admin.from('service_invoices').select('status, payment_reference').eq('id', I).single()).data as any
  ok('the invoice is marked paid with that reference', inv.status === 'paid' && inv.payment_reference === P1)
  const ord = (await admin.from('razorpay_payin_orders').select('status, paid_at').eq('razorpay_order_id', ORDER).single()).data as any
  ok('the order is marked paid', ord.status === 'paid' && !!ord.paid_at)
  const rec1 = (await admin.from('razorpay_payin_payments').select('outcome, invoice_payment_id, event_id, pay_method').eq('razorpay_payment_id', P1).single()).data as any
  ok('the reconciliation row links the ledger row, with the event id and method', rec1.outcome === 'recorded' && rec1.invoice_payment_id === sip?.id && rec1.event_id === evt && rec1.pay_method === 'card')
  const consoleView = await fin.rpc('experience_console_invoices', { p_experience_id: E })
  const cInv = ((consoleView.data as any)?.invoices ?? []).find((x: any) => x.id === I)
  ok('finance sees it on the invoice as a razorpay payment', !!cInv && cInv.payments.some((p: any) => p.method === 'razorpay' && p.reference === P1))

  group('(b) the same webhook again is a no-op')
  h = await hook(body1, sign(body1), evt)
  ok('re-delivered: 200 duplicate', h.status === 200 && h.json.outcome === 'duplicate')
  h = await hook(body1, sign(body1))
  ok('re-delivered with a new event id: still duplicate', h.status === 200 && h.json.outcome === 'duplicate')
  const [r1, r2] = await Promise.all([hook(body1, sign(body1)), hook(body1, sign(body1))])
  ok('two concurrent re-deliveries: both duplicate', r1.json.outcome === 'duplicate' && r2.json.outcome === 'duplicate')
  ok('…exactly ONE ledger row and ONE reconciliation row for that payment id',
    (await sipRows()).filter((r) => r.reference === P1).length === 1
    && ((await admin.from('razorpay_payin_payments').select('id').eq('razorpay_payment_id', P1)).data ?? []).length === 1)
  v = await view()
  ok('…and the brand still sees ₹1,00,000 received, not ₹1,50,000', Number(v.paid_paise) === 10000000)
  const P2 = fakePay(), body2 = captured(P2, ORDER, 5000000)
  h = await hook(body2, sign(body2))
  ok('a SECOND payment on the already-paid order: needs_review, not on the invoice', h.json.outcome === 'needs_review' && Number((await view()).paid_paise) === 10000000)
  ok('a paid invoice offers no online quote', said(await brand.rpc('brand_experience_payin_quote', { p_invoice_id: I }), /not open for payment/))

  group('the reconciliation record is permanent')
  const upd = await brand.rpc('razorpay_payin_capture', { p_payment_id: P1, p_order_id: ORDER, p_amount_paise: 1, p_currency: 'INR', p_method: null, p_event_id: null, p_captured_at: new Date().toISOString() })
  ok('a brand cannot replay a capture', refused(upd))
  const dbUpd = await admin.from('razorpay_payin_payments').update({ outcome: 'needs_review', review_reason: 'x', invoice_payment_id: null }).eq('razorpay_payment_id', P1)
  ok('a filed payment cannot be edited, even by the service role', !!dbUpd.error && /never edited/.test(dbUpd.error.message))

  group('nothing creator-side was touched')
  const legs = await admin.from('vendor_payouts').select('id').eq('experience_id', E)
  ok('no payout exists for this Experience', (legs.data ?? []).length === 0)
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const E of exps) {
    const { data: invs } = await admin.from('service_invoices').select('id').eq('experience_id', E)
    const invIds = (invs ?? []).map((i: any) => i.id)
    if (invIds.length) {
      await admin.from('razorpay_payin_payments').delete().in('invoice_id', invIds)
      await admin.from('razorpay_payin_orders').delete().in('invoice_id', invIds)
    }
    await admin.from('service_invoice_payment_reports').delete().eq('experience_id', E)
    await admin.from('service_invoice_payments').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  // Captures filed with no invoice (unknown order) are found by their synthetic ids.
  if (payIds.length) await admin.from('razorpay_payin_payments').delete().in('razorpay_payment_id', payIds)
  if (orderIds.length) await admin.from('razorpay_payin_orders').delete().in('razorpay_order_id', orderIds)
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
  const left = await admin.from('experiences').select('id').like('title', '[rzp-test]%')
  const leftPay = payIds.length ? ((await admin.from('razorpay_payin_payments').select('id').in('razorpay_payment_id', payIds)).data ?? []).length : 0
  const leftOrd = orderIds.length ? ((await admin.from('razorpay_payin_orders').select('id').in('razorpay_order_id', orderIds)).data ?? []).length : 0
  const leftGrant = ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length
  ok('cleanup: no Experience, order, payment or staff grant left; settings and billing restored', (left.data ?? []).length === 0 && leftPay === 0 && leftOrd === 0 && leftGrant === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
