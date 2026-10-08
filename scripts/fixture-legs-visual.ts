/**
 * A visual-check fixture for Experience creator legs, on STAGING: one
 * Experience with a leg SENT to a Growth creator (₹10,000/day × 2 days) and a
 * second creator's leg drafted but not sent, so the creator view and the staff
 * console both have something real to show.
 *
 *   create:  NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-legs-visual.ts
 *   remove:  … scripts/fixture-legs-visual.ts --cleanup
 *
 * Prints the creator's phone (log in with the staging bypass code) and the
 * deal URL. Uses a temporary staff grant for one user, removed on cleanup.
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
const TITLE = '[visual] Diwali UGC shoot'
const STATE = path.resolve(__dirname, '../scratch/fixture-legs-visual.json')

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function cleanup() {
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
  const { data: exps } = await admin.from('experiences').select('id').eq('title', TITLE)
  for (const e of exps ?? []) {
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = (legs ?? []).map((l) => l.id)
    await admin.from('experience_roster').update({ leg_deal_id: null }).eq('experience_id', e.id)
    if (ids.length) { await admin.from('notifications').delete().in('deal_id', ids); await admin.from('deals').delete().in('id', ids) }
    await admin.from('experiences').delete().eq('id', e.id)
  }
  for (const id of st.createdRates ?? []) await admin.from('creator_products').delete().eq('id', id)
  for (const p of st.priorRates ?? []) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  if (st.staffUserId) {
    if (st.startedAt && st.staffAuthId) await admin.from('ops_events').delete().eq('actor_auth_id', st.staffAuthId).gte('created_at', st.startedAt)
    await admin.from('notifications').delete().eq('user_id', st.staffUserId)
    await admin.from('staff_access').delete().eq('user_id', st.staffUserId)
  }
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE)
  console.log('fixture removed')
}

async function create() {
  const startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, users(auth_id), brands(is_guapd, name)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: logged } = await admin.from('creators').select('id, full_name, phone, user_id, vetting_status, users(auth_id)')
    .eq('is_guapd', false).eq('is_bookable', true).not('user_id', 'is', null).not('phone', 'is', null).limit(40)
  const withLogin = (logged ?? []).filter((c: any) => c.users?.auth_id) as any[]
  const G = withLogin.find((c) => c.vetting_status === 'growth')
  const D = withLogin.find((c) => c.vetting_status !== 'growth')
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([G.user_id, D.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(120)
  const STAFF = (users ?? []).find((u: any) => !busy.has(u.id)) as any
  await admin.from('staff_access').insert({ user_id: STAFF.id, experiences_operational: true, experiences_financial: true })  // quoting is the brand price: finance only (0537)
  const staff = await sessionFor(STAFF.auth_id)

  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  const state: any = { startedAt, staffUserId: STAFF.id, staffAuthId: STAFF.auth_id, priorRates: had ?? [], createdRates: [] }
  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify(state))

  const c = await staff.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: TITLE, p_creator_count: 2,
    p_deliverables: [{ type: 'UGC video', count: 5 }, { type: 'Story', count: 2 }],
    p_affiliate: true, p_affiliate_per_creator: 5, p_ad_rights: true, p_ad_rights_per_creator: 3, p_ad_rights_months: 6,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null,
    p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error(c.error.message)
  const E = c.data as string
  const q = await staff.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 350000, p_deliverable_count: 10, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-14', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await staff.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id], p_added_by: 'guapd', p_channel: null })
  const roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  const RG = roster.find((r) => r.creator_id === G.id).id, RD = roster.find((r) => r.creator_id === D.id).id
  for (const r of [RG, RD]) await staff.rpc('experience_console_roster_decide', { p_roster_id: r, p_decision: 'accepted', p_channel: 'email' })
  await staff.rpc('experience_console_roster_lock', { p_experience_id: E })
  await staff.rpc('experience_console_set_creator_brief', { p_experience_id: E, p_brief: 'A two-day studio shoot in Bandra for the festive range.\nArrive 9am; bring two festive outfits and one everyday look. Hair and make-up are on set.' })

  const r1 = await staff.rpc('experience_console_set_day_rate', { p_creator_id: G.id, p_day_rate_paise: 1000000 })
  const r2 = await staff.rpc('experience_console_set_day_rate', { p_creator_id: D.id, p_day_rate_paise: 800000 })
  state.createdRates = [r1.data, r2.data]; fs.writeFileSync(STATE, JSON.stringify(state))
  await staff.rpc('experience_console_leg_draft', { p_roster_id: RG, p_product_id: r1.data, p_days: 2, p_deliverables: [{ type: 'UGC video', count: 5 }, { type: 'Story', count: 2 }], p_affiliate_count: 5 })
  await staff.rpc('experience_console_leg_draft', { p_roster_id: RD, p_product_id: r2.data, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 5 }, { type: 'Story', count: 2 }], p_affiliate_count: 5 })
  const t = creatorLegTerms({ dayRatePaise: 1000000, days: 2, track: 'growth' })
  const s = await staff.rpc('experience_console_leg_send', { p_roster_id: RG, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
  if (s.error) throw new Error(s.error.message)
  console.log(JSON.stringify({ experience: E, creator: G.full_name, phone: G.phone, deal: s.data, brand: B.brands.name }, null, 2))
}

;(process.argv.includes('--cleanup') ? cleanup() : create()).catch((e) => { console.error(e); process.exit(1) })
