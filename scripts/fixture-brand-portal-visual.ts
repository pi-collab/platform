/**
 * Visual-check fixture for 0544 (Phase 6, the brand's own screens), on STAGING,
 * through the real database functions, for ONE brand admin:
 *   P: price ready (Guapd's open quote)
 *   R: creators to review (3 on the roster, pending)
 *   D: deliverables to review (2 shared, one approved via Guapd)
 *   C: complete, with the report
 * Two temporary staff grants (OP operational, FIN financial). Nothing is sent
 * to anyone (database functions only; no action code, so no notifications).
 *
 *   create:  NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-brand-portal-visual.ts
 *   remove:  … scripts/fixture-brand-portal-visual.ts --cleanup
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
const PREFIX = '[visual-6]'
const STATE = path.join(os.tmpdir(), 'guapd-fixture-brand-portal-visual.json')

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
  const { data: exps } = await admin.from('experiences').select('id').like('title', `${PREFIX}%`)
  for (const e of exps ?? []) {
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = (legs ?? []).map((l) => l.id)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', e.id)
    await admin.from('experience_leg_counters').delete().eq('experience_id', e.id)
    if (ids.length) { await admin.from('notifications').delete().in('deal_id', ids); await admin.from('events').delete().in('deal_id', ids); await admin.from('deals').delete().in('id', ids) }
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', e.id)
    await admin.from('experience_quotes').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').delete().eq('experience_id', e.id)
    await admin.from('experiences').delete().eq('id', e.id)
  }
  if (st.createdRates?.length) await admin.from('creator_products').delete().in('id', st.createdRates)
  for (const g of st.grants ?? []) {
    if (st.startedAt) await admin.from('ops_events').delete().eq('actor_auth_id', g.auth).gte('created_at', st.startedAt)
    await admin.from('staff_access').delete().eq('user_id', g.id)
  }
  if (st.startedAt && st.brandAuth) await admin.from('ops_events').delete().eq('actor_auth_id', st.brandAuth).gte('created_at', st.startedAt)
  const left = (await admin.from('experiences').select('id').like('title', `${PREFIX}%`)).data ?? []
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE)
  console.log(left.length ? `LEFT BEHIND: ${left.length} Experiences` : 'fixture removed, nothing left')
}

async function create() {
  const startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, is_admin, users(auth_id), brands(is_guapd, brand_status, name)').limit(120)
  const B = ((bm ?? []) as any[]).find((m) => m.users?.auth_id && m.is_admin && m.brands?.is_guapd === false && m.brands?.brand_status === 'approved')
  const { data: cr } = await admin.from('creators').select('id, handle, full_name').eq('is_guapd', false).eq('is_bookable', true).not('handle', 'is', null).limit(40)
  const [K1, K2, K3] = (cr ?? []) as any[]
  const { data: access } = await admin.from('staff_access').select('user_id')
  const { data: allMembers } = await admin.from('brand_members').select('user_id')
  const { data: creatorUsers } = await admin.from('creators').select('user_id').not('user_id', 'is', null)
  const busy = new Set([...(access ?? []).map((a) => a.user_id), ...(allMembers ?? []).map((m) => m.user_id), ...(creatorUsers ?? []).map((c) => c.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP, FIN] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !K1 || !K2 || !K3 || !OP || !FIN) throw new Error('missing actors')
  const { data: had } = await admin.from('creator_products').select('id').in('creator_id', [K1.id, K2.id]).eq('pricing_type', 'per_day')
  if ((had ?? []).length) throw new Error('ABORT: these creators already have day-rate rows')
  const state: any = { startedAt, createdRates: [], grants: [{ id: OP.id, auth: OP.auth_id }, { id: FIN.id, auth: FIN.auth_id }], brandAuth: B.users.auth_id }
  fs.writeFileSync(STATE, JSON.stringify(state))
  must(await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }]), 'grant')
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id), brand = await sessionFor(B.users.auth_id)

  const req = (title: string) => brand.rpc('brand_experience_request', {
    p_title: `${PREFIX} ${title}`, p_creator_count: 2, p_deliverables: [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 2 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: true, p_ad_rights_per_creator: null, p_ad_rights_months: 6,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: '2026-11-15', p_date_to: '2026-11-30',
    p_brief: 'Festive skincare routine, warm light, no competitor products in frame.' })
  const quote = (E: string, date: string) => fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 2, p_misc_paise: 1500000, p_deliverables: [], p_shoot_date: date, p_shoot_city: 'Mumbai', p_message: 'Two creators, one shoot day in Bandra. Stories included in extras.', p_channel: null })
  const toRoster = async (E: string, date: string) => {
    const q = must(await quote(E, date), 'quote') as string
    must(await brand.rpc('brand_experience_quote_answer', { p_quote_id: q, p_accept: true, p_note: null }), 'accept')
    must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1.id, K2.id, K3.id], p_added_by: 'guapd', p_channel: null }), 'roster')
  }

  const P = must(await req('Diwali skincare UGC'), 'P') as string
  must(await quote(P, '2026-11-20'), 'quote P')

  const R = must(await req('Winter launch'), 'R') as string
  await toRoster(R, '2026-12-05')

  const shot = async (title: string) => {
    const E = must(await req(title), title) as string
    await toRoster(E, '2026-10-01')
    const rows = must(await brand.rpc('brand_experience_roster', { p_experience_id: E }), 'roster') as any
    for (const c of rows.creators as any[]) must(await brand.rpc('brand_experience_roster_decide', { p_roster_id: c.roster_id, p_decision: c.full_name === K3.full_name ? 'rejected' : 'accepted', p_expected: 'pending' }), 'decide')
    must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
    if (!state.createdRates.length) {
      for (const k of [K1, K2]) state.createdRates.push(must(await op.rpc('experience_console_set_day_rate', { p_creator_id: k.id, p_day_rate_paise: 1000000 }), 'rate'))
      fs.writeFileSync(STATE, JSON.stringify(state))
    }
    const legs = (must(await op.rpc('experience_console_legs', { p_experience_id: E }), 'legs') as any[]).filter((l) => [K1.id, K2.id].includes(l.creator_id))
    const deals: string[] = []
    for (const l of legs) {
      must(await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 2 }], p_affiliate_count: 0, p_entered_rate_paise: null }), 'draft')
      const t = creatorLegTerms({ dayRatePaise: 1000000, days: 1, track: l.track })
      deals.push(must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send') as string)
    }
    await admin.from('deals').update({ status: 'agreed' }).in('id', deals)
    must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E }), 'schedule')
    for (const l of legs) must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: l.roster_id, p_outcome: 'done', p_reason: null }), 'outcome')
    const dv = must(await op.rpc('experience_console_deliverables', { p_experience_id: E }), 'dv') as any
    const ids: string[] = []
    for (const leg of dv.legs as any[]) for (const it of leg.items as any[]) {
      if (it.label !== 'UGC video' && !/Story 1$/.test(it.label) && it.label !== 'Story 1') continue
      must(await op.rpc('experience_console_item_attach', { p_item_id: it.id, p_url: `https://drive.google.com/file/d/visual-${it.id.slice(0, 8)}`, p_storage_path: null, p_file_name: null }), 'attach')
      must(await fin.rpc('experience_console_item_review', { p_item_id: it.id, p_decision: 'approve', p_note: null }), 'review')
      ids.push(it.id)
    }
    must(await op.rpc('experience_console_release', { p_experience_id: E, p_item_ids: ids }), 'release')
    return E
  }

  const D = await shot('Monsoon haircare')
  const bd = must(await brand.rpc('brand_experience_deliverables', { p_experience_id: D }), 'bd') as any
  const first = (bd.items as any[])[0]
  if (first) must(await op.rpc('experience_console_release_decide', { p_release_id: first.release_id, p_decision: 'approved', p_channel: 'email', p_note: null }), 'staff approve')

  const C = await shot('Summer sunscreen')
  const bc = must(await brand.rpc('brand_experience_deliverables', { p_experience_id: C }), 'bc') as any
  for (const i of bc.items as any[]) must(await brand.rpc('brand_experience_release_decide', { p_release_id: i.release_id, p_decision: 'approved', p_note: null, p_expected: 'new' }), 'approve')
  must(await brand.rpc('brand_experience_signoff', { p_experience_id: C, p_note: 'Lovely work' }), 'signoff')
  await admin.from('experiences').update({ status: 'complete', guapd_signoff_at: new Date().toISOString(), guapd_signoff_by: OP.id }).eq('id', C)

  console.log(JSON.stringify({ brandUser: B.user_id, brand: B.brands.name, P, R, D, C, OP: OP.id }))
}

(process.argv.includes('--cleanup') ? cleanup() : create()).catch(async (e) => { console.error(e); process.exitCode = 1 })
