/**
 * The creator boundary on Experience deliverables, against STAGING with real
 * sessions: a creator reads items on their OWN leg only. Every direct query
 * shape (filters, OR, embeds, ids), every function and the private bucket is
 * tried for another creator's items, hidden items, Guapd's staff notes and the
 * brand side. Two temporary staff grants, removed after; everything made is deleted.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-creator-boundary.ts
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


const SECRETS = { staff: 'STAFF-NOTE-ZQ7', brand: 'BRAND-NOTE-ZQ7', dLink: 'd-secret-link-zq7', hidden: 'hidden-item-zq7' }
const leaks = (x: unknown) => Object.entries(SECRETS).filter(([, v]) => JSON.stringify(x ?? null).includes(v)).map(([k]) => k)

async function run() {
  startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(200)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !OP || !FIN) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), creator = await sessionFor(G.users.auth_id)
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')

  // Setup: G and D on one Kiro-mode Experience, both shot. G's video sent back with a
  // staff-only note; D's video is a file, shared, and the brand asked for changes.
  const one = await buildExperience(op, fin, B.brand_id, '[bound-test] boundary', [{ id: G.id, rate: 700000 }, { id: D.id, rate: 700000 }],
    [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 1 }])
  const E = one.E, gLeg = one.deal[G.id], dLeg = one.deal[D.id]
  await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }).then(async (r) => {
    if (r.error) { await admin.from('deals').update({ status: 'agreed' }).in('id', [gLeg, dLeg]); const r2 = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }); if (r2.error) throw new Error('schedule: ' + r2.error.message) }
  })
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  for (const c of [G, D]) { const r = await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: one.roster[c.id], p_outcome: 'done', p_reason: null }); if (r.error) throw new Error('outcome: ' + r.error.message) }
  const { data: allItems } = await admin.from('deal_deliverable_items').select('id, deal_id, label').in('deal_id', [gLeg, dLeg])
  const it = (deal: string, label: string) => (allItems ?? []).find((i: any) => i.deal_id === deal && i.label.startsWith(label))!.id as string
  const gUgc = it(gLeg, 'UGC'), dUgc = it(dLeg, 'UGC'), dStory = it(dLeg, 'Story')
  await op.rpc('experience_console_item_attach', { p_item_id: gUgc, p_url: 'https://drive.example.com/g-own', p_storage_path: null, p_file_name: null })
  await op.rpc('experience_console_item_review', { p_item_id: gUgc, p_decision: 'revision', p_note: SECRETS.staff })
  const slot = await op.rpc('experience_console_item_upload_slot', { p_item_id: dUgc, p_file_name: 'd cut.mp4' })
  await admin.storage.from('deliverables').upload(slot.data as string, Buffer.from('x'), { contentType: 'video/mp4' }); uploaded.push(slot.data as string)
  await op.rpc('experience_console_item_attach', { p_item_id: dUgc, p_url: null, p_storage_path: slot.data, p_file_name: 'd cut.mp4' })
  await op.rpc('experience_console_item_attach', { p_item_id: dStory, p_url: `https://drive.example.com/${SECRETS.dLink}`, p_storage_path: null, p_file_name: null })
  await op.rpc('experience_console_item_review', { p_item_id: dUgc, p_decision: 'approve', p_note: null })
  const rel = await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: [dUgc] })
  if (rel.error) throw new Error('release: ' + rel.error.message)
  const { data: relRow } = await admin.from('experience_deliverable_releases').select('id').eq('item_id', dUgc).single()
  await op.rpc('experience_console_release_decide', { p_release_id: relRow!.id, p_decision: 'changes_requested', p_channel: 'email', p_note: SECRETS.brand })
  // A Guapd-internal item on G's own leg, not shown to the creator.
  const hid = await admin.from('deal_deliverable_items').insert({ deal_id: gLeg, label: 'Internal', platform: 'instagram', handle: 'x', added_by: 'guapd', visible_to_creator: false, external_url: `https://e.com/${SECRETS.hidden}` }).select('id').single()
  if (hid.error) throw new Error('hidden item: ' + hid.error.message)
  const hiddenId = hid.data.id as string
  ok('setup: staff note, brand note, D link and a hidden item exist (service role sees all four)',
    leaks([(await admin.from('experience_item_staff_notes').select('note')).data, (await admin.from('experience_deliverable_releases').select('brand_decision_note').eq('id', relRow!.id)).data,
      (await admin.from('deal_deliverable_items').select('external_url').in('deal_id', [gLeg, dLeg])).data]).length === 4)

  group('deliverable items: own leg only, through every direct query shape')
  const mine = await creator.from('deal_deliverable_items').select('id, deal_id, label, item_status, version, external_url, storage_path, file_name, revision_note, visible_to_creator')
  const rows = (mine.data ?? []) as any[]
  const { data: myDeals } = await admin.from('deals').select('id').eq('creator_id', G.id)
  const myIds = new Set((myDeals ?? []).map((d: any) => d.id))
  ok('an unfiltered read returns only items on the creator\'s own deals', !mine.error && rows.length > 0 && rows.every((r) => myIds.has(r.deal_id)), `${rows.length} rows`)
  ok('…visible ones only (the Guapd-internal item on their own leg is not there)', rows.every((r) => r.visible_to_creator) && !rows.some((r) => r.id === hiddenId))
  ok('…and nothing of D\'s', !rows.some((r) => r.deal_id === dLeg))
  ok('own items: the staff note is NOT on the row (revision_note empty in Kiro mode)', rows.filter((r) => r.deal_id === gLeg).every((r) => r.revision_note == null))
  ok('own items: the creator CAN read the link Guapd attached to their own item (the known, accepted case)', rows.some((r) => r.id === gUgc && r.external_url === 'https://drive.example.com/g-own'))
  ok('D\'s item by id: empty', ((await creator.from('deal_deliverable_items').select('id').eq('id', dUgc)).data ?? []).length === 0)
  ok('D\'s items by deal id: empty', ((await creator.from('deal_deliverable_items').select('id').eq('deal_id', dLeg)).data ?? []).length === 0)
  ok('the hidden item by id: empty', ((await creator.from('deal_deliverable_items').select('id').eq('id', hiddenId)).data ?? []).length === 0)
  ok('an OR filter across both legs: own rows only', ((await creator.from('deal_deliverable_items').select('deal_id').or(`deal_id.eq.${dLeg},deal_id.eq.${gLeg}`)).data ?? []).every((r: any) => r.deal_id === gLeg))
  const emb = await creator.from('deals').select('id, deal_deliverable_items(id, external_url)').in('id', [gLeg, dLeg])
  ok('embedding items through deals: D\'s deal is not returned at all', !emb.error && !((emb.data ?? []) as any[]).some((d) => d.id === dLeg) && leaks(emb.data).length === 0)
  ok('a filter on another creator\'s link text finds nothing', ((await creator.from('deal_deliverable_items').select('id').ilike('external_url', `%${SECRETS.dLink}%`)).data ?? []).length === 0)
  ok('a hidden item cannot be revealed by filtering on visible_to_creator=false', ((await creator.from('deal_deliverable_items').select('id').eq('visible_to_creator', false)).data ?? []).length === 0)

  group('writes: none, own leg or not')
  ok('updating their own item directly is refused (0534 guard)', refused(await creator.from('deal_deliverable_items').update({ external_url: 'https://evil.example' }).eq('id', gUgc).select('id')))
  const upD = await creator.from('deal_deliverable_items').update({ external_url: 'https://evil.example' }).eq('id', dUgc).select('id')
  ok('updating D\'s item touches nothing', !!upD.error || (upD.data ?? []).length === 0)
  ok('flipping their hidden item visible is refused or touches nothing', await (async () => { const r = await creator.from('deal_deliverable_items').update({ visible_to_creator: true }).eq('id', hiddenId).select('id'); return !!r.error || (r.data ?? []).length === 0 })())
  ok('inserting an item on D\'s leg is refused', refused(await creator.from('deal_deliverable_items').insert({ deal_id: dLeg, label: 'x', platform: 'instagram', handle: 'x', added_by: 'creator' })))
  ok('inserting an item on their own leg is refused (guard)', refused(await creator.from('deal_deliverable_items').insert({ deal_id: gLeg, label: 'x', platform: 'instagram', handle: 'x', added_by: 'creator' })))
  ok('inserting a release is refused', refused(await creator.from('experience_deliverable_releases').insert({ experience_id: E, deal_id: gLeg, item_id: gUgc, item_version: 1, label: 'x', external_url: 'https://e.com', status: 'shared' })))

  group('Guapd notes, the brand side and other tables')
  ok('staff notes table: refused', refused(await creator.from('experience_item_staff_notes').select('item_id, note')))
  ok('releases table (holds the brand\'s note): refused', refused(await creator.from('experience_deliverable_releases').select('id, brand_decision_note')))
  for (const t of ['experience_roster_notes', 'experience_quotes', 'experience_cost_lines', 'experience_pnl_snapshots', 'experience_roster', 'experiences']) {
    const r = await creator.from(t).select('*', { head: false }).limit(50)
    ok(`${t}: refused or empty for the creator`, !!r.error || (r.data ?? []).length === 0, r.error ? 'refused' : `${(r.data ?? []).length} rows`)
  }
  ok('D\'s creator terms (their pay): empty', ((await creator.from('experience_creator_terms').select('deal_id').eq('deal_id', dLeg)).data ?? []).length === 0)
  const opsEv = await creator.from('ops_events').select('id').limit(5)
  ok('ops_events (staff audit): refused or empty', !!opsEv.error || (opsEv.data ?? []).length === 0)
  ok('events on D\'s deal: empty', ((await creator.from('events').select('id').eq('deal_id', dLeg)).data ?? []).length === 0)
  ok('events on their own deal carry none of the notes', leaks((await creator.from('events').select('event_type, detail').eq('deal_id', gLeg)).data).length === 0)

  group('functions: no route around it')
  const ctx = (await creator.rpc('creator_leg_context', { p_deal_id: gLeg })).data
  ok('their own leg context: none of the four secrets', leaks(ctx).length === 0, leaks(ctx).join(','))
  ok('D\'s leg context: Not found', said(await creator.rpc('creator_leg_context', { p_deal_id: dLeg }), /Not found/))
  ok('upload slot on D\'s item: Not found', said(await creator.rpc('creator_leg_item_upload_slot', { p_item_id: dUgc, p_file_name: 'a.mp4' }), /Not found/))
  ok('upload slot on their hidden item: Not found', said(await creator.rpc('creator_leg_item_upload_slot', { p_item_id: hiddenId, p_file_name: 'a.mp4' }), /Not found/))
  ok('submit onto D\'s item: Not found', said(await creator.rpc('creator_leg_item_submit', { p_item_id: dUgc, p_url: 'https://e.com', p_storage_path: null, p_file_name: null }), /Not found/))
  ok('brand view of the Experience: refused', refused(await creator.rpc('brand_experience_deliverables', { p_experience_id: E })))
  ok('brand file of D\'s release: refused', refused(await creator.rpc('brand_experience_release_file', { p_release_id: relRow!.id })))
  for (const f of ['experience_console_deliverables', 'experience_console_get', 'experience_pnl', 'experience_deliverables_progress', 'experience_shoot_rollup'])
    ok(`${f}: refused`, refused(await creator.rpc(f, { p_experience_id: E })))
  ok('experience_console_item_file (D\'s file path): refused', refused(await creator.rpc('experience_console_item_file', { p_item_id: dUgc })))
  ok('internal gate called directly: refused', refused(await creator.rpc('experience_item_gate', { p_item_id: dUgc, p_who: 'review' })))
  ok('internal put called directly (point D\'s item at a link): refused', refused(await creator.rpc('experience_item_put', { p_item_id: dUgc, p_deal_id: dLeg, p_item_status: 'pending', p_next_version: 9, p_url: 'https://evil.example', p_storage_path: null, p_file_name: null, p_via: 'guapd' })))
  ok('…and D\'s item is unchanged', (await admin.from('deal_deliverable_items').select('external_url').eq('id', dUgc).single()).data?.external_url == null)

  group('files: the private bucket')
  const dPath = slot.data as string
  ok('download D\'s file: refused', refused(await creator.storage.from('deliverables').download(dPath) as any))
  ok('sign a link to D\'s file: refused', refused(await creator.storage.from('deliverables').createSignedUrl(dPath, 60) as any))
  const ls = await creator.storage.from('deliverables').list(dLeg)
  ok('list D\'s folder: nothing', !!ls.error || (ls.data ?? []).length === 0)
  const plant = await creator.storage.from('deliverables').upload(`${dLeg}/${dUgc}/v9/x.mp4`, Buffer.from('x'), { contentType: 'video/mp4' })
  if (!plant.error) uploaded.push(`${dLeg}/${dUgc}/v9/x.mp4`)
  ok('upload into D\'s folder: refused', !!plant.error)
  const ownPlant = await creator.storage.from('deliverables').upload(`${gLeg}/${gUgc}/v9/x.mp4`, Buffer.from('x'), { contentType: 'video/mp4' })
  if (!ownPlant.error) uploaded.push(`${gLeg}/${gUgc}/v9/x.mp4`)
  ok('0539: upload straight into their OWN leg folder: refused too (leg files only via the slot)', !!ownPlant.error)
  const minted = await admin.storage.from('deliverables').createSignedUploadUrl(`${gLeg}/${gUgc}/v8/slot.mp4`)
  const viaSlot = minted.data ? await creator.storage.from('deliverables').uploadToSignedUrl(minted.data.path, minted.data.token, Buffer.from('x'), { contentType: 'video/mp4' }) : { error: { message: 'no slot' } }
  if (!viaSlot.error) uploaded.push(`${gLeg}/${gUgc}/v8/slot.mp4`)
  ok('…while a Guapd-minted upload slot still works from the creator\'s session (the creator-submit path)', !viaSlot.error, viaSlot.error?.message ?? '')

  group('0539: NULL means no (each call is refused because of the NULL alone)')
  ok('brand decision NULL: refused', said(await op.rpc('experience_console_release_decide', { p_release_id: relRow!.id, p_decision: null, p_channel: 'email', p_note: 'x' }), /Approved, or changes requested/))
  ok('review decision NULL: refused', said(await op.rpc('experience_console_item_review', { p_item_id: dStory, p_decision: null, p_note: null }), /Approve, or ask/))
  ok('cost with no "provided by": refused', said(await op.rpc('experience_console_cost_add', { p_experience_id: E, p_label: 'Studio', p_category: 'studio', p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 100, p_provided_by: null, p_creator_leg_deal_id: null, p_note: null }), /Say who provides/))
  ok('cost with no category: refused', said(await op.rpc('experience_console_cost_add', { p_experience_id: E, p_label: 'Studio', p_category: null, p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 100, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null }), /cost category/))
  const c3 = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[bound-test] nulls', p_creator_count: 1, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c3.error) throw new Error('create 3: ' + c3.error.message)
  const E3 = c3.data as string; exps.push(E3)
  ok('quote "proposed by" NULL: refused', said(await fin.rpc('experience_console_quote', { p_experience_id: E3, p_proposed_by: null, p_per_video_paise: 3000000, p_deliverable_count: 1, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: 'email' }), /from Guapd or the brand/))
  const q3 = await fin.rpc('experience_console_quote', { p_experience_id: E3, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 1, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q3.data, p_channel: 'email' })
  ok('roster "added by" NULL: refused', said(await op.rpc('experience_console_roster_add', { p_experience_id: E3, p_creator_ids: [D.id], p_added_by: null, p_channel: null }), /added by Guapd/))
  await op.rpc('experience_console_roster_add', { p_experience_id: E3, p_creator_ids: [D.id], p_added_by: 'guapd', p_channel: null })
  const r3 = (((await op.rpc('experience_console_roster', { p_experience_id: E3 })).data ?? []) as any[])[0]
  ok('roster decision NULL: refused', said(await op.rpc('experience_console_roster_decide', { p_roster_id: r3.id, p_decision: null, p_channel: 'email' }), /Unknown decision/))
  ok('a planned deliverable with no type: refused', said(await op.rpc('experience_console_roster_plan', { p_roster_id: r3.id, p_deliverables: [{ count: 1 }] }), /known type/))
  await op.rpc('experience_console_roster_decide', { p_roster_id: r3.id, p_decision: 'accepted', p_channel: 'email' })
  const { data: e3 } = await admin.from('experiences').select('agreed_plan').eq('id', E3).single()
  const plan = { ...(e3!.agreed_plan as any) }; delete plan.videos_sold
  await admin.from('experiences').update({ agreed_plan: plan }).eq('id', E3)
  ok('roster lock when the plan has no "videos sold": refused (was ok-by-default)', said(await op.rpc('experience_console_roster_lock', { p_experience_id: E3 }), /does not add up/))
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
  const left = await admin.from('experiences').select('id').like('title', '[bound-test]%')
  const files = uploaded.length ? (await admin.storage.from('deliverables').list(uploaded[0].split('/').slice(0, 2).join('/'))).data ?? [] : []
  ok('cleanup: nothing left behind (Experiences, staff grants, files)', (left.data ?? []).length === 0 && files.length === 0
    && ((await admin.from('staff_access').select('user_id').in('user_id', grants.length ? grants : ['00000000-0000-0000-0000-000000000000'])).data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
