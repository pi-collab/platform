/**
 * 0544, Phase 6: the brand's own Experience screens, against STAGING with REAL
 * brand logins. The gate this phase exists for:
 *   - one brand gate: a member of THIS Experience's brand; never the house
 *     brand; NULL id / no session / not a member = refused, the same answer;
 *     admin-only steps (price, sign-off) refuse a plain member;
 *   - brands read only through functions (no direct table read), named
 *     fields only, and NOTHING about creator money, costs, notes, prospects,
 *     the creator brief, ids or another brand: every field of every brand
 *     read is scanned, values included, for planted markers and forbidden keys;
 *   - the report (Phase 2.5): an explicit field list, locked-roster names and
 *     handles, delivered items with the decision, the brand's own invoices;
 *     its source joins no money table and selects no *;
 *   - brand and staff paths coexist: same columns, 'portal' only from the
 *     brand, last writer wins until the point of no return, stale screens
 *     refused;
 *   - another brand, a creator, staff, anonymous and the service role get
 *     nothing.
 * Completion itself is forced by the service role at the end (Phase 4's
 * suites cover the real completion gate); everything before it goes through
 * the real functions. Teardown records every id, deletes child rows first,
 * runs in `finally`, and fails the run if anything is left.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-brand-portal.ts
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
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }
const PREFIX = '[brand-portal-test]'

// Everything made here, for teardown.
const exps: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
const grants: string[] = []
const tempMembers: string[] = []
const brandStatusRestore: { id: string; status: string }[] = []
const actorAuth: string[] = []
let startedAt = ''

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session (auth rate limit?)')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

/** Every key at every depth. */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out) }
  return out
}
// Keys no brand read may ever carry (creator money, costs, notes, ids, internals).
const FORBIDDEN_KEY = /rate|gross|net_|_net|pct|percent|payout|cost|margin|fee|staff|internal|counter|prospect|bank|account|ifsc|pan$|tds|creator_id|deal_id|leg_|terms|snapshot|brief_for|creator_brief|settings|created_by|recorded_by|decided_by|phone|email/i

const request = (o: Record<string, unknown> = {}) => ({
  p_title: `${PREFIX} Diwali UGC`, p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }],
  p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
  p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null,
  p_brief: 'Festive looks, warm light', ...o })

async function run() {
  startedAt = new Date().toISOString()
  // ── Actors: brand A admin, a plain member of A (temporary), brand B, a creator, staff ──
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status, name)').limit(120)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && m.brands?.is_guapd === false)
  const BA = members.find((m) => m.is_admin && m.brands.brand_status === 'approved')
  const BB = members.find((m) => m.brand_id !== BA?.brand_id)
  const { data: house } = await admin.from('brands').select('id').eq('is_guapd', true).limit(1).maybeSingle()
  const { data: cr } = await admin.from('creators').select('id, user_id, full_name, handle, is_bookable, vetting_status, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(80)
  const pool = (cr ?? []) as any[]
  const [K1, K2, K3] = pool.filter((c) => c.handle)
  const C = pool.find((c) => c.users?.auth_id && ![K1?.id, K2?.id, K3?.id].includes(c.id)) ?? pool.find((c) => c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const { data: allMembers } = await admin.from('brand_members').select('user_id')
  const { data: creatorUsers } = await admin.from('creators').select('user_id').not('user_id', 'is', null)
  const busy = new Set([...(access ?? []).map((a) => a.user_id), ...(allMembers ?? []).map((m) => m.user_id), ...(creatorUsers ?? []).map((c) => c.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP, FIN, MEMBER, HOUSE_MEMBER] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!BA || !BB || !house || !K1 || !K2 || !K3 || !C || !OP || !FIN || !MEMBER || !HOUSE_MEMBER) throw new Error('missing test actors')

  const { data: had } = await admin.from('creator_products').select('id').in('creator_id', [K1.id, K2.id, K3.id]).eq('pricing_type', 'per_day')
  if ((had ?? []).length) throw new Error('ABORT: test creators already have day-rate rows on staging')

  must(await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }]), 'grant')
  grants.push(OP.id, FIN.id)
  const tm = must(await admin.from('brand_members').insert({ brand_id: BA.brand_id, user_id: MEMBER.id, is_admin: false }).select('id').single(), 'member') as { id: string }
  tempMembers.push(tm.id)
  actorAuth.push(BA.users.auth_id, MEMBER.auth_id)

  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id)
  const ba = await sessionFor(BA.users.auth_id), member = await sessionFor(MEMBER.auth_id), bb = await sessionFor(BB.users.auth_id)
  const creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)
  const outsiders = [['another brand', bb], ['a creator', creator], ['staff (not a member)', op], ['anonymous', anon], ['service role', admin]] as const

  // ════════ Request ════════
  group('request: any member of an approved brand, on Guapd')
  ok('NULL title refused', refused(await ba.rpc('brand_experience_request', request({ p_title: null }))))
  ok('no deliverables refused', refused(await ba.rpc('brand_experience_request', request({ p_deliverables: [] }))))
  ok('NULL creator count refused', refused(await ba.rpc('brand_experience_request', request({ p_creator_count: null }))))
  for (const [n, s] of [['a creator', creator], ['staff (no brand)', op], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: cannot request`, refused(await (s as SupabaseClient).rpc('brand_experience_request', request())))
  }
  const r1 = await ba.rpc('brand_experience_request', request())
  ok('the brand admin requests one', !r1.error, r1.error?.message ?? '')
  const E = r1.data as string; exps.push(E)
  const { data: e1 } = await admin.from('experiences').select('status, request_channel, brand_id, created_by').eq('id', E).single()
  ok('it is a Request, on Guapd (channel "portal"), for their brand, by them', e1?.status === 'requested' && e1?.request_channel === 'portal' && e1?.brand_id === BA.brand_id && e1?.created_by === BA.user_id)
  const r2 = await member.rpc('brand_experience_request', request({ p_title: `${PREFIX} Second` }))
  ok('a plain member can request too', !r2.error, r2.error?.message ?? '')
  const E2 = r2.data as string; if (E2) exps.push(E2)
  if (BB.brands.brand_status === 'approved') {
    brandStatusRestore.push({ id: BB.brand_id, status: 'approved' })
    must(await admin.from('brands').update({ brand_status: 'unreviewed' }).eq('id', BB.brand_id), 'unreview brand B')
  }
  const pend = await bb.rpc('brand_experience_request', request({ p_title: `${PREFIX} Pending` }))
  if (pend.data) exps.push(pend.data as string)
  ok('a brand not yet approved cannot request', said(pend, /approved/), pend.error?.message ?? `created (brand status was ${BB.brands.brand_status})`)
  for (const r of brandStatusRestore.splice(0)) await admin.from('brands').update({ brand_status: r.status }).eq('id', r.id)
  ok('staff cannot record a request as "portal"', said(await op.rpc('experience_console_create', { ...request({ p_title: `${PREFIX} x` }), p_brand_id: BA.brand_id, p_channel: 'portal' }), /On Guapd/))
  const sr = await op.rpc('experience_console_create', { ...request({ p_title: `${PREFIX} By staff` }), p_brand_id: BA.brand_id, p_channel: 'whatsapp' })
  ok('staff still record a request for the brand (WhatsApp)', !sr.error, sr.error?.message ?? '')
  if (sr.data) exps.push(sr.data as string)

  // ════════ The gate ════════
  group('the gate: own brand only; the same "Not found" for everyone else')
  const v = await ba.rpc('brand_experience', { p_experience_id: E })
  ok('the admin reads their Experience', !v.error && (v.data as any)?.id === E && (v.data as any)?.is_admin === true, v.error?.message ?? '')
  const vm = await member.rpc('brand_experience', { p_experience_id: E })
  ok('a plain member reads it, flagged not admin', !vm.error && (vm.data as any)?.is_admin === false)
  for (const [n, s] of outsiders) {
    const x = await (s as SupabaseClient).rpc('brand_experience', { p_experience_id: E })
    // Signed-in outsiders get "Not found"; anonymous cannot even call it.
    ok(`${n}: brand_experience refused`, n === 'anonymous' ? refused(x) : said(x, /Not found/), x.error?.message ?? 'READ')
  }
  ok('NULL id refused', said(await ba.rpc('brand_experience', { p_experience_id: null }), /Not found/))
  ok('an unknown id: the same answer', said(await ba.rpc('brand_experience', { p_experience_id: '00000000-0000-0000-0000-000000000000' }), /Not found/))
  const hx = must(await admin.from('experiences').insert({ brand_id: house!.id, title: `${PREFIX} House`, status: 'requested', request_creator_count: 1, request_deliverables: [{ type: 'UGC video', count: 1 }] }).select('id').single(), 'house exp') as { id: string }
  exps.push(hx.id)
  const hm = must(await admin.from('brand_members').insert({ brand_id: house!.id, user_id: HOUSE_MEMBER.id, is_admin: true }).select('id').single(), 'house member') as { id: string }
  tempMembers.push(hm.id); actorAuth.push(HOUSE_MEMBER.auth_id)
  const houseSession = await sessionFor(HOUSE_MEMBER.auth_id)
  ok('the Guapd house brand: refused even for its member', said(await houseSession.rpc('brand_experience', { p_experience_id: hx.id }), /Not found/))
  const list = await ba.rpc('brand_experiences')
  const listed = ((list.data as any)?.experiences ?? []) as any[]
  ok('the list shows their Experiences and no other brand\'s', listed.some((x) => x.id === E) && !listed.some((x) => x.id === hx.id) && listed.every((x) => x.brand_name === BA.brands.name || members.some((m) => m.user_id === BA.user_id && m.brands.name === x.brand_name)))
  ok('…and says they can request', (list.data as any)?.can_request === true)
  ok('the list is refused to anonymous and the service role', refused(await anon.rpc('brand_experiences')) && refused(await admin.rpc('brand_experiences')))
  for (const [n, s] of [['the brand', ba], ['a creator', creator], ['anonymous', anon]] as const) {
    ok(`${n}: experiences, experience_roster, experience_quotes not readable directly`,
      refused(await (s as SupabaseClient).from('experiences').select('id').limit(1)) && refused(await (s as SupabaseClient).from('experience_roster').select('id').limit(1)) && refused(await (s as SupabaseClient).from('experience_quotes').select('id').limit(1)))
  }

  // ════════ Price ════════
  group('the price: a brand ADMIN accepts, or declines with a note')
  const q1 = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: 'Two creators, one day', p_channel: null }), 'quote 1') as string
  const bq = ((await ba.rpc('brand_experience', { p_experience_id: E })).data as any).quote
  ok('the brand sees Guapd\'s open quote: its own price, no Guapd author', bq?.quote_id === q1 && bq?.status === 'open' && Number(bq?.total_paise) === 7000000 && !('created_by' in bq))
  ok('a plain member cannot answer the price', said(await member.rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: true, p_note: null }), /admin/))
  ok('NULL accept is refused', refused(await ba.rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: null, p_note: null })))
  ok('declining needs a note', refused(await ba.rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: false, p_note: ' ' })))
  for (const [n, s] of outsiders) ok(`${n}: cannot answer`, refused(await (s as SupabaseClient).rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: true, p_note: null })))
  ok('the admin declines with a note', !refused(await ba.rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: false, p_note: 'Closer to ₹60k please' })))
  const { data: q1row } = await admin.from('experience_quotes').select('status, recorded_channel, brand_note, decided_by').eq('id', q1).single()
  ok('the quote is Declined, on Guapd, with their note, by them', q1row?.status === 'rejected' && q1row?.recorded_channel === 'portal' && q1row?.brand_note === 'Closer to ₹60k please' && q1row?.decided_by === BA.user_id)
  const sq = (await fin.rpc('experience_console_quotes', { p_experience_id: E })).data as any[]
  const so = (await op.rpc('experience_console_quotes', { p_experience_id: E })).data as any[]
  ok('finance sees the brand\'s note on the console; operational staff do not (financial, like the message)', sq?.[0]?.brand_note === 'Closer to ₹60k please' && so?.[0]?.brand_note == null)
  ok('a declined quote cannot be accepted later (stale)', said(await ba.rpc('brand_experience_quote_answer', { p_quote_id: q1, p_accept: true, p_note: null }), /changed/))
  const q2 = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-10-01', p_shoot_city: 'Mumbai', p_message: null, p_channel: null }), 'quote 2') as string
  ok('the admin accepts the new price', !refused(await ba.rpc('brand_experience_quote_answer', { p_quote_id: q2, p_accept: true, p_note: null })))
  const { data: e2 } = await admin.from('experiences').select('status, brand_service_total_paise').eq('id', E).single()
  const { data: q2row } = await admin.from('experience_quotes').select('status, recorded_channel').eq('id', q2).single()
  ok('price agreed: Building roster at ₹60,000, accepted on Guapd', e2?.status === 'rostering' && Number(e2?.brand_service_total_paise) === 6000000 && q2row?.status === 'accepted' && q2row?.recorded_channel === 'portal')
  ok('staff cannot record an acceptance as "portal"', said(await fin.rpc('experience_console_accept', { p_quote_id: q2, p_channel: 'portal' }), /On Guapd/))
  if (E2) {
    const cq = must(await fin.rpc('experience_console_quote', { p_experience_id: E2, p_proposed_by: 'brand', p_per_video_paise: 2000000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-12-01', p_shoot_city: 'Pune', p_message: null, p_channel: 'email' }), 'counter') as string
    ok('a brand counter (recorded by staff) is Guapd\'s to answer, not the brand\'s', said(await ba.rpc('brand_experience_quote_answer', { p_quote_id: cq, p_accept: true, p_note: null }), /your counter/))
    ok('staff cannot record a brand counter as "portal"', said(await fin.rpc('experience_console_quote', { p_experience_id: E2, p_proposed_by: 'brand', p_per_video_paise: 1, p_deliverable_count: 1, p_misc_paise: 0, p_deliverables: [], p_shoot_date: null, p_shoot_city: null, p_message: null, p_channel: 'portal' }), /On Guapd/))
  }

  // ════════ Roster ════════
  group('the roster: any member decides until the creator is locked; staff too; last one stands')
  must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1.id, K2.id, K3.id], p_added_by: 'guapd', p_channel: null }), 'roster add')
  ok('staff cannot add brand picks as "portal"', said(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [C.id], p_added_by: 'brand', p_channel: 'portal' }), /On Guapd/))
  const SECRET_NOTE = 'SECRET-ROSTER-NOTE-7731'
  const staffRows = must(await op.rpc('experience_console_roster', { p_experience_id: E }), 'roster') as any[]
  const rowOf = (k: { id: string }) => staffRows.find((r) => r.creator_id === k.id)
  must(await op.rpc('experience_console_roster_note', { p_roster_id: rowOf(K1).id, p_note: SECRET_NOTE }), 'note')
  must(await op.rpc('experience_console_set_creator_brief', { p_experience_id: E, p_brief: 'SECRET-CREATOR-BRIEF-7731' }), 'brief')
  must(await op.rpc('experience_console_cost_add', { p_experience_id: E, p_label: 'SECRET-COST-7731', p_category: 'makeup', p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 777100, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null }), 'cost')
  must(await op.rpc('experience_console_prospect_add', { p_experience_id: E, p_full_name: 'Secret Prospect', p_handle: 'secretprospect7731', p_phone: null, p_cost_basis: 'flat', p_day_rate_paise: null, p_days: null, p_flat_paise: 500000, p_note: null, p_status: 'not_contacted' }), 'prospect')
  const br = await ba.rpc('brand_experience_roster', { p_experience_id: E })
  const bcs = ((br.data as any)?.creators ?? []) as any[]
  const RKEYS = ['added_by', 'decided_at', 'decided_on_guapd', 'decision', 'full_name', 'handle', 'locked', 'photo_url', 'planned_deliverables', 'profile_url', 'roster_id'].join(',')
  ok('the brand sees 3 creators: names, handles, profile links, plan, decision', bcs.length === 3 && bcs.every((c) => Object.keys(c).sort().join(',') === RKEYS), Object.keys(bcs[0] ?? {}).sort().join(','))
  ok('…profile links are Instagram links built from the handle', bcs.every((c) => !c.handle || c.profile_url === `https://instagram.com/${c.handle}`))
  ok('…and never the note, the prospect, a creator id', !JSON.stringify(br.data).includes(SECRET_NOTE) && !JSON.stringify(br.data).includes('secretprospect7731') && ![K1.id, K2.id, K3.id].some((id) => JSON.stringify(br.data).includes(id)))
  for (const [n, s] of outsiders) ok(`${n}: roster refused`, refused(await (s as SupabaseClient).rpc('brand_experience_roster', { p_experience_id: E })))
  const bRow = (k: { full_name: string }) => bcs.find((c) => c.full_name === k.full_name)
  const decide = (s: SupabaseClient, k: { full_name: string }, d: string | null, exp: string | null) => s.rpc('brand_experience_roster_decide', { p_roster_id: bRow(k).roster_id, p_decision: d, p_expected: exp })
  ok('NULL decision / NULL expected / "pending" refused', refused(await decide(ba, K1, null, 'pending')) && refused(await decide(ba, K1, 'accepted', null)) && refused(await decide(ba, K1, 'pending', 'pending')))
  ok('the admin accepts K1', !refused(await decide(ba, K1, 'accepted', 'pending')))
  const { data: k1row } = await admin.from('experience_roster').select('brand_decision, decision_channel').eq('id', bRow(K1).roster_id).single()
  ok('…recorded on Guapd', k1row?.brand_decision === 'accepted' && k1row?.decision_channel === 'portal')
  ok('a stale screen (still showing "pending") is refused', said(await decide(ba, K1, 'rejected', 'pending'), /changed/))
  ok('staff record a different answer for the brand (rejected, WhatsApp): last one stands', !refused(await op.rpc('experience_console_roster_decide', { p_roster_id: bRow(K1).roster_id, p_decision: 'rejected', p_channel: 'whatsapp' })))
  ok('the brand changes it back (accepted, showing "rejected")', !refused(await decide(ba, K1, 'accepted', 'rejected')))
  ok('staff cannot record a roster decision as "portal"', said(await op.rpc('experience_console_roster_decide', { p_roster_id: bRow(K2).roster_id, p_decision: 'accepted', p_channel: 'portal' }), /On Guapd/))
  ok('a plain member accepts K2', !refused(await decide(member, K2, 'accepted', 'pending')))
  ok('the admin rejects K3', !refused(await decide(ba, K3, 'rejected', 'pending')))
  for (const [n, s] of outsiders) ok(`${n}: cannot decide`, refused(await decide(s as SupabaseClient, K3, 'accepted', 'rejected')))
  must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
  ok('once locked, the brand cannot change a creator', said(await decide(ba, K1, 'rejected', 'accepted'), /confirmed/))

  // ════════ Legs, shoot, deliverables (real functions) ════════
  group('deliverables: any member approves or asks for changes; approval is final')
  for (const k of [K1, K2]) createdRates.push(must(await op.rpc('experience_console_set_day_rate', { p_creator_id: k.id, p_day_rate_paise: 1000000 }), 'rate') as string)
  const legs = must(await op.rpc('experience_console_legs', { p_experience_id: E }), 'legs') as any[]
  const netOf: string[] = []
  for (const l of legs.filter((x) => [K1.id, K2.id].includes(x.creator_id))) {
    must(await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: null }), 'draft')
    const t = creatorLegTerms({ dayRatePaise: 1000000, days: 1, track: l.track })
    netOf.push(String(t.creatorNetPaise), String(t.creatorGrossPaise))
    legDeals.push(must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send') as string)
  }
  await admin.from('deals').update({ status: 'agreed' }).in('id', legDeals)
  must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), 'schedule')
  for (const l of legs.filter((x) => [K1.id, K2.id].includes(x.creator_id))) must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: l.roster_id, p_outcome: 'done', p_reason: null }), 'outcome')
  let dv = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'deliverables') as any
  const itemOf = (k: { id: string }) => ((dv.legs as any[]).find((l) => l.creator_id === k.id).items as any[])[0]
  for (const k of [K1, K2]) {
    must(await op.rpc('experience_console_item_attach', { p_item_id: itemOf(k).id, p_url: `https://drive.example.com/bp-${k.id.slice(0, 8)}`, p_storage_path: null, p_file_name: null }), 'attach')
    must(await fin.rpc('experience_console_item_review', { p_item_id: itemOf(k).id, p_decision: 'approve', p_note: null }), 'review')
  }
  must(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [itemOf(K1).id, itemOf(K2).id] }), 'release')
  dv = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'deliverables 2') as any
  const bd = await ba.rpc('brand_experience_deliverables', { p_experience_id: E })
  const items = ((bd.data as any)?.items ?? []) as any[]
  ok('the brand sees the 2 shared items, by creator name', items.length === 2 && items.every((i) => [K1.full_name, K2.full_name].includes(i.creator_name)), bd.error?.message ?? JSON.stringify(items.map((i) => i.creator_name)))
  const itemFor = (k: { full_name: string }) => items.find((i) => i.creator_name === k.full_name)
  const rd = (s: SupabaseClient, k: { full_name: string }, d: string | null, note: string | null, exp: string | null) => s.rpc('brand_experience_release_decide', { p_release_id: itemFor(k).release_id, p_decision: d, p_note: note, p_expected: exp })
  ok('NULL decision / NULL expected refused; changes need a note', refused(await rd(ba, K1, null, null, 'new')) && refused(await rd(ba, K1, 'approved', null, null)) && refused(await rd(ba, K1, 'changes_requested', ' ', 'new')))
  ok('a plain member asks for changes on K1\'s video', !refused(await rd(member, K1, 'changes_requested', 'Show the label in the first 3 seconds', 'new')))
  const { data: rel1 } = await admin.from('experience_deliverable_releases').select('brand_decision, brand_decision_channel, brand_decision_note').eq('id', itemFor(K1).release_id).single()
  ok('…recorded on Guapd with their words', rel1?.brand_decision === 'changes_requested' && rel1?.brand_decision_channel === 'portal' && rel1?.brand_decision_note === 'Show the label in the first 3 seconds')
  ok('a stale screen (still "new") is refused', said(await rd(ba, K1, 'approved', null, 'new'), /changed/))
  ok('the brand sees its own words back (written on Guapd)', ((((await ba.rpc('brand_experience_deliverables', { p_experience_id: E })).data as any).items) as any[]).find((i) => i.creator_name === K1.full_name)?.changes_asked === 'Show the label in the first 3 seconds')
  ok('staff cannot record a deliverable decision as "portal"', said(await op.rpc('experience_console_release_decide', { p_release_id: itemFor(K2).release_id, p_decision: 'approved', p_channel: 'portal', p_note: null }), /Say how/))
  ok('staff record changes for the brand (email) on K2…', !refused(await op.rpc('experience_console_release_decide', { p_release_id: itemFor(K2).release_id, p_decision: 'changes_requested', p_channel: 'email', p_note: 'STAFF-WORDED-7731' })))
  ok('…and the brand sees "changes asked" but never a note staff recorded (0538 rule)', !JSON.stringify((await ba.rpc('brand_experience_deliverables', { p_experience_id: E })).data).includes('STAFF-WORDED-7731'))
  ok('staff record an approval for the brand (email) on K2', !refused(await op.rpc('experience_console_release_decide', { p_release_id: itemFor(K2).release_id, p_decision: 'approved', p_channel: 'email', p_note: null })))
  ok('…then the brand cannot change an approved item', said(await rd(ba, K2, 'changes_requested', 'too late', 'approved'), /already approved/) || refused(await rd(ba, K2, 'changes_requested', 'too late', 'approved')))
  ok('the admin approves K1 (screen showing "changes asked")', !refused(await rd(ba, K1, 'approved', null, 'changes_requested')))
  for (const [n, s] of outsiders) ok(`${n}: deliverables read and decide refused`, refused(await (s as SupabaseClient).rpc('brand_experience_deliverables', { p_experience_id: E })) && refused(await rd(s as SupabaseClient, K1, 'approved', null, 'approved')))
  const bd2 = await ba.rpc('brand_experience_deliverables', { p_experience_id: E })
  ok('both show approved; who decided is "on Guapd" for K1, via Guapd for K2', ((bd2.data as any).items as any[]).every((i) => i.decision === 'approved' && i.can_decide === false)
    && ((bd2.data as any).items as any[]).find((i) => i.creator_name === K1.full_name).decided_on_guapd === true && ((bd2.data as any).items as any[]).find((i) => i.creator_name === K2.full_name).decided_on_guapd === false)

  // ════════ Sign-off ════════
  group('sign-off: a brand ADMIN, while Delivering; staff can clear it')
  ok('a plain member cannot sign off', said(await member.rpc('brand_experience_signoff', { p_experience_id: E, p_note: null }), /admin/))
  for (const [n, s] of outsiders) ok(`${n}: cannot sign off`, refused(await (s as SupabaseClient).rpc('brand_experience_signoff', { p_experience_id: E, p_note: null })))
  ok('NULL id refused', refused(await ba.rpc('brand_experience_signoff', { p_experience_id: null, p_note: null })))
  ok('the admin signs off', !refused(await ba.rpc('brand_experience_signoff', { p_experience_id: E, p_note: 'All good' })))
  ok('twice is refused', refused(await ba.rpc('brand_experience_signoff', { p_experience_id: E, p_note: null })))
  ok('staff can clear it (reason), and the admin signs off again', !refused(await op.rpc('experience_console_brand_signoff_clear', { p_experience_id: E, p_reason: 'Signed off before the last cut' }))
    && !refused(await ba.rpc('brand_experience_signoff', { p_experience_id: E, p_note: null })))
  const { data: so2 } = await admin.from('experiences').select('brand_signoff_channel, brand_signoff_recorded_by').eq('id', E).single()
  ok('…on Guapd, by them', so2?.brand_signoff_channel === 'portal' && so2?.brand_signoff_recorded_by === BA.user_id)

  // ════════ The report (Phase 2.5): the gate this phase is reviewed on ════════
  group('the report: names without rates')
  ok('before Complete: refused, saying why', said(await ba.rpc('brand_experience_report', { p_experience_id: E }), /complete/))
  await admin.from('experiences').update({ status: 'complete', guapd_signoff_at: new Date().toISOString(), guapd_signoff_by: OP.id }).eq('id', E)
  const rep = await ba.rpc('brand_experience_report', { p_experience_id: E })
  const R = rep.data as any
  ok('the admin reads the report', !rep.error && !!R, rep.error?.message ?? '')
  ok('top level is exactly: title, brand, dates, city, creators, items, invoices',
    Object.keys(R ?? {}).sort().join(',') === 'brand_name,completed_at,creators,invoices,items,requested_at,shoot_city,shoot_date,title', Object.keys(R ?? {}).sort().join(','))
  ok('creators: exactly name, handle, profile link', (R?.creators ?? []).every((c: any) => Object.keys(c).sort().join(',') === 'full_name,handle,profile_url'))
  ok('creators: the 2 locked creators who shot; not the rejected one', (R?.creators ?? []).length === 2 && !(R?.creators ?? []).some((c: any) => c.full_name === K3.full_name))
  ok('items: exactly id, creator name, label, kind, link/file, shared at, decision', (R?.items ?? []).every((i: any) => Object.keys(i).sort().join(',') === 'creator_name,decided_at,decision,file_name,kind,label,release_id,shared_at,url'))
  ok('invoices: the brand\'s own only (none issued here)', Array.isArray(R?.invoices) && R.invoices.length === 0)
  const keys = allKeys(R)
  ok('no forbidden key at any depth (rate, gross, net, %, payout, cost, margin, fee, note, ids, leg, terms…)', !keys.some((k) => FORBIDDEN_KEY.test(k)), keys.filter((k) => FORBIDDEN_KEY.test(k)).join(','))
  const raw = JSON.stringify(R)
  ok('no planted secret (roster note, cost line, creator brief, prospect)', !/SECRET-|secretprospect/.test(raw))
  ok('no creator id, leg deal id or roster id', ![K1.id, K2.id, K3.id, ...legDeals, ...staffRows.map((r) => r.id)].some((x) => raw.includes(x)))
  ok('no creator money value (day rate, gross, net) anywhere', !['1000000', ...netOf, '777100', '500000'].some((n) => raw.includes(n)))
  for (const [n, s] of outsiders) ok(`${n}: report refused`, refused(await (s as SupabaseClient).rpc('brand_experience_report', { p_experience_id: E })))
  ok('a plain member reads it too', !refused(await member.rpc('brand_experience_report', { p_experience_id: E })))
  ok('NULL id refused', refused(await ba.rpc('brand_experience_report', { p_experience_id: null })))

  group('the source: explicit columns, no money table, no SELECT *')
  // The sources are checked in the migration file, which is what db push applied.
  const mig = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/0544_experience_brand_portal.sql'), 'utf8')
  const body = (fn: string) => { const i = mig.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`); return mig.slice(i, mig.indexOf('$$;', i)) }
  const report = body('brand_experience_report')
  ok('the report joins no money table (deals, terms, finance, costs, payouts, counters, P&L)',
    !/\b(JOIN|FROM)\s+(deals|experience_creator_terms|experience_finance|experience_cost_lines|vendor_payouts|vendors|experience_leg_counters|experience_pnl_snapshots|creator_products|vendor_payout_details)\b/i.test(report))
  ok('the report reads no money column', !/price_paise|rate_paise|gross|net_paise|platform_pct|margin|cost/i.test(report.replace(/--.*$/gm, '')))
  const brandFns = ['brand_experience_require', 'brand_experiences', 'brand_experience', 'brand_experience_roster', 'brand_experience_deliverables', 'brand_experience_release_file', 'brand_experience_invoices', 'brand_experience_invoice_file', 'brand_experience_report', 'brand_experience_request', 'brand_experience_quote_answer', 'brand_experience_roster_decide', 'brand_experience_release_decide', 'brand_experience_signoff']
  ok('no brand function selects *', brandFns.every((f) => !/select\s+\*/i.test(body(f))))
  ok('every brand function goes through the one gate (or checks membership itself, for the list and the request)',
    brandFns.filter((f) => !['brand_experience_require', 'brand_experiences', 'brand_experience_request'].includes(f)).every((f) => body(f).includes('brand_experience_require(')))

  // ════════ Every brand read, scanned ════════
  group('every brand read: no forbidden key, no planted secret')
  const reads: [string, unknown][] = [
    ['brand_experiences', (await ba.rpc('brand_experiences')).data],
    ['brand_experience', (await ba.rpc('brand_experience', { p_experience_id: E })).data],
    ['brand_experience_roster', (await ba.rpc('brand_experience_roster', { p_experience_id: E })).data],
    ['brand_experience_deliverables', (await ba.rpc('brand_experience_deliverables', { p_experience_id: E })).data],
    ['brand_experience_invoices', (await ba.rpc('brand_experience_invoices', { p_experience_id: E })).data],
    ['brand_experience_report', R],
  ]
  for (const [n, d] of reads) {
    const ks = allKeys(d).filter((k) => FORBIDDEN_KEY.test(k))
    const s = JSON.stringify(d)
    ok(`${n}: clean`, !!d && ks.length === 0 && !/SECRET-|secretprospect/.test(s) && ![K1.id, K2.id, K3.id, ...legDeals].some((x) => s.includes(x)) && !netOf.some((x) => s.includes(x)), ks.join(','))
  }

  group('audit: every brand action is on record')
  const { data: ev } = await admin.from('ops_events').select('action').in('actor_auth_id', [BA.users.auth_id, MEMBER.auth_id]).gte('created_at', startedAt)
  const acts = new Set((ev ?? []).map((x: any) => x.action))
  for (const a of ['experience.request_submitted_by_brand', 'experience.quote_declined_by_brand', 'experience.quote_accepted_by_brand', 'experience.roster_decision_by_brand', 'experience.deliverable_decision_by_brand', 'experience.signoff_by_brand']) ok(`audited: ${a}`, acts.has(a))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const r of brandStatusRestore) await admin.from('brands').update({ brand_status: r.status }).eq('id', r.id)
  const { data: more } = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  for (const m of more ?? []) if (!exps.includes(m.id)) exps.push(m.id)
  for (const E of exps) {
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
    await admin.from('experience_leg_counters').delete().eq('experience_id', E)
  }
  if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('events').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
  for (const E of exps) {
    await admin.from('experience_roster_prospects').delete().eq('experience_id', E)
    await admin.from('experience_cost_lines').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experience_roster').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates)
  if (tempMembers.length) await admin.from('brand_members').delete().in('id', tempMembers)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) actorAuth.push(a)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  if (startedAt && actorAuth.length) await admin.from('ops_events').delete().in('actor_auth_id', actorAuth).gte('created_at', startedAt)
  const left = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  const leftRates = createdRates.length ? (await admin.from('creator_products').select('id').in('id', createdRates)).data ?? [] : []
  const leftMembers = tempMembers.length ? (await admin.from('brand_members').select('id').in('id', tempMembers)).data ?? [] : []
  const leftGrants = grants.length ? (await admin.from('staff_access').select('user_id').in('user_id', grants)).data ?? [] : []
  const leftDeals = legDeals.length ? (await admin.from('deals').select('id').in('id', legDeals)).data ?? [] : []
  ok('cleanup: nothing left (Experiences, legs, day rates, temporary members, staff grants)',
    (left.data ?? []).length === 0 && leftRates.length === 0 && leftMembers.length === 0 && leftGrants.length === 0 && leftDeals.length === 0,
    JSON.stringify({ e: left.data?.length, r: leftRates.length, m: leftMembers.length, g: leftGrants.length, d: leftDeals.length }))
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
