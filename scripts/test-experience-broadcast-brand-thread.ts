/**
 * 0550, Phase 6.1 items 10 + 11, against STAGING with real sessions.
 *   10. Guapd's broadcast: one message lands in EACH sent creator's own Guapd
 *       thread; a creator reads only their own; the brand reads none; closed
 *       legs and (for "accepted") unanswered ones are left out; NULL scope and
 *       empty text refused; audited by count and length, never text.
 *   11. The brand <-> Guapd thread: brand members of THIS Experience's brand and
 *       Guapd staff only; another brand, a creator, logged-out and the service
 *       role get nothing; the tables are unreadable directly; the brand sees
 *       Guapd's messages as "Guapd" (never a staff name); unread per side.
 * Leaves staging exactly as it found it.
 *
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-broadcast-brand-thread.ts
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
const exps: string[] = []
const grants: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
let startedAt = ''
let staffBefore = -1
const MARK = 'BROADCAST-7Q2', BMARK = 'BRAND-THREAD-4K9', GMARK = 'GUAPD-REPLY-3M1'

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
  const staffIds = new Set(((await admin.from('staff_access').select('user_id')).data ?? []).map((a: any) => a.user_id))
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status)').limit(120)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && m.brands?.is_guapd === false && !staffIds.has(m.user_id))
  const BA = members.find((m) => m.brands.brand_status === 'approved'), BB = members.find((m) => m.brand_id !== BA?.brand_id)
  const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day')
  const hasRate = new Set((rated ?? []).map((x: any) => x.creator_id))
  const { data: cr } = await admin.from('creators').select('id, user_id, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(80)
  const pool = ((cr ?? []) as any[]).filter((c) => !hasRate.has(c.id) && c.users?.auth_id)
  const [G, D] = pool
  const { data: allMembers } = await admin.from('brand_members').select('user_id')
  const busy = new Set([...staffIds, ...(allMembers ?? []).map((m) => m.user_id)])
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) }
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!BA || !BB || !G || !D || !OP) throw new Error('missing actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id)
  const op = await sessionFor(OP.auth_id), brand = await sessionFor(BA.users.auth_id), other = await sessionFor(BB.users.auth_id)
  const cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)

  const c = await op.rpc('experience_console_create', { p_brand_id: BA.brand_id, p_title: '[bcast-test] Kiro', p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string; exps.push(E)

  group('11. the brand ↔ Guapd thread')
  for (const [n, s] of [['another brand', other], ['a creator', cG], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: cannot read or write the brand thread`, refused(await (s as SupabaseClient).rpc('brand_experience_messages', { p_experience_id: E })) && refused(await (s as SupabaseClient).rpc('brand_experience_message_send', { p_experience_id: E, p_body: 'x' })))
  }
  ok('staff cannot write as the brand (not a member)', refused(await op.rpc('brand_experience_message_send', { p_experience_id: E, p_body: 'x' })))
  ok('an empty message is refused', said(await brand.rpc('brand_experience_message_send', { p_experience_id: E, p_body: '  ' }), /Write a message/))
  ok('the brand writes to Guapd', !refused(await brand.rpc('brand_experience_message_send', { p_experience_id: E, p_body: BMARK })))
  ok('staff see 1 unread (the brand\'s message)', Number((await op.rpc('experience_console_unread_messages')).data) >= 1)
  const st = (await op.rpc('experience_console_brand_messages', { p_experience_id: E })).data as any
  ok('staff read it', st?.messages?.some((m: any) => m.body === BMARK && m.from === 'brand'))
  ok('staff reply as Guapd', !refused(await op.rpc('experience_console_brand_message_send', { p_experience_id: E, p_body: GMARK })))
  for (const [n, s] of [['the brand', brand], ['a creator', cG], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot write as Guapd`, refused(await (s as SupabaseClient).rpc('experience_console_brand_message_send', { p_experience_id: E, p_body: 'x' })))
  ok('the brand has 1 unread (Guapd\'s reply)', Number((await brand.rpc('brand_experience_messages_unread', { p_experience_id: E })).data) === 1)
  const bt = ((await brand.rpc('brand_experience_messages', { p_experience_id: E })).data as any)?.messages ?? []
  ok('the brand reads both; Guapd\'s message is signed "Guapd", never a staff name', bt.length === 2 && bt.find((m: any) => m.body === GMARK)?.sender_name === 'Guapd')
  ok('…reading marked it read', Number((await brand.rpc('brand_experience_messages_unread', { p_experience_id: E })).data) === 0)
  ok('the console inbox lists the brand thread', ((await op.rpc('experience_console_brand_threads')).data as any[]).some((t) => t.experience_id === E))
  ok('the brand cannot list brand threads', refused(await brand.rpc('experience_console_brand_threads')))
  for (const [n, s] of [['the brand', brand], ['a creator', cG], ['staff', op]] as const) {
    const r1 = await (s as SupabaseClient).from('experience_brand_messages').select('id').eq('experience_id', E)
    ok(`${n}: the thread table is unreadable directly`, !!r1.error || (r1.data ?? []).length === 0)
  }
  ok('a direct insert into the thread is refused', refused(await brand.from('experience_brand_messages').insert({ experience_id: E, sender: 'guapd', body: 'forged' })))
  ok('audit rows carry lengths, never the text', !JSON.stringify(((await admin.from('ops_events').select('detail').eq('target_id', E).gte('created_at', startedAt)).data ?? [])).includes(BMARK))

  group('10. Guapd broadcasts to the creators (each in their own thread)')
  const q = await op.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 2, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await op.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id], p_added_by: 'guapd', p_channel: null })
  for (const r of ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  ok('no offer sent yet: a broadcast has no one to go to', said(await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: 'hi', p_scope: 'all' }), /No creator/))
  for (const l of ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]) {
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 600000 })
    const t = creatorLegTerms({ dayRatePaise: 600000, days: 1, track: l.track })
    const s = await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    legDeals.push(s.data as string)
  }
  const dealOf = async (k: any) => ((await admin.from('deals').select('id').eq('experience_id', E).eq('creator_id', k.id).single()).data as any).id as string
  const gLeg = await dealOf(G), dLeg = await dealOf(D)
  await admin.from('deals').update({ status: 'agreed' }).eq('id', gLeg)   // G accepted; D has not answered
  for (const [n, s] of [['the brand', brand], ['a creator', cG], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot broadcast`, refused(await (s as SupabaseClient).rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: 'x', p_scope: 'all' })))
  ok('NULL scope is refused', said(await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: 'x', p_scope: null }), /who it goes to/))
  ok('empty text is refused', said(await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: ' ', p_scope: 'all' }), /Write a message/))
  const a1 = await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: `${MARK} accepted-only`, p_scope: 'accepted' })
  ok('"accepted only" reaches G and not D', !a1.error && JSON.stringify((a1.data as any).deal_ids) === JSON.stringify([gLeg]))
  const a2 = await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: `${MARK} everyone`, p_scope: 'all' })
  ok('"everyone" reaches both open offers', !a2.error && ((a2.data as any).deal_ids as string[]).sort().join() === [gLeg, dLeg].sort().join())
  const readAs = async (s: SupabaseClient, d: string) => ((await s.from('messages').select('body').eq('deal_id', d)).data ?? []).map((m: any) => m.body)
  ok('G reads both broadcasts in their own thread', (await readAs(cG, gLeg)).filter((b: string) => b.startsWith(MARK)).length === 2)
  ok('D reads only the "everyone" one', JSON.stringify((await readAs(cD, dLeg)).filter((b: string) => b.startsWith(MARK))) === JSON.stringify([`${MARK} everyone`]))
  ok('G cannot see D\'s thread (nor who else got it)', (await readAs(cG, dLeg)).length === 0)
  ok('the brand reads none of it', (await readAs(brand, gLeg)).length === 0 && (await readAs(brand, dLeg)).length === 0)
  await admin.from('deals').update({ status: 'declined' }).eq('id', dLeg)
  const a3 = await op.rpc('experience_console_leg_broadcast', { p_experience_id: E, p_body: `${MARK} after decline`, p_scope: 'all' })
  ok('a declined leg is left out', !a3.error && JSON.stringify((a3.data as any).deal_ids) === JSON.stringify([gLeg]))
  ok('…the broadcast is audited by count and length, never the text',
    !JSON.stringify(((await admin.from('ops_events').select('detail, action').eq('target_id', E).eq('action', 'experience.leg_broadcast')).data ?? [])).includes(MARK)
    && ((await admin.from('ops_events').select('id').eq('target_id', E).eq('action', 'experience.leg_broadcast')).data ?? []).length === 3)
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (legDeals.length) {
    await admin.from('experience_roster').update({ leg_deal_id: null }).in('leg_deal_id', legDeals)
    await admin.from('message_reads').delete().in('deal_id', legDeals)
    await admin.from('messages').delete().in('deal_id', legDeals)
    await admin.from('notifications').delete().in('deal_id', legDeals)
    await admin.from('events').delete().in('deal_id', legDeals)
    await admin.from('deals').delete().in('id', legDeals)
  }
  for (const E of exps) {
    await admin.from('experience_brand_message_reads').delete().eq('experience_id', E)
    await admin.from('experience_brand_messages').delete().eq('experience_id', E)
    await admin.from('experience_roster').delete().eq('experience_id', E)
    await admin.from('experience_quotes').delete().eq('experience_id', E)
    await admin.from('experiences').delete().eq('id', E)
  }
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = ((await admin.from('experiences').select('id').like('title', '[bcast-test]%')).data ?? []).length
  const leftMsgs = ((await admin.from('experience_brand_messages').select('id').in('experience_id', exps.length ? exps : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length
  const staffAfter = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  ok('cleanup: nothing left behind', left === 0 && leftMsgs === 0 && staffAfter === staffBefore, `exp=${left} msgs=${leftMsgs} staff ${staffBefore}→${staffAfter}`)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
