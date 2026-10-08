/**
 * Visual-check fixture for 0538 (shoot + deliverables + the brand page), on
 * STAGING. Two temporary staff (operational-only for the console, financial
 * only to agree the price), two Experiences:
 *   A: Guapd provides (the approved template). Delivering, three creators
 *      (two shot, one did not), items in every state, some shared with the
 *      brand (approved / awaiting / changes asked), some not.
 *   B: creator-submit. One creator, shoot done, one item with "changes asked".
 *
 *   create:  NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-deliverables-visual.ts
 *   remove:  … scripts/fixture-deliverables-visual.ts --cleanup
 *
 * Prints the ids needed to mint local sessions. Nothing is sent to anyone
 * (database functions only; no action code, so no notifications).
 */
import * as fs from 'fs'
import * as os from 'os'
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
const PREFIX = '[visual-3d]'
const STATE = path.join(os.tmpdir(), 'guapd-fixture-deliverables-visual.json')
// 1×1 PNG, standing in for a delivered file.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session (auth rate limit?)')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }

async function cleanup() {
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
  if (st.files?.length) await admin.storage.from('deliverables').remove(st.files)
  const { data: exps } = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  for (const e of exps ?? []) {
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = (legs ?? []).map((l) => l.id)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', e.id)
    if (ids.length) { await admin.from('notifications').delete().in('deal_id', ids); await admin.from('deals').delete().in('id', ids) }
    await admin.from('experiences').delete().eq('id', e.id)
  }
  for (const id of st.createdRates ?? []) await admin.from('creator_products').delete().eq('id', id)
  for (const p of st.priorRates ?? []) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of st.grants ?? []) {
    if (st.startedAt) await admin.from('ops_events').delete().eq('actor_auth_id', g.auth).gte('created_at', st.startedAt)
    await admin.from('staff_access').delete().eq('user_id', g.id)
  }
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE)
  console.log('fixture removed')
}

async function create() {
  const startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd, name)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(40)
  const withLogin = ((cr ?? []) as any[]).filter((c) => c.users?.auth_id)
  const [C1, C2, C3] = withLogin
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B.user_id, ...(access ?? []).map((a) => a.user_id), ...((cr ?? []) as any[]).map((c) => c.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id, email').not('auth_id', 'is', null).not('email', 'is', null).limit(160)
  const [FIN, OP] = (users ?? []).filter((u: any) => !busy.has(u.id) && !String(u.email).endsWith('auth.guapd.internal')) as any[]
  must(await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }, { user_id: OP.id, experiences_operational: true, experiences_financial: false }]), 'grant')
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [C1.id, C2.id, C3.id]).eq('pricing_type', 'per_day')
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [C1.id, C2.id, C3.id]).eq('pricing_type', 'per_day')
  const state: any = { startedAt, priorRates: had ?? [], createdRates: [], files: [], grants: [{ id: FIN.id, auth: FIN.auth_id }, { id: OP.id, auth: OP.auth_id }] }
  const save = () => fs.writeFileSync(STATE, JSON.stringify(state))
  save()
  const fin = await sessionFor(FIN.auth_id), op = await sessionFor(OP.auth_id)

  async function build(title: string, creators: { id: string; rate: number }[], per: { type: string; count: number }[], settings?: Record<string, unknown>) {
    const E = must(await op.rpc('experience_console_create', {
      p_brand_id: B.brand_id, p_title: title, p_creator_count: creators.length, p_deliverables: per,
      p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
      p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' }), 'create') as string
    if (settings) {
      const { data: e } = await admin.from('experiences').select('settings_snapshot').eq('id', E).single()
      await admin.from('experiences').update({ settings_snapshot: { ...(e!.settings_snapshot as object), ...settings } }).eq('id', E)
    }
    const videos = per.filter((d) => d.type === 'UGC video').reduce((t, d) => t + d.count, 0) * creators.length
    const q = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: videos, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-21', p_shoot_city: 'Mumbai', p_message: null, p_channel: null }), 'quote')
    must(await fin.rpc('experience_console_accept', { p_quote_id: q, p_channel: 'email' }), 'accept')
    must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: creators.map((c) => c.id), p_added_by: 'guapd', p_channel: null }), 'roster')
    const roster = must(await op.rpc('experience_console_roster', { p_experience_id: E }), 'roster read') as any[]
    for (const r of roster) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
    must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
    for (const c of creators) { const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: c.id, p_day_rate_paise: c.rate }); if (s.data && !state.createdRates.includes(s.data)) state.createdRates.push(s.data) }
    save()
    const legs = must(await op.rpc('experience_console_legs', { p_experience_id: E }), 'legs') as any[]
    const deal: Record<string, string> = {}, ros: Record<string, string> = {}
    for (const l of legs) {
      await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: per, p_affiliate_count: 0 })
      const t = creatorLegTerms({ dayRatePaise: Number(l.day_rate_paise), days: 1, track: l.track })
      deal[l.creator_id] = must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send') as string
      ros[l.creator_id] = l.roster_id
    }
    await admin.from('deals').update({ status: 'agreed', agreed_at: new Date().toISOString() }).in('id', Object.values(deal))
    must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), 'schedule')
    await admin.from('experiences').update({ shoot_date: '2026-10-05' }).eq('id', E)
    return { E, deal, ros }
  }
  const itemsOf = async (dealId: string) => ((await admin.from('deal_deliverable_items').select('id, label').eq('deal_id', dealId).order('created_at').order('label')).data ?? []) as { id: string; label: string }[]
  const attach = async (id: string, url: string) => must(await op.rpc('experience_console_item_attach', { p_item_id: id, p_url: url, p_storage_path: null, p_file_name: null }), 'attach')
  const approve = async (id: string) => must(await op.rpc('experience_console_item_review', { p_item_id: id, p_decision: 'approve', p_note: null }), 'approve')
  const relId = async (itemId: string) => ((await admin.from('experience_deliverable_releases').select('id').eq('item_id', itemId).eq('status', 'shared').single()).data!.id)

  // ── A: Guapd provides ──
  const A = await build(`${PREFIX} Diwali UGC shoot`, [{ id: C1.id, rate: 1000000 }, { id: C2.id, rate: 800000 }, { id: C3.id, rate: 600000 }],
    [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }])
  must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: A.ros[C1.id], p_outcome: 'done', p_reason: null }), 'outcome C1')
  must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: A.ros[C2.id], p_outcome: 'done', p_reason: null }), 'outcome C2')
  must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: A.ros[C3.id], p_outcome: 'did_not_shoot', p_reason: 'Fell ill on the day' }), 'outcome C3')
  const c1 = await itemsOf(A.deal[C1.id]), c2 = await itemsOf(A.deal[C2.id])
  const pick = (xs: { id: string; label: string }[], l: string) => xs.find((x) => x.label === l)!.id
  await attach(pick(c1, 'UGC video 1'), 'https://drive.google.com/file/d/diwali-c1-ugc1/view'); await approve(pick(c1, 'UGC video 1'))
  await attach(pick(c1, 'UGC video 2'), 'https://drive.google.com/file/d/diwali-c1-ugc2/view'); await approve(pick(c1, 'UGC video 2'))
  await attach(pick(c1, 'Story'), 'https://drive.google.com/file/d/diwali-c1-story/view')
  // C2's first video: a file, shared, brand asks for changes, Guapd re-attaches v2 and approves (ready to re-share).
  const slot = must(await op.rpc('experience_console_item_upload_slot', { p_item_id: pick(c2, 'UGC video 1'), p_file_name: 'C2 cut v1.png' }), 'slot') as string
  must(await admin.storage.from('deliverables').upload(slot, PNG, { contentType: 'image/png' }), 'upload'); state.files.push(slot); save()
  must(await op.rpc('experience_console_item_attach', { p_item_id: pick(c2, 'UGC video 1'), p_url: null, p_storage_path: slot, p_file_name: 'C2 cut v1.png' }), 'attach file')
  await approve(pick(c2, 'UGC video 1'))
  await attach(pick(c2, 'Story'), 'https://drive.google.com/file/d/diwali-c2-story/view'); await approve(pick(c2, 'Story'))
  must(await op.rpc('experience_console_release', { p_experience_id: A.E, p_item_ids: [pick(c1, 'UGC video 1'), pick(c1, 'UGC video 2'), pick(c2, 'UGC video 1')] }), 'release')
  must(await op.rpc('experience_console_release_decide', { p_release_id: await relId(pick(c1, 'UGC video 1')), p_decision: 'approved', p_channel: 'whatsapp', p_note: null }), 'decide 1')
  must(await op.rpc('experience_console_release_decide', { p_release_id: await relId(pick(c2, 'UGC video 1')), p_decision: 'changes_requested', p_channel: 'email', p_note: 'Logo bigger in the first 3 seconds' }), 'decide 2')
  must(await op.rpc('experience_console_item_review', { p_item_id: pick(c2, 'UGC video 1'), p_decision: 'revision', p_note: 'Brand: logo bigger in the first 3 seconds' }), 'revision')
  await attach(pick(c2, 'UGC video 1'), 'https://drive.google.com/file/d/diwali-c2-ugc1-v2/view'); await approve(pick(c2, 'UGC video 1'))

  // ── B: creator submits ──
  const Bx = await build(`${PREFIX} Creator-submit reel`, [{ id: C1.id, rate: 1000000 }], [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 1 }],
    { deliverables_owner: 'creator', completion_trigger: 'on_delivery_accepted' })
  must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: Bx.ros[C1.id], p_outcome: 'done', p_reason: null }), 'outcome B')
  const b1 = await itemsOf(Bx.deal[C1.id])
  // The creator's own submission, set directly as the fixture (the service role passes the 0534 guard).
  await admin.from('deal_deliverable_items').update({ item_status: 'submitted', external_url: 'https://drive.google.com/file/d/creator-reel-v1/view', submitted_at: new Date().toISOString(), submitted_via: 'creator' }).eq('id', pick(b1, 'UGC video'))
  must(await op.rpc('experience_console_item_review', { p_item_id: pick(b1, 'UGC video'), p_decision: 'revision', p_note: 'Brighter lighting, and show the shade swatch up close' }), 'revision B')

  save()
  console.log(JSON.stringify({ A: A.E, B: Bx.E, c1Leg: A.deal[C1.id], c1LegB: Bx.deal[C1.id], creator: C1.id, brandUser: B.user_id, op: { id: OP.id, email: OP.email } }))
}

;(process.argv.includes('--cleanup') ? cleanup() : create()).catch((e) => { console.error(e); process.exit(1) })
