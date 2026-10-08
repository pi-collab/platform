/**
 * Visual-check fixture for stage 3c (cost sheet + P&L), on STAGING.
 * Two temporary staff (one financial, one operational-only), one Experience
 * with two accepted creator legs, one awaiting, costs and an issued invoice.
 *
 *   create:  NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-costs-visual.ts
 *   remove:  … scripts/fixture-costs-visual.ts --cleanup
 *
 * Prints the two staff emails (for a local OPS_ALLOWED_EMAILS override) and
 * their user ids (for minting local sessions). Nothing is sent to anyone.
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
const TITLE = '[visual-3c] Festive UGC shoot'
const STATE = path.resolve(__dirname, '../scratch/fixture-costs-visual.json')

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session (auth rate limit?)')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function cleanup() {
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
  const { data: exps } = await admin.from('experiences').select('id').eq('title', TITLE)
  for (const e of exps ?? []) {
    const { data: legs } = await admin.from('deals').select('id').eq('experience_id', e.id)
    const ids = (legs ?? []).map((l) => l.id)
    await admin.from('experience_roster').update({ leg_deal_id: null }).eq('experience_id', e.id)
    await admin.from('service_invoices').delete().eq('experience_id', e.id)
    await admin.from('experience_cost_lines').delete().eq('experience_id', e.id)
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
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status').eq('is_guapd', false).eq('is_bookable', true).limit(30)
  const [C1, C2, C3] = (cr ?? []) as any[]
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B.user_id, ...(access ?? []).map((a) => a.user_id), ...(cr ?? []).map((c: any) => c.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id, email').not('auth_id', 'is', null).not('email', 'is', null).limit(160)
  const cands = (users ?? []).filter((u: any) => !busy.has(u.id) && !String(u.email).endsWith('auth.guapd.internal')) as any[]
  const [FIN, OP] = cands
  await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }, { user_id: OP.id, experiences_operational: true, experiences_financial: false }])
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [C1.id, C2.id, C3.id]).eq('pricing_type', 'per_day')
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [C1.id, C2.id, C3.id]).eq('pricing_type', 'per_day')
  const state: any = { startedAt, priorRates: had ?? [], createdRates: [], grants: [{ id: FIN.id, auth: FIN.auth_id }, { id: OP.id, auth: OP.auth_id }] }
  fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state))
  const fin = await sessionFor(FIN.auth_id)

  const c = await fin.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: TITLE, p_creator_count: 3, p_deliverables: [{ type: 'UGC video', count: 2 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' })
  if (c.error) throw new Error(c.error.message)
  const E = c.data as string
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: 6, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-21', p_shoot_city: 'Mumbai', p_message: 'Festive pricing', p_channel: null })
  await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  await fin.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [C1.id, C2.id, C3.id], p_added_by: 'guapd', p_channel: null })
  const roster = ((await fin.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  for (const r of roster) await fin.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  await fin.rpc('experience_console_roster_lock', { p_experience_id: E })
  const rates = [1000000, 800000, 600000]
  for (const [i, cId] of [C1.id, C2.id, C3.id].entries()) { const s = await fin.rpc('experience_console_set_day_rate', { p_creator_id: cId, p_day_rate_paise: rates[i] }); state.createdRates.push(s.data) }
  fs.writeFileSync(STATE, JSON.stringify(state))
  const legs = ((await fin.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const deals: string[] = []
  for (const l of legs) {
    const dayCount = l.creator_id === C1.id ? 2 : 1
    await fin.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: dayCount, p_deliverables: [{ type: 'UGC video', count: 2 }], p_affiliate_count: 0 })
    const t = creatorLegTerms({ dayRatePaise: Number(l.day_rate_paise), days: dayCount, track: l.track })
    const s = await fin.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise })
    if (s.error) throw new Error('send: ' + s.error.message)
    deals.push(s.data as string)
  }
  await admin.from('deals').update({ status: 'agreed' }).in('id', deals.slice(0, 2))   // two accepted, one awaiting
  const cost = (label: string, category: string, extra: Record<string, unknown>) => fin.rpc('experience_console_cost_add', {
    p_experience_id: E, p_label: label, p_category: category, p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null,
    p_total_paise: 0, p_provided_by: 'guapd', p_creator_leg_deal_id: null, p_note: null, ...extra })
  await cost('Makeup artist, day 1', 'makeup', { p_total_paise: 900000 })
  await cost('Studio, Bandra', 'studio', { p_basis: 'per_unit', p_quantity: 2, p_unit_rate_paise: 450000, p_total_paise: 900000 })
  await cost('Festive outfits', 'styling', { p_total_paise: 300000, p_provided_by: 'brand', p_note: 'Brand sends their range' })
  await fixtureInvoice(admin, { experienceId: E, brandId: B.brand_id, kind: 'initial', subtotalPaise: 21000000, status: 'issued' })
  console.log(JSON.stringify({ experience: E, fin: { id: FIN.id, email: FIN.email }, op: { id: OP.id, email: OP.email } }))
}

;(process.argv.includes('--cleanup') ? cleanup() : create()).catch((e) => { console.error(e); process.exit(1) })
