/**
 * 0538: the shoot, deliverables, and the brand seeing ONLY what Guapd
 * releases, against STAGING with real sessions. Two temporary staff grants
 * (operational-only, financial), removed after; everything made is deleted,
 * including uploaded files. No action-layer code runs, so no one is notified.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-deliverables.ts
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

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const members = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)
  const B = members[0]
  const B2 = members.find((m) => m.brand_id !== B?.brand_id)
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const [D, X, Y] = pool.filter((c) => c.id !== G?.id).slice(0, 3)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, B2?.user_id, G?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !B2 || !G || !D || !X || !Y || !OP || !FIN || !NONE) throw new Error('missing test actors')

  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), brand2 = await sessionFor(B2.users.auth_id), creator = await sessionFor(G.users.auth_id)
  const anon = createClient(URL, ANON)

  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id, Y.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id, X.id, Y.id]).eq('pricing_type', 'per_day')

  // ══ Experience 1: the approved Kiro template (Guapd provides) ══
  // 4 creators × (1 UGC video + 1 Story); sold 4 videos.
  const one = await buildExperience(op, fin, B.brand_id, '[deliv-test] Kiro shoot',
    [{ id: G.id, rate: 1000000 }, { id: D.id, rate: 800000 }, { id: X.id, rate: 500000 }, { id: Y.id, rate: 600000 }],
    [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 1 }])
  const E = one.E
  const legOf = (who: { id: string }) => one.deal[who.id]
  const rosterOf = (who: { id: string }) => one.roster[who.id]

  group('the shoot: confirm (staff, operational)')
  for (const [n, s] of [['no access', none], ['brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: confirming the shoot and reading deliverables refused`, refused(await (s as SupabaseClient).rpc('experience_console_schedule_shoot', { p_experience_id: E }))
      && refused(await (s as SupabaseClient).rpc('experience_console_deliverables', { p_experience_id: E })))
  }
  ok('nobody has accepted yet: confirm refused', said(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), /accept/))
  const resp = await creator.rpc('creator_leg_respond', { p_deal_id: legOf(G), p_accept: true, p_reason: null })
  ok('creator G accepts in their own session', !resp.error, resp.error?.message ?? '')
  await admin.from('deals').update({ status: 'agreed' }).in('id', [legOf(D), legOf(X)])
  const sch = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  ok('operational staff confirm the shoot (Y still unanswered is allowed)', !sch.error, sch.error?.message ?? '')
  ok('Experience: confirmed → shoot_scheduled', (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'shoot_scheduled')
  ok('creators can no longer be added', refused(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [pool[5]?.id ?? G.id], p_added_by: 'guapd', p_channel: null })))

  group('the shoot: outcomes, roll-up, withdraw, undo')
  ok('before the shoot date an outcome is refused', said(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(G), p_outcome: 'done', p_reason: null }), /has not come yet/))
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  ok('G shot', !refused(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(G), p_outcome: 'done', p_reason: null })))
  ok('recording it twice is refused', said(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(G), p_outcome: 'done', p_reason: null }), /Undo it first/))
  ok('"did not shoot" needs a reason', refused(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(X), p_outcome: 'did_not_shoot', p_reason: '' })))
  const pBefore = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  ok('X did not shoot (with a reason)', !refused(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(X), p_outcome: 'did_not_shoot', p_reason: 'Fell ill on the day' })))
  const pAfter = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  const xNet = Number((await admin.from('experience_creator_terms').select('creator_net_paise').eq('deal_id', legOf(X)).single()).data!.creator_net_paise)
  ok('…X leaves the counted P&L creators (decision 4)', pAfter.legs_counted === pBefore.legs_counted - 1 && pAfter.legs_did_not_shoot === 1
    && Number(pAfter.creator_net_total_paise) === Number(pBefore.creator_net_total_paise) - xNet)
  const st = (await admin.from('experience_pnl_snapshots').select('guapd_margin_paise').eq('experience_id', E).single()).data as any
  ok('…and the stored margin refreshed with it', Number(st.guapd_margin_paise) === Number(pAfter.guapd_margin_paise))
  ok('operational staff still cannot read the P&L', refused(await op.rpc('experience_pnl', { p_experience_id: E })))
  ok('D shot', !refused(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(D), p_outcome: 'done', p_reason: null })))
  ok('Y has not answered, so the shoot is not done yet', (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'shoot_scheduled')
  ok("an unanswered creator has no outcome", said(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(Y), p_outcome: 'done', p_reason: null }), /accepted/))
  ok('withdrawing needs a reason', refused(await op.rpc('experience_console_leg_withdraw', { p_roster_id: rosterOf(Y), p_reason: '' })))
  ok("an accepted creator's offer cannot be withdrawn", said(await op.rpc('experience_console_leg_withdraw', { p_roster_id: rosterOf(D), p_reason: 'test' }), /not answered/))
  const wd = await op.rpc('experience_console_leg_withdraw', { p_roster_id: rosterOf(Y), p_reason: 'No reply before the shoot' })
  ok("Y's unanswered offer is withdrawn", !wd.error, wd.error?.message ?? '')
  ok('…the deal is cancelled, and the creator cannot accept it now', (await admin.from('deals').select('status').eq('id', legOf(Y)).single()).data?.status === 'cancelled')
  ok('every accepted creator recorded, one shot: Shoot done by itself', wd.data === 'shoot_done' && (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'shoot_done')
  ok('undo needs a reason', refused(await op.rpc('experience_console_leg_shoot_undo', { p_roster_id: rosterOf(D), p_reason: '' })))
  const un = await op.rpc('experience_console_leg_shoot_undo', { p_roster_id: rosterOf(D), p_reason: 'Recorded against the wrong creator' })
  ok('undo clears it and the Experience goes back to Scheduled', un.data === 'shoot_scheduled' && (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'shoot_scheduled')
  await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterOf(D), p_outcome: 'done', p_reason: null })
  ok('recorded again: Shoot done', (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'shoot_done')

  group('deliverables, Guapd provides (the approved Kiro template)')
  let dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  const items = (who: { id: string }) => (dv.legs as any[]).find((l) => l.creator_id === who.id).items as any[]
  const gUgc = items(G).find((i) => i.type === 'UGC video'), gStory = items(G).find((i) => i.type === 'Story')
  const dUgc = items(D).find((i) => i.type === 'UGC video'), dStory = items(D).find((i) => i.type === 'Story')
  const xUgc = items(X).find((i) => i.type === 'UGC video')
  ok('mode comes from the template: Guapd provides', dv.owner === 'guapd' && (dv.legs as any[]).every((l) => l.owner === 'guapd'))
  ok('G: shot, Guapd provides, so their part is done (payable in Phase 4)', (dv.legs as any[]).find((l) => l.creator_id === G.id).work_complete === true)
  ok('X did not shoot: their part is not done', (dv.legs as any[]).find((l) => l.creator_id === X.id).work_complete === false)
  ok('the creator cannot submit on a Guapd-provides shoot', said(await creator.rpc('creator_leg_item_submit', { p_item_id: gUgc.id, p_url: 'https://example.com/a', p_storage_path: null, p_file_name: null }), /nothing for you to submit/))
  ok('…nor write the item directly (0534 guard)', refused(await creator.from('deal_deliverable_items').update({ external_url: 'https://x.example' }).eq('id', gUgc.id).select('id')))
  ok("nothing can be attached for a creator who did not shoot", said(await op.rpc('experience_console_item_attach', { p_item_id: xUgc.id, p_url: 'https://example.com/x', p_storage_path: null, p_file_name: null }), /shoot done first/))
  ok('a link that is not http(s) is refused', refused(await op.rpc('experience_console_item_attach', { p_item_id: gUgc.id, p_url: 'javascript:alert(1)', p_storage_path: null, p_file_name: null })))
  ok('a link AND a file at once is refused', refused(await op.rpc('experience_console_item_attach', { p_item_id: gUgc.id, p_url: 'https://e.com', p_storage_path: 'x', p_file_name: 'a.mp4' })))
  const a1 = await op.rpc('experience_console_item_attach', { p_item_id: gUgc.id, p_url: 'https://drive.example.com/g-ugc-v1', p_storage_path: null, p_file_name: null })
  ok('staff attach a link to G\'s video: version 1', a1.data === 1, a1.error?.message ?? '')
  // A file: the database names the path; the file must be there.
  ok('a file type outside the allowlist is refused', refused(await op.rpc('experience_console_item_upload_slot', { p_item_id: dUgc.id, p_file_name: 'run.exe' })))
  const slot = await op.rpc('experience_console_item_upload_slot', { p_item_id: dUgc.id, p_file_name: 'D final cut.mp4' })
  ok('the upload slot is the item\'s own versioned path', slot.data === `${legOf(D)}/${dUgc.id}/v1/D_final_cut.mp4`, String(slot.data ?? slot.error?.message))
  ok('attaching before the file is uploaded is refused', said(await op.rpc('experience_console_item_attach', { p_item_id: dUgc.id, p_url: null, p_storage_path: slot.data, p_file_name: 'D final cut.mp4' }), /did not finish/))
  const up = await admin.storage.from('deliverables').upload(slot.data as string, Buffer.from('not really a video'), { contentType: 'video/mp4' })
  if (!up.error) uploaded.push(slot.data as string)
  ok('a path that is not the slot is refused', said(await op.rpc('experience_console_item_attach', { p_item_id: dUgc.id, p_url: null, p_storage_path: `${legOf(D)}/${dUgc.id}/v1/other.mp4`, p_file_name: 'D final cut.mp4' }), /does not match/))
  ok('the uploaded file attaches', !refused(await op.rpc('experience_console_item_attach', { p_item_id: dUgc.id, p_url: null, p_storage_path: slot.data, p_file_name: 'D final cut.mp4' })))
  await op.rpc('experience_console_item_attach', { p_item_id: gStory.id, p_url: 'https://drive.example.com/g-story', p_storage_path: null, p_file_name: null })
  await op.rpc('experience_console_item_attach', { p_item_id: dStory.id, p_url: 'https://drive.example.com/d-story', p_storage_path: null, p_file_name: null })
  ok('sharing before Guapd approves is refused', said(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [gUgc.id] }), /not approved/))
  for (const i of [gUgc, gStory, dUgc]) await op.rpc('experience_console_item_review', { p_item_id: i.id, p_decision: 'approve', p_note: null })
  ok('approving twice is refused', refused(await op.rpc('experience_console_item_review', { p_item_id: gUgc.id, p_decision: 'approve', p_note: null })))

  group('sharing with the brand (versioned releases)')
  const rel = await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [gUgc.id, gStory.id, dUgc.id] })
  ok('staff share 3 of 4 attached (D\'s story stays with Guapd)', (rel.data as any)?.released === 3, rel.error?.message ?? '')
  ok('first share: Shoot done → Delivering', (await admin.from('experiences').select('status').eq('id', E).single()).data?.status === 'delivering')
  ok('the same version cannot be shared twice', said(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [gUgc.id] }), /already shared/))
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('counter: shared 2 · sold 4 videos, not ready, gaps listed', dv.progress.videos_shared === 2 && dv.progress.videos_sold === 4 && dv.progress.ready === false && dv.progress.over_shared === false && dv.progress.gaps.length > 0, JSON.stringify(dv.progress))

  const brandView = async (s: SupabaseClient, id = E) => s.rpc('brand_experience_deliverables', { p_experience_id: id })
  let bv = await brandView(brand)
  const bitems = ((bv.data as any)?.items ?? []) as any[]
  ok('the brand sees exactly the 3 released items', !bv.error && bitems.length === 3, bv.error?.message ?? String(bitems.length))
  ok('…never D\'s unreleased story', !bitems.some((i) => i.label === 'Story' && i.creator_name !== bitems.find((x) => x.label === 'Story')?.creator_name) && !JSON.stringify(bv.data).includes('d-story'))
  const KEYS = ['creator_name', 'decided_at', 'decision', 'file_name', 'kind', 'label', 'release_id', 'shared_at', 'url'].join(',')
  ok('each item carries exactly: release id, creator name, label, kind, link/file name, shared at, decision', bitems.every((i) => Object.keys(i).sort().join(',') === KEYS), Object.keys(bitems[0] ?? {}).sort().join(','))
  ok('top level: title, brand name, shoot date and city, items only', Object.keys(bv.data as object).sort().join(',') === 'brand_name,items,shoot_city,shoot_date,title')
  const raw = JSON.stringify(bv.data)
  const { data: handles } = await admin.from('creators').select('handle').in('id', [G.id, D.id])
  ok('no deal, item, creator or Experience-leg ids anywhere in it', ![legOf(G), legOf(D), gUgc.id, dUgc.id, G.id, D.id].some((x) => raw.includes(x)))
  ok('no handles, no storage path, no versions, no notes, no money', !(handles ?? []).some((h: any) => h.handle && raw.includes(String(h.handle).replace(/^@/, '')))
    && !raw.includes('/v1/') && !/version|note|paise|price|rate|margin|net|gross|submitted|via/i.test(Object.keys(bitems[0]).join(' ') + Object.keys(bv.data as object).join(' ')))
  ok('a file release shows the file name, not its path', bitems.some((i) => i.kind === 'file' && i.file_name === 'D_final_cut.mp4' && i.url === null))
  for (const [n, s] of [['another brand', brand2], ['the creator', creator], ['operational staff (not a member)', op], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: the brand view is refused`, refused(await brandView(s as SupabaseClient)))
  }
  for (const [n, s] of [['brand', brand], ['creator', creator], ['operational staff', op]] as const) {
    ok(`${n}: the release and staff-note tables are unreadable directly`,
      refused(await (s as SupabaseClient).from('experience_deliverable_releases').select('id').limit(1)) && refused(await (s as SupabaseClient).from('experience_item_staff_notes').select('item_id').limit(1)))
  }
  const fileRel = bitems.find((i) => i.kind === 'file')
  const bf = await brand.rpc('brand_experience_release_file', { p_release_id: fileRel.release_id })
  ok('the brand can fetch its file release\'s path (to sign a short link)', !bf.error && (bf.data as any)?.storage_path === slot.data)
  ok('another brand cannot', refused(await brand2.rpc('brand_experience_release_file', { p_release_id: fileRel.release_id })))
  ok('a link release has no file', refused(await brand.rpc('brand_experience_release_file', { p_release_id: bitems.find((i) => i.kind === 'link').release_id })))

  group('a new version: the brand keeps the released one until Guapd re-shares')
  ok('asking for changes needs a note', refused(await op.rpc('experience_console_item_review', { p_item_id: gUgc.id, p_decision: 'revision', p_note: '' })))
  ok('staff ask for changes on G\'s shared video', !refused(await op.rpc('experience_console_item_review', { p_item_id: gUgc.id, p_decision: 'revision', p_note: 'Cut the intro to 2 seconds' })))
  const { data: gRow } = await admin.from('deal_deliverable_items').select('revision_note').eq('id', gUgc.id).single()
  const { data: sNote } = await admin.from('experience_item_staff_notes').select('note').eq('item_id', gUgc.id).maybeSingle()
  ok('Guapd-provides: the note is staff-only, not on the creator-readable item', gRow?.revision_note == null && sNote?.note === 'Cut the intro to 2 seconds')
  const ctxG = (await creator.rpc('creator_leg_context', { p_deal_id: legOf(G) })).data as any
  ok('the creator sees status only: no link, file, note or release on their items', ctxG.deliverables_owner === 'guapd' && ctxG.can_submit === false
    && (ctxG.items as any[]).every((i) => i.external_url === null && i.file_name === null && i.revision_note === null) && !JSON.stringify(ctxG).includes('release') && !JSON.stringify(ctxG).includes('Cut the intro'))
  ok('…their part is still done (shoot done is the trigger here)', ctxG.work_complete === true && ctxG.shoot_outcome === 'done')
  const a2 = await op.rpc('experience_console_item_attach', { p_item_id: gUgc.id, p_url: 'https://drive.example.com/g-ugc-v2', p_storage_path: null, p_file_name: null })
  ok('a new version is attached: version 2', a2.data === 2, a2.error?.message ?? '')
  bv = await brandView(brand)
  ok('the brand still sees version 1, not the new one', JSON.stringify(bv.data).includes('g-ugc-v1') && !JSON.stringify(bv.data).includes('g-ugc-v2'))
  await op.rpc('experience_console_item_review', { p_item_id: gUgc.id, p_decision: 'approve', p_note: null })
  ok('re-sharing version 2 replaces version 1', !refused(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [gUgc.id] })))
  bv = await brandView(brand)
  ok('the brand now sees version 2 only, still 3 items', JSON.stringify(bv.data).includes('g-ugc-v2') && !JSON.stringify(bv.data).includes('g-ugc-v1') && ((bv.data as any).items as any[]).length === 3)
  const { data: hist } = await admin.from('experience_deliverable_releases').select('status, item_version, superseded_by').eq('item_id', gUgc.id).order('item_version')
  ok('…version 1 is kept on record as superseded, pointing at version 2', hist?.length === 2 && hist[0].status === 'superseded' && !!hist[0].superseded_by && hist[1].status === 'shared')

  group('withdraw, and the brand\'s answer (recorded by staff)')
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  const relOf = (id: string) => ((dv.legs as any[]).flatMap((l) => l.items).find((i: any) => i.id === id)).release
  ok('withdrawing needs a reason', refused(await op.rpc('experience_console_release_withdraw', { p_release_id: relOf(gStory.id).id, p_reason: '' })))
  ok('G\'s story is withdrawn with a reason', !refused(await op.rpc('experience_console_release_withdraw', { p_release_id: relOf(gStory.id).id, p_reason: 'Wrong aspect ratio' })))
  bv = await brandView(brand)
  ok('…and the brand stops seeing it', ((bv.data as any).items as any[]).length === 2 && !JSON.stringify(bv.data).includes('g-story'))
  const r1 = relOf(gUgc.id).id
  ok('a decision needs the channel', refused(await op.rpc('experience_console_release_decide', { p_release_id: r1, p_decision: 'approved', p_channel: null, p_note: null })))
  ok('"portal" is not a channel staff can record (self-service is Phase 6)', refused(await op.rpc('experience_console_release_decide', { p_release_id: r1, p_decision: 'approved', p_channel: 'portal', p_note: null })))
  ok('"changes requested" needs what they asked', refused(await op.rpc('experience_console_release_decide', { p_release_id: r1, p_decision: 'changes_requested', p_channel: 'call', p_note: '' })))
  ok('the brand\'s approval is recorded (via WhatsApp)', !refused(await op.rpc('experience_console_release_decide', { p_release_id: r1, p_decision: 'approved', p_channel: 'whatsapp', p_note: null })))
  bv = await brandView(brand)
  ok('…the brand sees it as approved', ((bv.data as any).items as any[]).some((i) => i.label === 'UGC video' && i.decision === 'approved' && i.decided_at))
  ok('an approved release cannot be withdrawn', said(await op.rpc('experience_console_release_withdraw', { p_release_id: r1, p_reason: 'test test' }), /stays shared/))
  ok('…or re-decided', refused(await op.rpc('experience_console_release_decide', { p_release_id: r1, p_decision: 'changes_requested', p_channel: 'call', p_note: 'actually no' })))
  ok('…and the item can no longer be sent back', said(await op.rpc('experience_console_item_review', { p_item_id: gUgc.id, p_decision: 'revision', p_note: 'one more' }), /final/))
  ok('…nor replaced by a new version', refused(await op.rpc('experience_console_item_attach', { p_item_id: gUgc.id, p_url: 'https://e.com/v3', p_storage_path: null, p_file_name: null })))
  ok("G's outcome can no longer be undone (content is with the brand)", refused(await op.rpc('experience_console_leg_shoot_undo', { p_roster_id: rosterOf(G), p_reason: 'test test' })))
  const r2 = relOf(dUgc.id).id
  ok('changes requested, with the brand\'s words, recorded', !refused(await op.rpc('experience_console_release_decide', { p_release_id: r2, p_decision: 'changes_requested', p_channel: 'email', p_note: 'Logo too small' })))
  bv = await brandView(brand)
  ok('…the brand sees "changes asked", not the note text', ((bv.data as any).items as any[]).some((i) => i.decision === 'changes_requested') && !JSON.stringify(bv.data).includes('Logo too small'))

  group('readiness (sets up two-party completion; does not gate Complete yet)')
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('not ready: approvals short of what was sold', dv.progress.ready === false && dv.progress.videos_approved === 1)
  // Shrink what was "sold" to what this test can deliver (2 videos, 2 stories) to see ready flip.
  const { data: ex } = await admin.from('experiences').select('agreed_plan').eq('id', E).single()
  const plan = ex!.agreed_plan as any
  await admin.from('experiences').update({ agreed_plan: { ...plan, videos_sold: 2, plan_videos: 2, totals: [{ type: 'UGC video', per_creator: 1, total: 2 }, { type: 'Story', per_creator: 1, total: 1 }] } }).eq('id', E)
  await op.rpc('experience_console_item_review', { p_item_id: dUgc.id, p_decision: 'revision', p_note: 'Logo bigger' })
  const slot2 = await op.rpc('experience_console_item_upload_slot', { p_item_id: dUgc.id, p_file_name: 'D v2.mp4' })
  ok('after "changes asked", the next version gets its own path (v2)', String(slot2.data).includes(`/v2/`))
  await admin.storage.from('deliverables').upload(slot2.data as string, Buffer.from('v2'), { contentType: 'video/mp4' }); uploaded.push(slot2.data as string)
  await op.rpc('experience_console_item_attach', { p_item_id: dUgc.id, p_url: null, p_storage_path: slot2.data, p_file_name: 'D v2.mp4' })
  await op.rpc('experience_console_item_review', { p_item_id: dUgc.id, p_decision: 'approve', p_note: null })
  await op.rpc('experience_console_item_review', { p_item_id: dStory.id, p_decision: 'approve', p_note: null })
  await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [dUgc.id, dStory.id] })
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  await op.rpc('experience_console_release_decide', { p_release_id: relOf(dUgc.id).id, p_decision: 'approved', p_channel: 'email', p_note: null })
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('both videos approved, story not yet: still not ready', dv.progress.ready === false && dv.progress.videos_approved === 2)
  await op.rpc('experience_console_release_decide', { p_release_id: relOf(dStory.id).id, p_decision: 'approved', p_channel: 'email', p_note: null })
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('everything sold approved by the brand: ready', dv.progress.ready === true && dv.progress.gaps.length === 0, JSON.stringify(dv.progress))
  await admin.from('experiences').update({ agreed_plan: { ...plan, videos_sold: 1, plan_videos: 1, totals: [{ type: 'UGC video', per_creator: 1, total: 1 }, { type: 'Story', per_creator: 1, total: 1 }] } }).eq('id', E)
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('shared past what was sold is flagged (allowed, a warning)', dv.progress.over_shared === true)
  await admin.from('experiences').update({ agreed_plan: plan }).eq('id', E)
  dv = (await op.rpc('experience_console_deliverables', { p_experience_id: E })).data as any
  ok('Complete is gated (0540): refused while the brand has not approved what was sold', dv.progress.ready === false && said(await op.rpc('experience_console_complete', { p_experience_id: E }), /Not ready to complete/))
  await admin.from('experiences').update({ status: 'complete' }).eq('id', E)  // to test what a Complete Experience refuses
  ok('a Complete Experience refuses deliverable changes', said(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [gStory.id] }), /Complete/)
    && said(await op.rpc('experience_console_release_withdraw', { p_release_id: relOf(dStory.id).id, p_reason: 'test test' }), /Complete|approved/))

  group('audit: every write, no money')
  const { data: ev } = await admin.from('ops_events').select('action, detail').eq('actor_auth_id', OP.auth_id).gte('created_at', startedAt)
  const acts = new Set((ev ?? []).map((e) => e.action))
  for (const a of ['experience.shoot_scheduled', 'experience.leg_shoot_outcome', 'experience.leg_shoot_outcome_undone', 'experience.leg_withdrawn', 'experience.shoot_done',
    'experience.deliverable_attached', 'experience.deliverable_reviewed', 'experience.deliverable_released', 'experience.delivering', 'experience.deliverable_withdrawn', 'experience.brand_deliverable_decision_recorded']) {
    ok(`ops_events has ${a}`, acts.has(a))
  }
  const mine = (ev ?? []).filter((e) => /shoot|deliverable|delivering|leg_withdrawn/.test(e.action))
  ok('none of the new audit rows carries a price, rate, net or margin', mine.length > 0 && !mine.some((e) => /paise|margin|price|rate|net|gross/i.test(Object.keys(e.detail as object).join(' '))))
  ok('review notes are audited by length, never their text', !mine.some((e) => JSON.stringify(e.detail).includes('Cut the intro')))

  // ══ Experience 2: a creator-submit template ══
  group('deliverables, creator submits (a future template; mode decides)')
  const two = await buildExperience(op, fin, B.brand_id, '[deliv-test] creator-submit', [{ id: G.id, rate: 900000 }], [{ type: 'UGC video', count: 1 }],
    { deliverables_owner: 'creator', completion_trigger: 'on_delivery_accepted' })
  const E2 = two.E, leg2 = two.deal[G.id]
  await creator.rpc('creator_leg_respond', { p_deal_id: leg2, p_accept: true, p_reason: null })
  const sch2 = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E2 })
  if (sch2.error) throw new Error('schedule 2: ' + sch2.error.message)
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E2)
  let ctx2 = (await creator.rpc('creator_leg_context', { p_deal_id: leg2 })).data as any
  const it2 = (ctx2.items as any[])[0]
  const early = await creator.rpc('creator_leg_item_submit', { p_item_id: it2.id, p_url: 'https://e.com/a', p_storage_path: null, p_file_name: null })
  ok('before the shoot is marked done the creator cannot submit', ctx2.can_submit === false && said(early, /shoot done first/), early.error?.message ?? 'no error')
  await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: two.roster[G.id], p_outcome: 'done', p_reason: null })
  ctx2 = (await creator.rpc('creator_leg_context', { p_deal_id: leg2 })).data as any
  ok('shot, but nothing approved: their part is NOT done yet (approval is the trigger)', ctx2.can_submit === true && ctx2.work_complete === false)
  ok('staff cannot attach for them on a creator-submit shoot', said(await op.rpc('experience_console_item_attach', { p_item_id: it2.id, p_url: 'https://e.com/s', p_storage_path: null, p_file_name: null }), /creator submits/))
  ok('a creator cannot submit on another creator\'s leg', said(await creator.rpc('creator_leg_item_submit', { p_item_id: dUgc.id, p_url: 'https://e.com/z', p_storage_path: null, p_file_name: null }), /Not found/))
  const sub = await creator.rpc('creator_leg_item_submit', { p_item_id: it2.id, p_url: 'https://drive.example.com/creator-v1', p_storage_path: null, p_file_name: null })
  ok('the creator submits a link', sub.data === 1, sub.error?.message ?? '')
  const cslot = await creator.rpc('creator_leg_item_upload_slot', { p_item_id: it2.id, p_file_name: 'my reel.mov' })
  ok('…or gets an upload slot for a file on their own item', String(cslot.data).startsWith(`${leg2}/${it2.id}/v1/`), cslot.error?.message ?? '')
  const { data: evs } = await admin.from('events').select('event_type').eq('deal_id', leg2).eq('event_type', 'experience.deliverable_submitted')
  ok('the submission is on the deal\'s events (creators may have no email for ops_events)', (evs ?? []).length === 1)
  ok('staff ask for changes; the note is for the creator', !refused(await op.rpc('experience_console_item_review', { p_item_id: it2.id, p_decision: 'revision', p_note: 'Brighter lighting please' })))
  ctx2 = (await creator.rpc('creator_leg_context', { p_deal_id: leg2 })).data as any
  ok('…the creator sees the note and their own link', (ctx2.items as any[])[0].revision_note === 'Brighter lighting please' && (ctx2.items as any[])[0].external_url === 'https://drive.example.com/creator-v1')
  const sub2 = await creator.rpc('creator_leg_item_submit', { p_item_id: it2.id, p_url: 'https://drive.example.com/creator-v2', p_storage_path: null, p_file_name: null })
  ok('the resubmission is version 2', sub2.data === 2, sub2.error?.message ?? '')
  await op.rpc('experience_console_item_review', { p_item_id: it2.id, p_decision: 'approve', p_note: null })
  ctx2 = (await creator.rpc('creator_leg_context', { p_deal_id: leg2 })).data as any
  ok('Guapd approved everything: now their part is done', ctx2.work_complete === true)
  ok('an approved item cannot be replaced by the creator', refused(await creator.rpc('creator_leg_item_submit', { p_item_id: it2.id, p_url: 'https://e.com/v3', p_storage_path: null, p_file_name: null })))
  await op.rpc('experience_console_release', { p_experience_id: E2, p_item_ids: [it2.id] })
  const bv2 = await brandView(brand, E2)
  ok('the brand sees the released version, with the creator\'s name only (not that the creator submitted it)', ((bv2.data as any).items as any[]).length === 1 && JSON.stringify(bv2.data).includes('creator-v2') && !/creator-v1|via|submitted|Brighter/.test(JSON.stringify(bv2.data)))
  ok('the creator still sees nothing of the release', !JSON.stringify((await creator.rpc('creator_leg_context', { p_deal_id: leg2 })).data).includes('release'))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (uploaded.length) await admin.storage.from('deliverables').remove(uploaded)
  for (const E of exps) {
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
  if (legDeals.length) { await admin.from('notifications').delete().in('deal_id', legDeals); await admin.from('deals').delete().in('id', legDeals) }
  for (const E of exps) { await admin.from('experience_cost_lines').delete().eq('experience_id', E); await admin.from('experiences').delete().eq('id', E) }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[deliv-test]%')
  const files = uploaded.length ? (await admin.storage.from('deliverables').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
