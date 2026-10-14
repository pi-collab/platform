/**
 * 0548, Phase 6.1 item 8: the roster's ops curation gate + brand approval,
 * against STAGING with real sessions. Proves:
 *   - Guapd's picks start INTERNAL; only shared creators reach any brand read
 *     (the roster, the "to review" count), and an unshared creator is "Not
 *     found" to the brand's decide;
 *   - pending is the default and never auto-approved; on hold is re-decidable;
 *     rejected is final (brand and staff); a decision can only exist for a
 *     shared creator (constraint, even with the service key);
 *   - bulk accept: accept only, all or nothing, stale-checked;
 *   - the lock waits for every SHARED creator's answer, never for the internal
 *     shortlist; only accepted creators lock; an offer can be drafted/sent only
 *     to a locked accepted creator;
 *   - the brand never sees a day rate, track, payout or margin; nothing is
 *     written for the creator (no notification, no deal) before the send.
 * Leaves staging exactly as it found it.
 *
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-roster-share.ts
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
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const exps: string[] = []
const grants: string[] = []
let startedAt = ''
let staffBefore = -1
const FORBIDDEN = /rate|gross|net_|_net|pct|payout|cost|margin|fee|track|allowance|terms|creator_id|deal_id|leg_|note/i
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out) }
  return out
}
async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function run() {
  startedAt = new Date().toISOString()
  staffBefore = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status)').limit(120)
  // Brand actors must be ONLY brand members: a founder can be both a brand member and Guapd staff.
  const staffIds = new Set(((await admin.from('staff_access').select('user_id')).data ?? []).map((a: any) => a.user_id))
  const BA = ((bm ?? []) as any[]).find((m) => m.users?.auth_id && m.brands?.is_guapd === false && m.brands.brand_status === 'approved' && !staffIds.has(m.user_id))
  const BB = ((bm ?? []) as any[]).find((m) => m.users?.auth_id && m.brands?.is_guapd === false && m.brand_id !== BA?.brand_id && !staffIds.has(m.user_id))
  const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day')
  const hasRate = new Set((rated ?? []).map((x: any) => x.creator_id))
  const { data: cr } = await admin.from('creators').select('id, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(80)
  const pool = ((cr ?? []) as any[]).filter((c) => !hasRate.has(c.id))
  const [K1, K2, K3, K4] = pool
  const { data: access } = await admin.from('staff_access').select('user_id')
  const { data: members } = await admin.from('brand_members').select('user_id')
  const busy = new Set([...(access ?? []).map((a) => a.user_id), ...(members ?? []).map((m) => m.user_id)])
  // Test staff actors are never creators: a creator login can save its own bank details, list its own deals, etc.
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) } // staff actors are never creators
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!BA || !BB || !K1 || !K2 || !K3 || !K4 || !OP || !FIN) throw new Error('missing actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), brand = await sessionFor(BA.users.auth_id), other = await sessionFor(BB.users.auth_id)
  const anon = createClient(URL, ANON)

  // 2 creators × 1 UGC video sold; Guapd shortlists 4.
  const c = await op.rpc('experience_console_create', { p_brand_id: BA.brand_id, p_title: '[share-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  const add = await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1.id, K2.id, K3.id, K4.id], p_added_by: 'guapd', p_channel: null })
  ok('Guapd shortlists 4 creators', add.data === 4, add.error?.message)
  const rows = async () => ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  const rid = async (k: any) => (await rows()).find((r) => r.creator_id === k.id).id as string
  const R1 = await rid(K1), R2 = await rid(K2), R3 = await rid(K3), R4 = await rid(K4)

  group('the curation gate: the shortlist is internal until shared')
  ok('every pick starts pending and internal (never auto-approved)', (await rows()).every((r) => r.brand_decision === 'pending' && r.shared_with_brand_at === null))
  const bRoster = async (s: SupabaseClient = brand) => (((await s.rpc('brand_experience_roster', { p_experience_id: E })).data as any)?.creators ?? []) as any[]
  ok('the brand sees nobody yet', (await bRoster()).length === 0)
  const listCount = async () => ((((await brand.rpc('brand_experiences')).data as any)?.experiences ?? []) as any[]).find((x) => x.id === E)?.roster_to_review
  ok('…and its list counts nobody to review (the shortlist size never leaks)', Number(await listCount()) === 0)
  ok('the brand cannot decide on an unshared creator: Not found', said(await brand.rpc('brand_experience_roster_decide', { p_roster_id: R1, p_decision: 'accepted', p_expected: 'pending' }), /Not found/))
  ok('…nor bulk-accept one', said(await brand.rpc('brand_experience_roster_accept_many', { p_experience_id: E, p_items: [{ roster_id: R1, expected: 'pending' }] }), /Not found/))
  ok('a decision on an unshared creator is impossible even with the service key', refused(await admin.from('experience_roster').update({ brand_decision: 'accepted' }).eq('id', R4)))
  for (const [n, s] of [['the brand', brand], ['another brand', other], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot share`, refused(await (s as SupabaseClient).rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: [R1] })))
  ok('sharing nothing is refused', said(await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: [] }), /Pick/))
  ok('sharing a row from another roster is refused', said(await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: ['00000000-0000-0000-0000-000000000000'] }), /Only creators/))
  const sh = await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: [R1, R2, R3] })
  ok('Guapd shares 3 of the 4', sh.data === 3, sh.error?.message)
  ok('sharing again shares nothing new', (await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: [R1] })).data === 0)
  const seen = await bRoster()
  ok('the brand sees exactly the 3 shared creators', seen.length === 3 && !seen.some((r) => r.roster_id === R4))
  ok('…never the internal one, by name either', !JSON.stringify(seen).includes(K4.full_name))
  ok('…and counts 3 to review', Number(await listCount()) === 3)
  ok('another brand sees none of it', refused(await other.rpc('brand_experience_roster', { p_experience_id: E })))
  const keys = allKeys(seen)
  ok('per creator: name, handle, profile, deliverables, decision; never rate, track, payout or margin', !keys.some((k) => FORBIDDEN.test(k)), keys.filter((k) => FORBIDDEN.test(k)).join(','))

  group('decisions: pending, on hold (re-decidable), rejected (final)')
  const bd = (r: string, d: string | null, e: string | null) => brand.rpc('brand_experience_roster_decide', { p_roster_id: r, p_decision: d, p_expected: e })
  ok('a NULL decision is refused', refused(await bd(R1, null, 'pending')))
  ok('the brand puts K1 on hold', !refused(await bd(R1, 'on_hold', 'pending')))
  ok('the brand rejects K3', !refused(await bd(R3, 'rejected', 'pending')))
  ok('rejected is final for the brand', said(await bd(R3, 'accepted', 'rejected'), /final/))
  ok('…and for Guapd', said(await op.rpc('experience_console_roster_decide', { p_roster_id: R3, p_decision: 'accepted', p_channel: 'email' }), /final/))
  ok('…and back to "awaiting" is refused too', said(await op.rpc('experience_console_roster_decide', { p_roster_id: R3, p_decision: 'pending', p_channel: null }), /final/))

  group('the lock waits for every SHARED creator, never the shortlist')
  ok('K2 still awaiting the brand: the lock is refused', said(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), /shared with them/))
  ok('bulk accept including a rejected creator: refused, nothing written', said(await brand.rpc('brand_experience_roster_accept_many', { p_experience_id: E, p_items: [{ roster_id: R1, expected: 'on_hold' }, { roster_id: R3, expected: 'rejected' }] }), /final/)
    && (await rows()).find((r) => r.id === R1).brand_decision === 'on_hold')
  ok('bulk accept with a stale answer: refused', said(await brand.rpc('brand_experience_roster_accept_many', { p_experience_id: E, p_items: [{ roster_id: R1, expected: 'pending' }, { roster_id: R2, expected: 'pending' }] }), /changed/))
  for (const [n, s] of [['another brand', other], ['staff', op], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot bulk-accept`, refused(await (s as SupabaseClient).rpc('brand_experience_roster_accept_many', { p_experience_id: E, p_items: [{ roster_id: R2, expected: 'pending' }] })))
  const bulk = await brand.rpc('brand_experience_roster_accept_many', { p_experience_id: E, p_items: [{ roster_id: R1, expected: 'on_hold' }, { roster_id: R2, expected: 'pending' }] })
  ok('the brand accepts K1 (from hold) and K2 together', bulk.data === 2, bulk.error?.message)
  const after = await rows()
  ok('accepted on Guapd; K3 still rejected; K4 still internal pending', after.find((r) => r.id === R1).brand_decision === 'accepted' && after.find((r) => r.id === R2).decision_channel === 'portal'
    && after.find((r) => r.id === R3).brand_decision === 'rejected' && after.find((r) => r.id === R4).brand_decision === 'pending' && after.find((r) => r.id === R4).shared_with_brand_at === null)
  const rec = (await op.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('the roster check counts the 2 accepted (not the internal or rejected creators)', rec?.videos_planned === 2 && rec?.ok === true, JSON.stringify({ p: rec?.videos_planned, ok: rec?.ok }))
  const lk = await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  ok('the lock goes through with K4 still internal', !lk.error && lk.data === 2, lk.error?.message)
  ok('only the 2 accepted are locked', (await rows()).filter((r) => r.locked).map((r) => r.id).sort().join() === [R1, R2].sort().join())

  group('an offer only to an accepted creator; nothing reaches a creator before it')
  ok('no deal exists for any creator yet', ((await admin.from('deals').select('id').eq('experience_id', E)).data ?? []).length === 0)
  ok('no notification went to any shortlisted creator', ((await admin.from('notifications').select('id').gte('created_at', startedAt)
    .in('user_id', ((await admin.from('creators').select('user_id').in('id', [K1.id, K2.id, K3.id, K4.id])).data ?? []).map((x: any) => x.user_id).filter(Boolean))).data ?? []).length === 0)
  const legs = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  ok('creator deals list only the accepted, locked creators', legs.length === 2 && legs.every((l) => [K1.id, K2.id].includes(l.creator_id)))
  ok('a deal cannot be prepared for the rejected creator', said(await op.rpc('experience_console_leg_draft', { p_roster_id: R3, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 500000 }), /locked, accepted/))
  ok('…nor for the internal (never shared) creator', said(await op.rpc('experience_console_leg_draft', { p_roster_id: R4, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 500000 }), /locked, accepted/))
  ok('…nor sent', said(await op.rpc('experience_console_leg_send', { p_roster_id: R3, p_expected_gross_paise: 500000, p_expected_platform_pct: 15, p_expected_net_paise: 425000 }), /locked, accepted/))

  group('on hold blocks the send too')
  // K4 shared after the lock, put on hold: it never locks, so no deal.
  await op.rpc('experience_console_roster_share', { p_experience_id: E, p_roster_ids: [R4] })
  ok('K4 shared after the lock, the brand holds it', !refused(await bd(R4, 'on_hold', 'pending')))
  ok('a lock with only an on-hold creator left has nothing to lock', said(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), /No accepted/))
  ok('a deal for an on-hold creator is refused', said(await op.rpc('experience_console_leg_draft', { p_roster_id: R4, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 500000 }), /locked, accepted/))
  group('0549: ops can reverse a lock (a creator backed out)')
  const legDeals: string[] = []
  // K1 gets a deal (rate entered on the deal), which the creator accepted.
  const dr = await op.rpc('experience_console_leg_draft', { p_roster_id: R1, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 500000 })
  ok('K1 prepared', !dr.error, dr.error?.message)
  const sd = await op.rpc('experience_console_leg_send', { p_roster_id: R1, p_expected_gross_paise: 500000, p_expected_platform_pct: (legs.find((l) => l.creator_id === K1.id)?.track === 'growth' ? 30 : 15),
    p_expected_net_paise: 500000 - Math.round(500000 * (legs.find((l) => l.creator_id === K1.id)?.track === 'growth' ? 30 : 15) / 100) })
  ok('K1 sent', !sd.error, sd.error?.message)
  const k1Deal = sd.data as string; if (k1Deal) legDeals.push(k1Deal)
  await admin.from('deals').update({ status: 'agreed' }).eq('id', k1Deal)
  for (const [n, sx] of [['the brand', brand], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot release`, refused(await (sx as SupabaseClient).rpc('experience_console_roster_release', { p_roster_id: R1, p_reason: 'backed out' })))
  ok('a reason is required (3+ characters)', said(await op.rpc('experience_console_roster_release', { p_roster_id: R1, p_reason: 'x' }), /Say why/))
  ok('NULL reason is refused', said(await op.rpc('experience_console_roster_release', { p_roster_id: R1, p_reason: null }), /Say why/))
  ok('an unlocked creator is not "released" (remove them instead)', said(await op.rpc('experience_console_roster_release', { p_roster_id: R4, p_reason: 'backed out' }), /not locked/))
  const rel = await op.rpc('experience_console_roster_release', { p_roster_id: R1, p_reason: 'Backed out the day before' })
  ok('K1, accepted then backed out, is released', !rel.error && (rel.data as any)?.deal_cancelled === true, rel.error?.message)
  const k1 = (await admin.from('experience_roster').select('locked, leg_deal_id, brand_decision').eq('id', R1).single()).data as any
  ok('…off the lock, detached from the cancelled deal, still accepted', k1.locked === false && k1.leg_deal_id === null && k1.brand_decision === 'accepted')
  ok('…the accepted deal is cancelled, not deleted (kept on record)', (await admin.from('deals').select('status').eq('id', k1Deal).single()).data?.status === 'cancelled')
  ok('…audited with the reason', ((await admin.from('ops_events').select('detail').eq('target_id', R1).eq('action', 'experience.roster_released')).data ?? []).some((e: any) => e.detail?.reason === 'Backed out the day before'))
  ok('…and no longer in creator deals', !(((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]).some((l) => l.roster_id === R1))
  ok('K2 (locked, no deal yet) can be released too', !refused(await op.rpc('experience_console_roster_release', { p_roster_id: R2, p_reason: 'Changed plans' })))
  ok('a released creator can then be removed', !refused(await op.rpc('experience_console_roster_remove', { p_roster_id: R2 })))
  const rec2 = (await op.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('the roster now shows the gap: 1 of 2 videos, so the lock waits for a replacement', rec2?.videos_planned === 1 && rec2?.ok === false
    && said(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), /does not add up/))
  for (const d of legDeals) { await admin.from('events').delete().eq('deal_id', d); await admin.from('experience_leg_counters').delete().eq('deal_id', d) }
  globalLegDeals.push(...legDeals)
}

const globalLegDeals: string[] = []

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (globalLegDeals.length) {
    await admin.from('experience_roster').update({ leg_deal_id: null }).in('leg_deal_id', globalLegDeals)
    await admin.from('notifications').delete().in('deal_id', globalLegDeals)
    await admin.from('events').delete().in('deal_id', globalLegDeals)
    await admin.from('deals').delete().in('id', globalLegDeals)
  }
  for (const E of exps) {
    await admin.from('experience_roster').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  await admin.from('notifications').delete().like('body', '%[share-test]%').gte('created_at', startedAt)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = ((await admin.from('experiences').select('id').like('title', '[share-test]%')).data ?? []).length
  const staffAfter = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  ok('cleanup: nothing left behind', left === 0 && staffAfter === staffBefore, `exp=${left} staff ${staffBefore}→${staffAfter}`)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
