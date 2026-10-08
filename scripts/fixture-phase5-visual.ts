/**
 * Visual-check fixture for 0542 (Phase 5), on STAGING, through the real database functions:
 *   E1 (offers out): G countered UP (finance must accept); D countered, Guapd declined and countered
 *   back lower (D sees "Accept Guapd's offer"); X paused their rate, so a rate is entered on the deal.
 *   E2 (shot): G has bank details on file, payout requested by ops, then G changed the details
 *   (flagged); D's payout requested by ops and approved by finance (no bank details on file).
 * Two temporary staff: financial (FIN) and operational-only (OP). Test bank numbers only.
 *
 *   create:  NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/fixture-phase5-visual.ts
 *   remove:  … scripts/fixture-phase5-visual.ts --cleanup
 *
 * Nothing is sent to anyone (database functions only; no action code, so no notifications or emails).
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
const PREFIX = '[visual-5]'
const STATE = path.join(os.tmpdir(), 'guapd-fixture-phase5-visual.json')

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
    await admin.from('vendor_payouts').delete().eq('experience_id', e.id)
    await admin.from('experience_leg_counters').delete().eq('experience_id', e.id)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', e.id)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', e.id)
    if (ids.length) { await admin.from('notifications').delete().in('deal_id', ids); await admin.from('events').delete().in('deal_id', ids); await admin.from('deals').delete().in('id', ids) }
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', e.id)
    await admin.from('experience_cost_lines').delete().eq('experience_id', e.id)
    await admin.from('experiences').delete().eq('id', e.id)
  }
  for (const v of st.detailVendors ?? []) { await admin.from('vendor_payout_detail_changes').delete().eq('vendor_id', v); await admin.from('vendor_payout_details').delete().eq('vendor_id', v) }
  if (st.newVendorCreators?.length) await admin.from('vendors').delete().in('creator_id', st.newVendorCreators)
  for (const id of st.createdRates ?? []) await admin.from('creator_products').delete().eq('id', id)
  for (const p of st.priorRates ?? []) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of st.grants ?? []) {
    if (st.startedAt) await admin.from('ops_events').delete().eq('actor_auth_id', g.auth).gte('created_at', st.startedAt)
    await admin.from('staff_access').delete().eq('user_id', g.id)
  }
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE)
  console.log('fixture removed')
}

async function newExperience(op: SupabaseClient, fin: SupabaseClient, brandId: string, title: string, ids: string[], shootDate: string) {
  const E = must(await op.rpc('experience_console_create', {
    p_brand_id: brandId, p_title: title, p_creator_count: ids.length, p_deliverables: [{ type: 'UGC video', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email' }), 'create') as string
  const q = must(await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3500000, p_deliverable_count: ids.length, p_misc_paise: 0, p_deliverables: [], p_shoot_date: shootDate, p_shoot_city: 'Mumbai', p_message: null, p_channel: null }), 'quote')
  must(await fin.rpc('experience_console_accept', { p_quote_id: q, p_channel: 'email' }), 'accept')
  must(await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: ids, p_added_by: 'guapd', p_channel: null }), 'roster')
  for (const r of must(await op.rpc('experience_console_roster', { p_experience_id: E }), 'roster read') as any[]) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  must(await op.rpc('experience_console_roster_lock', { p_experience_id: E }), 'lock')
  return E
}

async function create() {
  const startedAt = new Date().toISOString()
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd, name)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.users?.auth_id)
  const X = pool.find((c) => c.id !== G?.id && c.id !== D?.id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id, email').not('auth_id', 'is', null).not('email', 'is', null).limit(200)
  const [FIN, OP] = (users ?? []).filter((u: any) => !busy.has(u.id) && /@/.test(u.email)) as any[]
  if (!B || !G || !D || !X || !FIN || !OP) throw new Error('missing actors')
  const { count } = await admin.from('vendor_payout_details').select('vendor_id', { count: 'exact', head: true })
  if (count !== 0) throw new Error('ABORT: payout details already exist on staging')

  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id, X.id]).eq('pricing_type', 'per_day')
  if ((had ?? []).length) throw new Error('ABORT: these creators already have day-rate rows; the fixture would read as a pause')
  const { data: hadV } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id, X.id])
  const state: any = { startedAt, priorRates: [], createdRates: [], detailVendors: [],
    newVendorCreators: [G.id, D.id, X.id].filter((id) => !(hadV ?? []).some((v: any) => v.creator_id === id)),
    grants: [{ id: FIN.id, auth: FIN.auth_id }, { id: OP.id, auth: OP.auth_id }] }
  fs.writeFileSync(STATE, JSON.stringify(state))
  must(await admin.from('staff_access').insert([{ user_id: FIN.id, experiences_operational: true, experiences_financial: true }, { user_id: OP.id, experiences_operational: true, experiences_financial: false }]), 'grant')
  const fin = await sessionFor(FIN.auth_id), op = await sessionFor(OP.auth_id), cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)

  for (const [c, rate] of [[G, 1000000], [D, 800000], [X, 600000]] as const) {
    const s = must(await op.rpc('experience_console_set_day_rate', { p_creator_id: c.id, p_day_rate_paise: rate }), 'rate') as string
    state.createdRates.push(s)
  }
  await admin.from('creator_products').update({ is_active: false }).eq('id', state.createdRates[2])   // X pauses their rate
  fs.writeFileSync(STATE, JSON.stringify(state))

  // E1: offers out. G countered UP (needs finance); Guapd countered D lower; X paused → rate entered on the deal, not yet sent.
  const E1 = await newExperience(op, fin, B.brand_id, `${PREFIX} Kiro Beauty · Diwali UGC`, [G.id, D.id, X.id], '2026-11-20')
  const deal1: Record<string, string> = {}
  for (const l of must(await op.rpc('experience_console_legs', { p_experience_id: E1 }), 'legs') as any[]) {
    if (l.creator_id === X.id) {
      must(await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: null, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0, p_entered_rate_paise: 650000 }), 'draft X')
      continue
    }
    must(await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 }), 'draft')
    const t = creatorLegTerms({ dayRatePaise: l.creator_id === G.id ? 1000000 : 800000, days: 1, track: l.track })
    deal1[l.creator_id] = must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send') as string
  }
  must(await cG.rpc('creator_leg_counter', { p_deal_id: deal1[G.id], p_day_rate_paise: 1200000, p_days: 1, p_note: 'My day rate went up this month; ₹12,000 is my standard now.' }), 'G counter')
  const dc = must(await cD.rpc('creator_leg_counter', { p_deal_id: deal1[D.id], p_day_rate_paise: 900000, p_days: 1, p_note: 'Travel to Andheri adds a lot.' }), 'D counter') as string
  must(await op.rpc('experience_console_counter_decline', { p_counter_id: dc, p_note: 'Budget is fixed for this one' }), 'decline D')
  must(await op.rpc('experience_console_counter_send', { p_deal_id: deal1[D.id], p_day_rate_paise: 780000, p_days: 1, p_note: 'Could you do ₹7,800? We cover the cab.' }), 'Guapd counter')

  // E2: shot. G and D requested by OP; G has bank details and changed them after the request; D's approved by FIN (no bank details: "not on file").
  const E2 = await newExperience(op, fin, B.brand_id, `${PREFIX} Kiro Beauty · Launch shoot`, [G.id, D.id], '2026-10-01')
  const deal2: Record<string, string> = {}, ros2: Record<string, string> = {}
  for (const l of must(await op.rpc('experience_console_legs', { p_experience_id: E2 }), 'legs 2') as any[]) {
    must(await op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: [{ type: 'UGC video', count: 1 }], p_affiliate_count: 0 }), 'draft 2')
    const t = creatorLegTerms({ dayRatePaise: l.creator_id === G.id ? 1000000 : 800000, days: 1, track: l.track })
    deal2[l.creator_id] = must(await op.rpc('experience_console_leg_send', { p_roster_id: l.roster_id, p_expected_gross_paise: t.creatorGrossPaise, p_expected_platform_pct: t.platformPct, p_expected_net_paise: t.creatorNetPaise }), 'send 2') as string
    ros2[l.creator_id] = l.roster_id
  }
  await admin.from('deals').update({ status: 'agreed' }).in('id', Object.values(deal2))
  must(await op.rpc('experience_console_schedule_shoot', { p_experience_id: E2 }), 'schedule')
  for (const c of [G, D]) must(await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: ros2[c.id], p_outcome: 'done', p_reason: null }), 'outcome')
  must(await cG.rpc('creator_set_payout_details', { p_holder: G.full_name ?? 'Test Creator', p_account: '501004433221', p_account_confirm: '501004433221', p_ifsc: 'HDFC0001234', p_pan: 'ABCPK1234Q', p_gst_registered: false }), 'G bank')
  state.detailVendors.push((await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id)
  fs.writeFileSync(STATE, JSON.stringify(state))
  must(await op.rpc('experience_console_payout_request', { p_deal_id: deal2[G.id], p_tds_paise: 0 }), 'request G')
  const PD = must(await op.rpc('experience_console_payout_request', { p_deal_id: deal2[D.id], p_tds_paise: 0 }), 'request D') as string
  must(await fin.rpc('experience_console_payout_approve', { p_payout_id: PD }), 'approve D')
  await new Promise((r) => setTimeout(r, 1100))
  must(await cG.rpc('creator_set_payout_details', { p_holder: G.full_name ?? 'Test Creator', p_account: '918273645500', p_account_confirm: '918273645500', p_ifsc: 'ICIC0004321', p_pan: 'ABCPK1234Q', p_gst_registered: false }), 'G bank change')
  console.log(JSON.stringify({ E1, E2, FIN: FIN.id, OP: OP.id, G: G.user_id, D: D.user_id, dealG: deal1[G.id], dealD: deal1[D.id] }))
}

;(process.argv.includes('--cleanup') ? cleanup() : create()).catch((e) => { console.error(e); process.exit(1) })
