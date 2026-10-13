/**
 * 0561 (collab C2): approved videos go to their creator, against STAGING with
 * real sessions. Collab = an ad-rights video the creator posts as a collab and
 * links; share = any other approved video, no link. The brand adds its
 * affiliate link and marks the ad complete; staff record either on someone's
 * behalf with a channel. The creator's main invoice waits for every ad-rights
 * video to be posted. Two temporary staff grants; everything made is deleted.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-collab.ts
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
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []
const uploaded: string[] = []
const invoices: string[] = []
const newVendorCreators: string[] = []
let startedAt = ''

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
    p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: 1, p_ad_rights_months: 3,
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
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: videos, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null, p_affiliate_pct: 10 })
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
    await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: perCreator, p_affiliate_count: 1, p_ad_rights_count: 1, p_boost_count: null })
    const rate = creators.find((x) => x.id === l.creator_id)!.rate
    const t = creatorLegTerms({ dayRatePaise: rate, days: 1, track: l.track })
    const s = await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    deal[l.creator_id] = s.data as string; roster_[l.creator_id] = l.roster_id; legDeals.push(s.data as string)
  }
  return { E, deal, roster: roster_ }
}



async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members[0]
  const B2 = members.find((m) => m.brand_id !== B?.brand_id)
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  { const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day'); const r = new Set((rated ?? []).map((x: any) => x.creator_id)); pool.splice(0, pool.length, ...pool.filter((c) => !r.has(c.id))) }
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, B2?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) }
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  const FIN = (users ?? []).filter((u: any) => !busy.has(u.id))[2] as any
  if (!B || !B2 || !G || !D || !OP || !FIN || !NONE) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), brand2 = await sessionFor(B2.users.auth_id)
  const cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const { data: hadVendors } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id])
  newVendorCreators.push(...[G.id, D.id].filter((id) => !(hadVendors ?? []).some((v: any) => v.creator_id === id)))
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')

  // 2 creators × 2 UGC videos, 1 with ad rights and the affiliate link each (Guapd provides).
  const one = await buildExperience(op, fin, B.brand_id, '[collab-test] Kiro', [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }], [{ type: 'UGC video', count: 2 }])
  const E = one.E, legOf = (w: { id: string }) => one.deal[w.id], rosterOf = (w: { id: string }) => one.roster[w.id]
  await admin.from('deals').update({ status: 'agreed' }).in('id', [legOf(G), legOf(D)])
  const sch = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  if (sch.error) throw new Error('schedule: ' + sch.error.message)
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  for (const w of [G, D]) await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(w), p_outcome: 'done', p_reason: null })

  // Guapd attaches, approves and shares all four videos.
  const dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  const items = (w: { id: string }) => ((dv.legs as any[]).find((l) => l.creator_id === w.id).items as any[]).filter((i) => i.type === 'UGC video')
  const all = [...items(G), ...items(D)]
  for (const i of all) {
    const a = await op.rpc('experience_console_item_attach', { p_item_id: i.id, p_url: `https://drive.example.com/${i.id}`, p_storage_path: null, p_file_name: null })
    if (a.error) throw new Error('attach: ' + a.error.message)
    await op.rpc('experience_console_item_review', { p_item_id: i.id, p_decision: 'approve', p_note: null })
  }
  const rel = await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: all.map((i) => i.id) })
  if (rel.error) throw new Error('release: ' + rel.error.message)
  const releaseOf = async (itemId: string) => (await admin.from('experience_deliverable_releases').select('id').eq('item_id', itemId).eq('status', 'shared').single()).data!.id as string
  const [g1, g2] = [await releaseOf(items(G)[0].id), await releaseOf(items(G)[1].id)]
  const d1 = await releaseOf(items(D)[0].id)

  group('only a video the brand approved goes to its creator')
  ok('before the brand approves: refused', said(await op.rpc('experience_console_collab_send', { p_release_id: g1, p_kind: 'collab' }), /brand approved/))
  for (const r of [g1, g2, d1]) {
    const x = await brand.rpc('brand_experience_release_decide', { p_release_id: r, p_decision: 'approved', p_note: null, p_expected: 'new' })
    if (x.error) throw new Error('brand approve: ' + x.error.message)
  }
  for (const [n, s] of [['the brand', brand], ['the creator', cG], ['a signed-in user without access', none], ['anonymous', anon]] as const) {
    ok(`${n}: cannot send a video to post`, refused(await (s as SupabaseClient).rpc('experience_console_collab_send', { p_release_id: g1, p_kind: 'collab' })))
  }
  ok('an unknown kind or NULL is refused', refused(await op.rpc('experience_console_collab_send', { p_release_id: g1, p_kind: 'post' })) && refused(await op.rpc('experience_console_collab_send', { p_release_id: g1, p_kind: null })))
  const pg1 = await op.rpc('experience_console_collab_send', { p_release_id: g1, p_kind: 'collab' })
  ok("G's first video goes to G as a collab", !pg1.error && !!pg1.data, pg1.error?.message ?? '')
  const P1 = pg1.data as string
  ok('the same video cannot be sent twice', said(await op.rpc('experience_console_collab_send', { p_release_id: g1, p_kind: 'share' }), /already with the creator/))
  ok("a second collab past G's 1 ad-rights video is refused", said(await op.rpc('experience_console_collab_send', { p_release_id: g2, p_kind: 'collab' }), /ad-rights video/))
  const pg2 = await op.rpc('experience_console_collab_send', { p_release_id: g2, p_kind: 'share' })
  ok("G's other video is shared (post it if you like)", !pg2.error, pg2.error?.message ?? '')
  const P2 = pg2.data as string
  const pd1 = await op.rpc('experience_console_collab_send', { p_release_id: d1, p_kind: 'collab' })
  const PD = pd1.data as string
  ok('audited and on the deal timeline', ((await admin.from('ops_events').select('id').eq('action', 'experience.collab_sent').eq('target_id', P1)).data ?? []).length === 1
    && ((await admin.from('events').select('id').eq('deal_id', legOf(G)).eq('event_type', 'experience.collab_sent')).data ?? []).length === 2)

  group("the creator's main invoice waits for the collab post")
  let ctx = (await cG.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  ok('G cannot invoice yet: 1 collab post to go', ctx.can_invoice === false && ctx.collab_waiting === 1, JSON.stringify({ i: ctx.can_invoice, w: ctx.collab_waiting }))
  const mine = (await cG.rpc('creator_collab_posts', { p_deal_id: legOf(G) })).data as any[]
  ok('G sees both: the collab to post and the shared one', mine?.length === 2 && mine.some((p) => p.id === P1 && p.kind === 'collab' && p.can_post) && mine.some((p) => p.id === P2 && p.kind === 'share' && !p.can_post))
  ok("D cannot read G's posts or file", refused(await cD.rpc('creator_collab_posts', { p_deal_id: legOf(G) })) && refused(await cD.rpc('creator_collab_file', { p_post_id: P1 })))
  ok('G gets their own file', ((await cG.rpc('creator_collab_file', { p_post_id: P1 })).data as any)?.external_url === `https://drive.example.com/${items(G)[0].id}`)
  ok('the brand cannot read a creator file', refused(await brand.rpc('creator_collab_file', { p_post_id: P1 })))

  group('the creator posts and gives the link')
  const IG = 'https://www.instagram.com/reel/C0llabTest1/'
  ok("D cannot post G's link", refused(await cD.rpc('creator_collab_post_link', { p_post_id: P1, p_url: IG })))
  ok('a link that is not an Instagram post is refused', said(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: 'https://example.com/x' }), /Instagram post link/)
    && said(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: 'http://instagram.com/p/abc' }), /Instagram post link/)
    && said(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: null }), /Instagram post link/))
  ok('a shared video takes no link', said(await cG.rpc('creator_collab_post_link', { p_post_id: P2, p_url: IG }), /No link is needed/))
  ok('the brand cannot add the affiliate link before the post', said(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'affiliate', p_url: 'https://shop.example.com/r/abc' }), /not posted/))
  ok('G posts it', !refused(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: IG })))
  ctx = (await cG.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  ok('G can now raise their invoice', ctx.can_invoice === true && ctx.collab_waiting === 0, JSON.stringify({ i: ctx.can_invoice, w: ctx.collab_waiting }))
  ok('G can correct the link before the ad completes', !refused(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: IG + '?igsh=x1' })))
  ok('staff cannot record a post link as "On Guapd"', said(await op.rpc('experience_console_collab_post_link', { p_post_id: PD, p_url: IG.replace('1', '2'), p_channel: 'portal' }), /Say how/))
  ok("staff record D's link (sent on WhatsApp)", !refused(await op.rpc('experience_console_collab_post_link', { p_post_id: PD, p_url: 'https://instagram.com/p/D0llab2', p_channel: 'whatsapp' })))

  group('the brand: its posts, the affiliate link, ad complete')
  const bp = (await brand.rpc('brand_experience_collab_posts', { p_experience_id: E })).data as any[]
  ok('the brand sees its 2 collab posts, never the shared video', bp?.length === 2 && !bp.some((p) => p.id === P2))
  const KEYS = ['ad_complete_at', 'ad_complete_on_guapd', 'affiliate_at', 'affiliate_on_guapd', 'affiliate_url', 'can_act', 'creator_name', 'handle', 'id', 'label', 'post_url', 'posted_at', 'sent_at', 'status'].join(',')
  ok('each post carries no creator or deal id', bp.every((p) => Object.keys(p).sort().join(',') === KEYS), Object.keys(bp[0] ?? {}).sort().join(','))
  ok('another brand, a creator, anonymous: cannot read or act', refused(await brand2.rpc('brand_experience_collab_posts', { p_experience_id: E })) && refused(await cG.rpc('brand_experience_collab_posts', { p_experience_id: E }))
    && refused(await anon.rpc('brand_experience_collab_posts', { p_experience_id: E })) && refused(await brand2.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'ad_complete', p_url: null })))
  ok('a non-https affiliate link is refused', said(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'affiliate', p_url: 'javascript:alert(1)' }), /affiliate link/))
  ok('an unknown action is refused', refused(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'boost', p_url: null })))
  ok('the brand adds its affiliate link', !refused(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'affiliate', p_url: 'https://shop.example.com/r/g1' })))
  ok('G sees the affiliate link', ((await cG.rpc('creator_collab_posts', { p_deal_id: legOf(G) })).data as any[]).find((p) => p.id === P1)?.affiliate_url === 'https://shop.example.com/r/g1')
  ok('staff cannot record ad complete as "On Guapd"', said(await op.rpc('experience_console_collab_act', { p_post_id: PD, p_action: 'ad_complete', p_url: null, p_channel: 'portal' }), /Say how/))
  ok('the brand marks the ad complete', !refused(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'ad_complete', p_url: null })))
  ok('…twice is refused', said(await brand.rpc('brand_experience_collab_act', { p_post_id: P1, p_action: 'ad_complete', p_url: null }), /already marked complete/))
  ok('…and the post link is now final', said(await cG.rpc('creator_collab_post_link', { p_post_id: P1, p_url: IG }), /final/))
  ok("staff record D's ad complete for the brand (email)", !refused(await op.rpc('experience_console_collab_act', { p_post_id: PD, p_action: 'ad_complete', p_url: null, p_channel: 'email' })))
  const row = (await admin.from('experience_collab_posts').select('status, affiliate_channel, ad_complete_channel, post_channel').eq('id', P1).single()).data as any
  ok('recorded On Guapd for the brand and the creator', row.status === 'ad_complete' && row.affiliate_channel === 'portal' && row.ad_complete_channel === 'portal' && row.post_channel === 'portal')
  const acts = new Set(((await admin.from('ops_events').select('action').in('target_id', [P1, PD])).data ?? []).map((a: any) => a.action))
  ok('audited: creator post, staff post, brand affiliate, brand ad complete, staff ad complete',
    ['experience.collab_posted_by_creator', 'experience.collab_post_recorded', 'experience.collab_affiliate_by_brand', 'experience.collab_ad_complete_by_brand', 'experience.collab_ad_complete_recorded'].every((a) => acts.has(a)), Array.from(acts).join(','))

  group('taking a video back')
  ok('a posted video cannot be taken back', said(await op.rpc('experience_console_collab_cancel', { p_post_id: P1, p_reason: 'Brand changed its mind' }), /not yet posted/))
  ok('a reason is required (3+ characters)', said(await op.rpc('experience_console_collab_cancel', { p_post_id: P2, p_reason: 'no' }), /Say why/))
  ok('the shared one is taken back', !refused(await op.rpc('experience_console_collab_cancel', { p_post_id: P2, p_reason: 'Wrong cut shared' })))
  ok('…and G no longer sees it or its file', !((await cG.rpc('creator_collab_posts', { p_deal_id: legOf(G) })).data as any[]).some((p) => p.id === P2) && refused(await cG.rpc('creator_collab_file', { p_post_id: P2 })))
  ok('…so it can be sent again', !refused(await op.rpc('experience_console_collab_send', { p_release_id: g2, p_kind: 'share' })))
  ok('nobody reads the table directly', ((await cG.from('experience_collab_posts').select('id')).data ?? []).length === 0 && ((await brand.from('experience_collab_posts').select('id')).data ?? []).length === 0)
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (uploaded.length) await admin.storage.from('finance-docs').remove(uploaded)
  for (const E of exps) {
    await admin.from('experience_collab_posts').delete().eq('experience_id', E)
    await admin.from('vendor_payouts').delete().eq('experience_id', E)
    await admin.from('deal_deliverable_items').delete().not('extra_id', 'is', null).in('deal_id', legDeals.length ? legDeals : ['00000000-0000-0000-0000-000000000000'])
    await admin.from('experience_creator_invoices').delete().eq('experience_id', E)
    await admin.from('service_invoices').delete().eq('experience_id', E)
    await admin.from('experience_leg_extras').delete().eq('experience_id', E)
    await admin.from('experience_addons').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
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
  const left = await admin.from('experiences').select('id').like('title', '[collab-test]%')
  const files = uploaded.length ? (await admin.storage.from('finance-docs').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
