/**
 * 0579, payment stages on ONE invoice, against STAGING with real sessions.
 *
 *   - the quote carries the stages; the database refuses a bad schedule
 *     (not 100%, one stage, out of order, unknown moment, 3 decimals, ...)
 *   - the stages are fixed once the quote exists (a trigger, even for the service role)
 *   - one invoice; what is DUE NOW follows the Experience: the advance on
 *     acceptance, the shoot stage once the shoot is done, the final after sign-off
 *   - online payment (0578) charges exactly the amount due now, through the
 *     real webhook route; nothing due = no quote
 *   - a brand's pending "marked paid" counts against the stage until finance decides
 *   - rounding: the stages add up to exactly the invoice total, as the screen previews
 *   - additional invoices and quotes without stages: the whole balance, as before
 *   - access: brand members see their own; other brands, creators, anon cannot;
 *     operational staff see the quote stages but not the invoice figures
 *
 * Two temporary staff grants (finance, operational), removed after. Guapd's billing
 * settings and the test brand's billing profile are restored. Everything made is
 * deleted, children first, and the run fails if anything is left.
 *
 * Needs 0578 + 0579 on staging. Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-payment-stages.ts
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
const WH = `whsec_test_${randomBytes(12).toString('hex')}`
process.env.RAZORPAY_WEBHOOK_SECRET = WH

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stageAmounts } from '../apps/web/lib/experience-request'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)

const exps: string[] = []
const grants: string[] = []
const payIds: string[] = []
const orderIds: string[] = []
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
const fakeOrder = () => { const id = `order_T${randomBytes(7).toString('hex')}`; orderIds.push(id); return id }
const sign = (body: string) => createHmac('sha256', WH).update(body).digest('hex')
const captured = (paymentId: string, orderId: string, amount: number) => JSON.stringify({
  entity: 'event', event: 'payment.captured', created_at: Math.floor(Date.now() / 1000),
  payload: { payment: { entity: { id: paymentId, entity: 'payment', order_id: orderId, amount, currency: 'INR', status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) } } },
})
const S3 = [{ label: 'Advance', pct: 70, on: 'accepted' }, { label: 'Shoot', pct: 10, on: 'shoot_done' }, { label: 'Final', pct: 20, on: 'signoff' }]

async function run() {
  startedAt = new Date().toISOString()
  const { POST } = await import('../apps/web/app/api/razorpay/webhook/route')
  const hook = async (body: string) => {
    const res = await POST(new Request('http://localhost/api/razorpay/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sign(body), 'x-razorpay-event-id': `evt_T${randomBytes(6).toString('hex')}` }, body }))
    return { status: res.status, json: await res.json().catch(() => ({})) as any }
  }

  // Actors (as the 0578 test picks them).
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd)').limit(80)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members.find((m) => m.is_admin === true), B2 = members.find((m) => m.brand_id !== B?.brand_id)
  const { data: cr } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).limit(40)
  const C = ((cr ?? []) as any[]).find((c) => c.users?.auth_id)
  const busy = new Set<string>()
  for (const t of ['creators', 'brand_members', 'staff_access']) for (const x of ((await admin.from(t).select('user_id')).data ?? []) as any[]) busy.add(x.user_id)
  const spare = (((await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)).data ?? []) as any[]).filter((u) => !busy.has(u.id))
  const FIN = spare[0], OPS = spare[1]
  if (!B || !B2 || !C || !FIN || !OPS) throw new Error('missing test actors')
  for (const [u, financial] of [[FIN, true], [OPS, false]] as const) {
    const g = await admin.from('staff_access').insert({ user_id: u.id, experiences_operational: true, experiences_financial: financial })
    if (g.error) throw new Error('grant: ' + g.error.message)
    grants.push(u.id)
  }
  const fin = await sessionFor(FIN.auth_id), ops = await sessionFor(OPS.auth_id)
  const brand = await sessionFor(B.users.auth_id), brand2 = await sessionFor(B2.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  priorSettings = (await admin.from('guapd_billing_settings').select('legal_name, address, state, gstin, gst_registered, pan, payment_instructions').maybeSingle()).data ?? null
  billingBrand = B.brand_id
  priorBilling = (await admin.from('brand_billing_profiles').select('legal_name, address, state, gstin, pan, certificate_path').eq('brand_id', B.brand_id).maybeSingle()).data ?? null

  const c = await fin.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[stages-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 2 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)
  const quote = (schedule: unknown) => fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 2500000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null, p_payment_schedule: schedule })

  group('the database refuses a bad schedule')
  const bad: [string, unknown][] = [
    ['adds up to 90%', [{ label: 'Advance', pct: 70, on: 'accepted' }, { label: 'Final', pct: 20, on: 'signoff' }]],
    ['adds up to 110%', [{ label: 'Advance', pct: 90, on: 'accepted' }, { label: 'Final', pct: 20, on: 'signoff' }]],
    ['a single 100% stage', [{ label: 'All', pct: 100, on: 'accepted' }]],
    ['out of order (sign-off before acceptance)', [{ label: 'Final', pct: 30, on: 'signoff' }, { label: 'Advance', pct: 70, on: 'accepted' }]],
    ['an unknown moment', [{ label: 'Advance', pct: 70, on: 'accepted' }, { label: 'Later', pct: 30, on: 'whenever' }]],
    ['three decimals', [{ label: 'Advance', pct: 70.005, on: 'accepted' }, { label: 'Final', pct: 29.995, on: 'signoff' }]],
    ['a one-letter name', [{ label: 'A', pct: 70, on: 'accepted' }, { label: 'Final', pct: 30, on: 'signoff' }]],
    ['a zero stage', [{ label: 'Advance', pct: 100, on: 'accepted' }, { label: 'Final', pct: 0, on: 'signoff' }]],
    ['seven stages', Array.from({ length: 7 }, (_, i) => ({ label: `Part ${i + 1}`, pct: i < 6 ? 14 : 16, on: 'accepted' }))],
    ['an extra key', [{ label: 'Advance', pct: 70, on: 'accepted', amount_paise: 1 }, { label: 'Final', pct: 30, on: 'signoff' }]],
    ['a % as text', [{ label: 'Advance', pct: '70', on: 'accepted' }, { label: 'Final', pct: 30, on: 'signoff' }]],
    ['not a list', { label: 'Advance', pct: 100, on: 'accepted' }],
  ]
  for (const [what, sch] of bad) ok(`refused: ${what}`, said(await quote(sch), /Payment stages/))
  ok('no quote was filed by any of them', ((await admin.from('experience_quotes').select('id').eq('experience_id', E)).data ?? []).length === 0)

  group('the quote carries the stages')
  const q1 = await quote(S3)
  ok('a 70 / 10 / 20 quote is accepted', !q1.error, q1.error?.message ?? '')
  const bs = await brand.rpc('brand_experience_payment_stages', { p_experience_id: E })
  const same = (x: any[] | undefined) => !!x && x.length === S3.length && x.every((y, i) => y.label === S3[i].label && Number(y.pct) === S3[i].pct && y.on === S3[i].on)
  ok('the brand sees the stages on its open quote', !bs.error && same(bs.data?.quotes?.[q1.data as string]), JSON.stringify(bs.data ?? bs.error))
  const os = await ops.rpc('experience_console_payment_stages', { p_experience_id: E })
  ok('operational staff see the quote stages', !os.error && (os.data?.quotes?.[q1.data as string] ?? []).length === 3)
  const ed = await admin.from('experience_quotes').update({ payment_schedule: [] }).eq('id', q1.data as string)
  ok('the stages cannot be edited, even by the service role', said(ed, /cannot change/), ed.error?.message ?? 'updated!')
  ok('another brand cannot see them', refused(await brand2.rpc('brand_experience_payment_stages', { p_experience_id: E })))
  ok('a creator cannot', refused(await creator.rpc('brand_experience_payment_stages', { p_experience_id: E })))
  ok('anonymous cannot', refused(await anon.rpc('brand_experience_payment_stages', { p_experience_id: E })))
  ok('a brand cannot call the staff view', refused(await brand.rpc('experience_console_payment_stages', { p_experience_id: E })))
  ok('NULL is refused (deny on NULL)', refused(await brand.rpc('brand_experience_payment_stages', { p_experience_id: null })))
  const q0 = await quote(null)
  ok('a new quote with no stages replaces it (pay in full)', !q0.error && JSON.stringify((await brand.rpc('brand_experience_payment_stages', { p_experience_id: E })).data?.quotes?.[q0.data as string]) === '[]')
  const q2 = await quote(S3)
  ok('and a new 70 / 10 / 20 quote replaces that', !q2.error)

  const acc = await fin.rpc('experience_console_accept', { p_quote_id: q2.data, p_channel: 'email' })
  if (acc.error) throw new Error('accept: ' + acc.error.message)
  const st = await fin.rpc('experience_console_set_finance_settings', { p_legal_name: 'Guapd Technologies Pvt Ltd', p_address: '12 Test Road, Andheri, Mumbai 400053', p_state: 'Maharashtra', p_gstin: '27ABCDE1234F1Z5', p_gst_registered: false, p_pan: 'ABCDE1234F', p_payment_instructions: null })
  if (st.error) throw new Error('settings: ' + st.error.message)
  const bb = await fin.rpc('experience_console_set_brand_billing', { p_brand_id: B.brand_id, p_legal_name: 'Kiro Beauty Pvt Ltd', p_address: '1 Brand Street, Saket, New Delhi 110017', p_state: 'Delhi', p_gstin: null, p_pan: null, p_certificate_path: null })
  if (bb.error) throw new Error('billing: ' + bb.error.message)
  // An odd total on purpose: ₹1,00,000.01, so the stage rounding is exercised.
  const TOTAL = 10000001
  const d = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'initial', p_source: null, p_description: 'UGC content production: [stages-test]', p_subtotal_paise: TOTAL, p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: null })
  if (d.error) throw new Error('draft: ' + d.error.message)
  const I = d.data as string
  const iss = await fin.rpc('experience_console_invoice_issue', { p_invoice_id: I })
  if (iss.error) throw new Error('issue: ' + iss.error.message)
  const number = iss.data as string

  const view = async () => (await brand.rpc('brand_experience_payment_stages', { p_experience_id: E })).data?.invoices?.[I] as any
  const payQuote = () => brand.rpc('brand_experience_payin_quote', { p_invoice_id: I })
  const payOnline = async (amount: number) => {
    const ord = fakeOrder()
    const rec = await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: ord, p_invoice_id: I, p_amount_paise: amount, p_receipt: number, p_created_by: B.user_id })
    if (rec.error) return { error: rec.error.message }
    return (await hook(captured(fakePay(), ord, amount))).json
  }
  const [A1, A2, A3] = stageAmounts(TOTAL, S3)

  group('one invoice, stage by stage')
  let v = await view()
  ok('the invoice is paid in stages', v?.scheduled === true && v.stages.length === 3)
  ok(`rounding: the stages add up to exactly the invoice total (${A1} + ${A2} + ${A3})`, v.stages.reduce((t: number, x: any) => t + Number(x.amount_paise), 0) === TOTAL)
  ok('the screen preview and the database agree, paisa for paisa', v.stages.map((x: any) => Number(x.amount_paise)).join() === [A1, A2, A3].join(), v.stages.map((x: any) => x.amount_paise).join())
  ok('on acceptance: the advance is due now, the rest is not', Number(v.due_now_paise) === A1 && v.stages.map((x: any) => x.state).join() === 'due,upcoming,upcoming' && v.next_stage === 'Shoot')
  const pq = await payQuote()
  ok('online, the brand is asked for the advance only', !pq.error && Number(pq.data?.amount_paise) === A1, JSON.stringify(pq.data ?? pq.error))
  ok('an order for the whole balance is refused', said(await admin.rpc('razorpay_payin_order_record', { p_razorpay_order_id: fakeOrder(), p_invoice_id: I, p_amount_paise: TOTAL, p_receipt: number, p_created_by: B.user_id }), /balance on this invoice changed/))
  const fv = (await fin.rpc('experience_console_payment_stages', { p_experience_id: E })).data?.invoices?.[I]
  ok('finance sees the same stages and amount due', Number(fv?.due_now_paise) === A1)
  ok('operational staff do not see the invoice figures', JSON.stringify((await ops.rpc('experience_console_payment_stages', { p_experience_id: E })).data?.invoices) === '{}')

  const p1 = await payOnline(A1)
  ok('the advance is paid online through the webhook', p1.outcome === 'recorded', JSON.stringify(p1))
  v = await view()
  ok('…stage 1 paid, nothing due now, the shoot stage next', Number(v.due_now_paise) === 0 && v.stages[0].state === 'paid' && v.stages[1].state === 'upcoming' && v.next_stage === 'Shoot')
  ok('…the invoice stays open (part paid), not paid', ((await admin.from('service_invoices').select('status').eq('id', I).single()).data as any)?.status === 'issued')
  ok('…and online payment says nothing is due yet', said(await payQuote(), /Nothing is due on this invoice yet/))

  // The shoot is done (set directly: the roster flow has its own tests).
  await admin.from('experiences').update({ status: 'shoot_done' }).eq('id', E)
  v = await view()
  ok('after the shoot: the shoot stage is due', Number(v.due_now_paise) === A2 && v.stages[1].state === 'due' && v.stages[2].state === 'upcoming')
  const rep = await brand.rpc('brand_experience_payment_report', { p_invoice_id: I, p_amount_paise: A2, p_tds_paise: 0, p_paid_on: istToday(), p_method: 'upi', p_reference: 'UPI-STAGES-1', p_note: null })
  ok('the brand marks the shoot stage paid by UPI', !rep.error, rep.error?.message ?? '')
  v = await view()
  ok('…the stage shows "being checked" and nothing is due online', Number(v.due_now_paise) === 0 && v.stages[1].state === 'checking')
  const reportId = (await admin.from('service_invoice_payment_reports').select('id').eq('invoice_id', I).single()).data!.id
  const rj = await fin.rpc('experience_console_payment_report_decide', { p_report_id: reportId, p_decision: 'rejected', p_payment_id: null, p_reason: 'Not in the bank [stages-test]' })
  v = await view()
  ok('finance rejects it: the shoot stage is due again', !rj.error && Number(v.due_now_paise) === A2 && v.stages[1].state === 'due', rj.error?.message ?? '')
  const p2 = await payOnline(A2)
  ok('the shoot stage is paid online', p2.outcome === 'recorded', JSON.stringify(p2))
  v = await view()
  ok('…two stages paid, the final not due until sign-off', Number(v.due_now_paise) === 0 && v.stages.map((x: any) => x.state).join() === 'paid,paid,upcoming')

  await admin.from('experiences').update({ status: 'delivering' }).eq('id', E)
  ok('delivering is not sign-off: still nothing due', Number((await view()).due_now_paise) === 0)
  const so = await brand.rpc('brand_experience_signoff', { p_experience_id: E, p_note: null })
  v = await view()
  ok('after the brand signs off: the final stage is due', !so.error && Number(v.due_now_paise) === A3 && v.stages[2].state === 'due', so.error?.message ?? '')
  const p3 = await payOnline(A3)
  const inv = (await admin.from('service_invoices').select('status').eq('id', I).single()).data as any
  v = await view()
  ok('the final stage is paid online and settles the ONE invoice', p3.outcome === 'recorded' && inv?.status === 'paid', JSON.stringify(p3))
  ok('…every stage paid, nothing due, no balance', v.stages.every((x: any) => x.state === 'paid') && Number(v.due_now_paise) === 0 && Number(v.balance_paise) === 0)
  ok('…three ledger rows adding up to the total', ((await admin.from('service_invoice_payments').select('amount_paise').eq('invoice_id', I).is('reversed_at', null)).data ?? []).reduce((t: number, x: any) => t + Number(x.amount_paise), 0) === TOTAL)

  group('invoices without stages are due in full, as before')
  const ad = await fin.rpc('experience_console_invoice_draft', { p_experience_id: E, p_kind: 'additional', p_source: 'existing_footage', p_description: 'Extra cut: [stages-test]', p_subtotal_paise: 1500000, p_gst_rate_pct: null, p_cgst_paise: null, p_sgst_paise: null, p_igst_paise: null, p_due_date: null })
  const ai = ad.error ? ad : await fin.rpc('experience_console_invoice_issue', { p_invoice_id: ad.data })
  const av = (await brand.rpc('brand_experience_payment_stages', { p_experience_id: E })).data?.invoices?.[ad.data as string]
  ok('an additional invoice ignores the stages: all ₹15,000 due now', !ai.error && av?.scheduled === false && Number(av?.due_now_paise) === 1500000, ai.error?.message ?? JSON.stringify(av))
  const aq = await brand.rpc('brand_experience_payin_quote', { p_invoice_id: ad.data })
  ok('…and online asks for all of it', !aq.error && Number(aq.data?.amount_paise) === 1500000)

  group('nothing creator-side was touched')
  ok('no payout exists for this Experience', ((await admin.from('vendor_payouts').select('id').eq('experience_id', E)).data ?? []).length === 0)
}

async function teardown() {
  for (const E of exps) {
    const { data: invs } = await admin.from('service_invoices').select('id').eq('experience_id', E)
    const invIds = (invs ?? []).map((x) => x.id)
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
  if (payIds.length) await admin.from('razorpay_payin_payments').delete().in('razorpay_payment_id', payIds)
  if (orderIds.length) await admin.from('razorpay_payin_orders').delete().in('razorpay_order_id', orderIds)
  if (priorSettings !== undefined) {
    await admin.from('guapd_billing_settings').delete().eq('id', true)
    if (priorSettings) await admin.from('guapd_billing_settings').insert({ id: true, ...priorSettings })
  }
  if (billingBrand && priorBilling !== undefined) {
    await admin.from('brand_billing_profiles').delete().eq('brand_id', billingBrand)
    if (priorBilling) await admin.from('brand_billing_profiles').insert({ brand_id: billingBrand, ...priorBilling })
  }
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = ((await admin.from('experiences').select('id').like('title', '[stages-test]%')).data ?? []).length
  const leftGrants = grants.length ? ((await admin.from('staff_access').select('user_id').in('user_id', grants)).data ?? []).length : 0
  const leftPay = payIds.length ? ((await admin.from('razorpay_payin_payments').select('id').in('razorpay_payment_id', payIds)).data ?? []).length : 0
  ok('cleanup: no Experience, payment or staff grant left; settings and billing restored', left === 0 && leftGrants === 0 && leftPay === 0, `${left} exp, ${leftGrants} grants, ${leftPay} payments`)
}

run()
  .catch((e) => { failed++; console.error('\n❌ run aborted:', e.message) })
  .finally(async () => {
    await teardown().catch((e) => { failed++; console.error('❌ teardown:', e.message) })
    console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
    process.exit(failed ? 1 : 0)
  })
