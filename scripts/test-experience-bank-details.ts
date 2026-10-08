/**
 * 0542, creator bank details for Guapd payouts, against STAGING with real
 * sessions. Proves: the account number and PAN are encrypted at rest with the
 * Vault key (the stored bytes do not contain them; the plaintext columns stay
 * empty and the database refuses them); the creator reads their own details
 * MASKED only; operational staff see ••••1234 only, never the full number,
 * even on an approved payout; only FINANCE reads them in full, for a payout
 * still to be paid, and every view is audited without values; nobody reads
 * the tables directly; a change after a payout is requested blocks approval
 * until finance confirms; the change log holds field names only; no account
 * number or PAN reaches ops_events, deal events or notifications. NULL means no.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-bank-details.ts
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
import { creatorLegTerms } from '../apps/web/lib/experience-money'
import { fixtureInvoice } from './fixture-invoice'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const exps: string[] = []
const grants: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []
const uploaded: string[] = []
const invoices: string[] = []
const newVendorCreators: string[] = []
let startedAt = ''
const detailVendors: string[] = []   // vendors whose payout details this test created (none existed before)

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

/** An Experience through to sent creator legs. Returns its id and creator→deal / creator→roster maps. */
async function buildExperience(op: SupabaseClient, fin: SupabaseClient, brandId: string, title: string, creators: { id: string; rate: number }[],
  perCreator: { type: string; count: number }[], settings?: Record<string, unknown>) {
  const c = await op.rpc('experience_console_create', {
    p_brand_id: brandId, p_title: title, p_creator_count: creators.length, p_deliverables: perCreator,
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string
  exps.push(E)
  if (settings) {
    const { data: e } = await admin.from('experiences').select('settings_snapshot').eq('id', E).single()
    await admin.from('experiences').update({ settings_snapshot: { ...(e!.settings_snapshot as object), ...settings } }).eq('id', E)
  }
  const videos = perCreator.filter((d) => d.type === 'UGC video' || d.type === 'Reel').reduce((t, d) => t + d.count, 0) * creators.length
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: videos, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  if (q.error) throw new Error('quote: ' + q.error.message)
  const a = await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  if (a.error) throw new Error('accept: ' + a.error.message)
  await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: creators.map((x) => x.id), p_added_by: 'guapd', p_channel: null })
  const roster = ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  for (const r of roster) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  const lk = await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  if (lk.error) throw new Error('lock: ' + lk.error.message)
  for (const x of creators) {
    const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: x.id, p_day_rate_paise: x.rate })
    if (s.data) createdRates.push(s.data as string)
  }
  const legs = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const deal: Record<string, string> = {}, roster_: Record<string, string> = {}
  for (const l of legs) {
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: perCreator, p_affiliate_count: 0 })
    const rate = creators.find((x) => x.id === l.creator_id)!.rate
    const t = creatorLegTerms({ dayRatePaise: rate, days: 1, track: l.track })
    const s = await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    deal[l.creator_id] = s.data as string; roster_[l.creator_id] = l.roster_id; legDeals.push(s.data as string)
  }
  return { E, deal, roster: roster_ }
}


const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)


const ACCT = '501004433221', ACCT2 = '918273645500', PAN = 'ABCPK1234Q'
const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')
const leaks = (x: unknown) => { const j = JSON.stringify(x ?? null); return j.includes(ACCT) || j.includes(ACCT2) || j.includes(PAN) }

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !OP || !FIN) throw new Error('missing test actors')
  const { count: before } = await admin.from('vendor_payout_details').select('vendor_id', { count: 'exact', head: true })
  if (before !== 0) throw new Error('ABORT: payout details already exist on staging; this test only cleans up what it creates on an empty table')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id)
  const brand = await sessionFor(B.users.auth_id), cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const { data: hadVendors } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id])
  newVendorCreators.push(...[G.id, D.id].filter((id) => !(hadVendors ?? []).some((v: any) => v.creator_id === id)))
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  const save = (s: SupabaseClient, o: Partial<{ h: string | null; a: string | null; c: string | null; i: string | null; p: string | null; g: boolean | null }> = {}) =>
    s.rpc('creator_set_payout_details', { p_holder: 'h' in o ? o.h : 'Test Creator', p_account: 'a' in o ? o.a : ACCT, p_account_confirm: 'c' in o ? o.c : ('a' in o ? o.a : ACCT),
      p_ifsc: 'i' in o ? o.i : 'HDFC0001234', p_pan: 'p' in o ? o.p : PAN, p_gst_registered: 'g' in o ? o.g : false })

  group('only a creator, for themselves')
  for (const [n, s] of [['anonymous', anon], ['the brand', brand], ['operational staff', op], ['financial staff', fin], ['service role', admin]] as const) {
    ok(`${n}: cannot save or read creator payout details`, refused(await save(s as SupabaseClient)) && refused(await (s as SupabaseClient).rpc('creator_payout_details')))
  }
  ok('before saving: nothing on file', (await cG.rpc('creator_payout_details')).data?.on_file === false)

  group('validation (NULL means no)')
  ok('no holder name', said(await save(cG, { h: null }), /holder/))
  ok('account too short', said(await save(cG, { a: '12345' }), /9 to 18 digits/))
  ok('letters in the account', said(await save(cG, { a: '50100ABC3221', c: '50100ABC3221' }), /9 to 18 digits/))
  ok('NULL account', said(await save(cG, { a: null, c: null }), /9 to 18 digits/))
  ok('the two account numbers differ', said(await save(cG, { c: ACCT2 }), /do not match/))
  ok('NULL confirmation', said(await save(cG, { c: null }), /do not match/))
  ok('a wrong IFSC', said(await save(cG, { i: 'HDFC1234' }), /IFSC/))
  ok('a wrong PAN', said(await save(cG, { p: 'ABC123' }), /PAN/))
  ok('GST-registered left NULL', said(await save(cG, { g: null }), /GST/))
  ok('nothing was stored by the refused attempts', (await cG.rpc('creator_payout_details')).data?.on_file === false)

  group('saved: encrypted at rest, masked when read back')
  const s1 = await save(cG, { a: '5010 0443-3221', c: '501004433221', i: 'hdfc0001234 ' })
  ok('G saves (spaces and dashes in the number, lower-case IFSC are tidied)', !s1.error, s1.error?.message ?? '')
  ok('what comes back is masked: ••••3221, PAN ••••••234Q, no full number', s1.data?.account_masked === '••••3221' && s1.data?.pan_masked === '••••••234Q' && s1.data?.ifsc === 'HDFC0001234' && !leaks(s1.data))
  ok('…and it says this was the first save', s1.data?.first_time === true && s1.data?.changed === true)
  const vG = (await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id as string
  detailVendors.push(vG)
  const row = (await admin.from('vendor_payout_details').select('bank_account_number, pan, account_number_enc, account_last4, pan_enc, pan_last4').eq('vendor_id', vG).single()).data as any
  ok('the plaintext columns are empty', row.bank_account_number === null && row.pan === null)
  ok('the encrypted columns are filled and do not contain the number or PAN', !!row.account_number_enc && !!row.pan_enc
    && !String(row.account_number_enc).includes(hex(ACCT)) && !String(row.pan_enc).includes(hex(PAN)) && !String(row.account_number_enc).includes(ACCT))
  ok('only the last 4 are kept in the clear', row.account_last4 === '3221' && row.pan_last4 === '234Q')
  ok('the database refuses a plaintext account number, even from the service role', refused(await admin.from('vendor_payout_details').update({ bank_account_number: ACCT }).eq('vendor_id', vG).select('vendor_id')))
  ok('…and a plaintext PAN', refused(await admin.from('vendor_payout_details').update({ pan: PAN }).eq('vendor_id', vG).select('vendor_id')))
  ok('…and a last-4 that is not 4 digits', refused(await admin.from('vendor_payout_details').update({ account_last4: '3221x' }).eq('vendor_id', vG).select('vendor_id')))
  ok("G's own read is masked", await (async () => { const d = (await cG.rpc('creator_payout_details')).data; return d.on_file === true && d.account_masked === '••••3221' && !leaks(d) })())
  ok("D does not see G's details (their own: none)", await (async () => { const d = (await cD.rpc('creator_payout_details')).data; return d.on_file === false && !leaks(d) })())
  for (const [n, s] of [['G', cG], ['D', cD], ['operational staff', op], ['financial staff', fin], ['the brand', brand], ['anonymous', anon]] as const) {
    let none = true
    for (const t of ['vendor_payout_details', 'vendor_payout_detail_changes']) {
      const r = await (s as SupabaseClient).from(t).select('vendor_id').limit(5)
      if (!r.error && (r.data ?? []).length > 0) none = false
    }
    ok(`${n}: the tables are not readable directly`, none)
  }

  group('changes: field names only')
  const same = await save(cG, { a: ACCT })
  ok('saving the same details again changes nothing', !same.error && same.data?.changed === false && same.data?.first_time === false)
  let ch = (await admin.from('vendor_payout_detail_changes').select('fields').eq('vendor_id', vG).order('changed_at')).data as any[]
  ok('one change recorded so far (the first save, all five fields)', ch.length === 1 && ch[0].fields.length === 5)
  const s2 = await save(cG, { i: 'ICIC0004321' })
  ch = (await admin.from('vendor_payout_detail_changes').select('fields').eq('vendor_id', vG).order('changed_at')).data as any[]
  ok('changing the IFSC records just "ifsc"', s2.data?.changed === true && JSON.stringify(ch[1]?.fields) === '["ifsc"]')
  ok('the change log never holds a value', !leaks(ch) && !JSON.stringify(ch).includes('ICIC'))

  group('a payout: ops masked, finance in full')
  const one = await buildExperience(op, fin, B.brand_id, '[bank-test] Kiro', [{ id: G.id, rate: 1000000 }], [{ type: 'UGC video', count: 1 }])
  const E = one.E, gLeg = one.deal[G.id]
  await admin.from('deals').update({ status: 'agreed' }).eq('id', gLeg)
  await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: one.roster[G.id], p_outcome: 'done', p_reason: null })
  const rq = await op.rpc('experience_console_payout_request', { p_deal_id: gLeg, p_tds_paise: 0 })
  ok('operational staff request G\'s payout', !rq.error, rq.error?.message ?? '')
  const P = rq.data as string
  const screen = async (s: SupabaseClient) => (await s.rpc('experience_console_payouts', { p_experience_id: E })).data as any
  const opScreen = await screen(op)
  const opLeg = (opScreen.legs as any[]).find((l) => l.deal_id === gLeg)
  ok('the payouts screen shows ops ••••3221 and "bank on file", nothing more', opLeg.payment_details.bank_on_file === true && opLeg.payment_details.account_masked === '••••3221' && !leaks(opScreen))
  ok('ops cannot pay (can_pay false); finance can', opScreen.can_pay === false && (await screen(fin)).can_pay === true)
  ok('the finance screen is masked too (full details only on request)', !leaks(await screen(fin)))
  for (const [n, s] of [['operational staff', op], ['the creator', cG], ['the brand', brand], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: the full bank details are refused`, refused(await (s as SupabaseClient).rpc('experience_console_payout_account', { p_payout_id: P })))
  }
  ok('NULL payout is refused', refused(await fin.rpc('experience_console_payout_account', { p_payout_id: null })))
  const acc = await fin.rpc('experience_console_payout_account', { p_payout_id: P })
  ok('financial staff get the full details to pay', !acc.error && acc.data?.account_number === ACCT && acc.data?.pan === PAN && acc.data?.ifsc === 'ICIC0004321' && acc.data?.changed_after_request === false, acc.error?.message ?? '')

  group('a change after the request blocks approval until confirmed')
  await new Promise((r) => setTimeout(r, 1100))
  await save(cG, { a: ACCT2 })
  ok('the payouts screen flags it', ((await screen(fin)).legs as any[]).find((l) => l.deal_id === gLeg)?.payout?.details_changed_after_request === true)
  ok('finance approval without confirming is refused', said(await fin.rpc('experience_console_payout_approve', { p_payout_id: P }), /changed their bank details/))
  ok('NULL confirmation is not a yes', said(await fin.rpc('experience_console_payout_approve', { p_payout_id: P, p_confirm_details_changed: null }), /changed their bank details/))
  ok('ops cannot approve (confirmed or not)', said(await op.rpc('experience_console_payout_approve', { p_payout_id: P, p_confirm_details_changed: true }), /Financial access/))
  ok('finance confirms and approves', !refused(await fin.rpc('experience_console_payout_approve', { p_payout_id: P, p_confirm_details_changed: true })))
  ok('approved: ops still see only ••••5500, never the full number', await (async () => { const sc = await screen(op); const l = (sc.legs as any[]).find((x) => x.deal_id === gLeg); return l.payment_details.account_masked === '••••5500' && !leaks(sc) })()
    && refused(await op.rpc('experience_console_payout_account', { p_payout_id: P })))
  ok('finance reads the NEW number on the approved payout', (await fin.rpc('experience_console_payout_account', { p_payout_id: P })).data?.account_number === ACCT2)
  await fin.rpc('experience_console_payout_cancel', { p_payout_id: P, p_reason: 'Test over' })
  ok('a cancelled payout no longer opens the details', said(await fin.rpc('experience_console_payout_account', { p_payout_id: P }), /still to be paid/))

  group('never in audit, events or notifications')
  const { data: ev } = await admin.from('ops_events').select('action, detail').in('actor_auth_id', [OP.auth_id, FIN.auth_id]).gte('created_at', startedAt)
  const views = (ev ?? []).filter((e) => e.action === 'finance.payout_details_viewed')
  ok('each finance view that showed the details is audited (2; the refused ones showed nothing)', views.length === 2, String(views.length))
  ok('no audit row carries the number, the PAN or a bank field', !leaks(ev) && !(ev ?? []).some((e) => /account|ifsc|pan|holder/i.test(Object.keys(e.detail as object).join(' '))))
  const { data: dev } = await admin.from('events').select('detail').eq('deal_id', gLeg)
  ok('the deal timeline carries none of it', !leaks(dev))
  const { data: nt } = await admin.from('notifications').select('body').eq('user_id', G.user_id).gte('created_at', startedAt)
  ok("G's notifications carry none of it", !leaks(nt))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (uploaded.length) await admin.storage.from('finance-docs').remove(uploaded)
  for (const E of exps) {
    await admin.from('vendor_payouts').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
  for (const v of detailVendors) { await admin.from('vendor_payout_detail_changes').delete().eq('vendor_id', v); await admin.from('vendor_payout_details').delete().eq('vendor_id', v) }
  if (newVendorCreators.length) await admin.from('vendors').delete().in('creator_id', newVendorCreators)
  if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('events').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
  for (const E of exps) { await admin.from('experience_cost_lines').delete().eq('experience_id', E); await admin.from('experiences').delete().eq('id', E) }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[bank-test]%')
  const files = uploaded.length ? (await admin.storage.from('finance-docs').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files, bank details)', (left.data ?? []).length === 0
    && ((await admin.from('vendor_payout_details').select('vendor_id').limit(1)).data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
