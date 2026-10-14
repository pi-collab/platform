/**
 * 0546, Experiences Phase 6.1, against STAGING with real sessions. Proves:
 *   A. the campaign-style brief: shared or a creator's own; each creator sees
 *      ONLY their own (theirs, else the shared one); attachments only from the
 *      Experience's folder; editable until the shoot is confirmed, then locked;
 *      the "who to tell" list is exactly the sent creators on that brief;
 *   B. per-creator affiliate / ad rights / boost, checked against what the
 *      brand bought and frozen at send; the ALLOWANCE is paid in full, outside
 *      the fee: gross / fee % / net stay day rate × days exactly (fee maths
 *      unchanged), the allowance rides beside them on the terms, the payout and
 *      the P&L (once, as its own line; a duplicate 'travel' cost is refused),
 *      and never reaches the brand;
 *   C. Guapd ↔ creator messages: the creator writes through their own function,
 *      staff through the console; RLS lets ONLY the leg's creator read the
 *      thread; the brand, another creator, staff-by-RLS, logged-out and the
 *      service role (via functions) get nothing; the house brand can never gain
 *      a member; audit rows carry lengths, never text.
 * NULL means no throughout. Leaves staging exactly as it found it.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-experience-brief-messages.ts
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
import { creatorLegTerms, experienceMargin } from '../apps/web/lib/experience-money'

/** 0552: the creator confirms the shoot and raises their invoice before Guapd requests the payout. */
/** 0561 fixture: n of the deal's videos released, brand-approved and posted as collabs (rows written directly; the flow is tested in test-experience-collab.ts). */
async function postCollabsFixture(exp: string, deal: string, n: number) {
  const { data: its } = await admin.from('deal_deliverable_items').select('id, label').eq('deal_id', deal).is('extra_id', null).order('label').limit(n)
  const { data: d } = await admin.from('deals').select('creator_id').eq('id', deal).single()
  for (const [k, it] of ((its ?? []) as any[]).entries()) {
    const r = await admin.from('experience_deliverable_releases').insert({ experience_id: exp, deal_id: deal, item_id: it.id, item_version: 1, label: it.label,
      external_url: `https://drive.example.com/${it.id}`, brand_decision: 'approved', brand_decision_channel: 'email', brand_decided_at: new Date().toISOString() }).select('id').single()
    if (r.error) throw new Error('fixture release: ' + r.error.message)
    const p = await admin.from('experience_collab_posts').insert({ experience_id: exp, deal_id: deal, creator_id: d!.creator_id, release_id: r.data.id, item_id: it.id, label: it.label,
      kind: 'collab', status: 'posted', post_url: `https://www.instagram.com/p/Fx${k}`, posted_at: new Date().toISOString(), post_channel: 'email' })
    if (p.error) throw new Error('fixture post: ' + p.error.message)
  }
}

async function invoiceAs(s: any, deal: string) {
  const c = (await s.rpc('creator_leg_context', { p_deal_id: deal })).data as any
  return s.rpc('creator_leg_invoice_raise', { p_deal_id: deal, p_shoot_confirmed: true, p_billing_name: 'Test Creator', p_gstin: null, p_expected_payable_paise: Number(c?.total_to_creator_paise) })
}

const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
const none0 = '00000000-0000-0000-0000-000000000000'
const exps: string[] = []
const grants: string[] = []
const legDeals: string[] = []
const createdRates: string[] = []
const priorRates: { id: string; price_paise: number; is_active: boolean }[] = []
const newVendorCreators: string[] = []
let startedAt = ''
let staffBefore = -1

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

const MARK_SHARED = 'SHARED-BRIEF-7Q', MARK_OWN = 'OWN-BRIEF-G-4K', MARK_MSG = 'hello-from-G-9Z', MARK_GUAPD = 'reply-from-guapd-3M'
const MONEYISH = /paise|rate|margin|price|net|gross|allowance|fee/i


async function run() {
  startedAt = new Date().toISOString()
  staffBefore = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(60)
  const B = ((bm ?? []) as any[]).filter((m) => m.users?.auth_id && !m.brands?.is_guapd)[0]
  const { data: cr } = await admin.from('creators').select('id, user_id, vetting_status, full_name, users(auth_id)').eq('is_guapd', false).eq('is_bookable', true).limit(60)
  const pool = (cr ?? []) as any[]
  // Creators with a day rate of their own (real staging data) are left alone: this run sets fresh rates.
  { const { data: rated } = await admin.from('creator_products').select('creator_id').eq('pricing_type', 'per_day'); const r = new Set((rated ?? []).map((x: any) => x.creator_id)); pool.splice(0, pool.length, ...pool.filter((c) => !r.has(c.id))) }
  const G = pool.find((c) => c.vetting_status === 'growth' && c.users?.auth_id)
  const D = pool.find((c) => c.id !== G?.id && c.vetting_status !== 'growth' && c.users?.auth_id)
  const { data: access } = await admin.from('staff_access').select('user_id')
  const { data: allMembers } = await admin.from('brand_members').select('user_id')
  const busy = new Set([B?.user_id, G?.user_id, D?.user_id, ...(access ?? []).map((a) => a.user_id), ...(allMembers ?? []).map((m) => m.user_id)])
  // Test staff actors are never creators: a creator login can save its own bank details, list its own deals, etc.
  { const { data: cu } = await admin.from('creators').select('user_id').not('user_id', 'is', null); for (const x of cu ?? []) busy.add((x as any).user_id) } // staff actors are never creators
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(300)
  const [OP, FIN, SPARE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  if (!B || !G || !D || !OP || !FIN || !SPARE) throw new Error('missing test actors')
  const gi = await admin.from('staff_access').insert([{ user_id: OP.id, experiences_operational: true, experiences_financial: false }, { user_id: FIN.id, experiences_operational: true, experiences_financial: true }])
  if (gi.error) throw new Error('grant: ' + gi.error.message)
  grants.push(OP.id, FIN.id)
  const op = await sessionFor(OP.auth_id), fin = await sessionFor(FIN.auth_id)
  const brand = await sessionFor(B.users.auth_id), cG = await sessionFor(G.users.auth_id), cD = await sessionFor(D.users.auth_id)
  const anon = createClient(URL, ANON)
  const { data: hadVendors } = await admin.from('vendors').select('creator_id').in('creator_id', [G.id, D.id])
  newVendorCreators.push(...[G.id, D.id].filter((id) => !(hadVendors ?? []).some((v: any) => v.creator_id === id)))
  const { data: had } = await admin.from('creator_products').select('id, price_paise, is_active').in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')
  priorRates.push(...((had ?? []) as any[]))
  await admin.from('creator_products').update({ is_active: false }).in('creator_id', [G.id, D.id]).eq('pricing_type', 'per_day')

  // 2 creators × 2 UGC videos. Affiliate on 1 each; ad rights on ALL (6 mo); boost on 1 each (3 mo).
  const per = [{ type: 'UGC video', count: 2 }]
  const c = await op.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[61-test] Kiro', p_creator_count: 2, p_deliverables: per,
    p_affiliate: true, p_affiliate_per_creator: 1, p_ad_rights: true, p_ad_rights_per_creator: 2, p_ad_rights_months: 6,
    p_boost: true, p_boost_per_creator: 1, p_boost_months: 3, p_location: 'Mumbai', p_date_from: null, p_date_to: null, p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  const E = c.data as string
  exps.push(E)
  const q = await fin.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 3000000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-20', p_shoot_city: 'Mumbai', p_message: null, p_channel: null, p_affiliate_pct: 10 })
  if (q.error) throw new Error('quote: ' + q.error.message)
  const a = await fin.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })
  if (a.error) throw new Error('accept: ' + a.error.message)
  await op.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [G.id, D.id], p_added_by: 'guapd', p_channel: null })
  for (const r of ((await op.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]) await op.rpc('experience_console_roster_decide', { p_roster_id: r.id, p_decision: 'accepted', p_channel: 'email' })
  const lk = await op.rpc('experience_console_roster_lock', { p_experience_id: E })
  if (lk.error) throw new Error('lock: ' + lk.error.message)
  for (const [id, rate] of [[G.id, 1000000], [D.id, 800000]] as const) {
    const s = await op.rpc('experience_console_set_day_rate', { p_creator_id: id, p_day_rate_paise: rate })
    if (s.data) createdRates.push(s.data as string)
  }
  const legs = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  const lG = legs.find((l) => l.creator_id === G.id), lD = legs.find((l) => l.creator_id === D.id)
  const folder = `experience-briefs/${E}/`

  // ═══ A. The brief ═══
  group('A. the brief: who may write it')
  const shared = { p_experience_id: E, p_pitch: `Shoot day brief ${MARK_SHARED}`, p_guidelines: 'Natural light\nShow the texture', p_avoid: 'Competitor logos', p_attachments: [{ name: 'moodboard.pdf', storage_path: `${folder}mood.pdf`, size_bytes: 1200, content_type: 'application/pdf', extra: 'dropped' }] }
  for (const [n, s] of [['brand', brand], ['creator', cG], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: cannot read or write the brief`, refused(await (s as SupabaseClient).rpc('experience_console_brief', { p_experience_id: E })) && refused(await (s as SupabaseClient).rpc('experience_console_brief_save', shared)))
  }
  const sv = await op.rpc('experience_console_brief_save', shared)
  ok('operational staff save the shared brief', !sv.error, sv.error?.message)
  ok('…before any deal is sent, nobody is told', JSON.stringify((sv.data as any)?.notify_deal_ids) === '[]')
  const bf = (await op.rpc('experience_console_brief', { p_experience_id: E })).data as any
  ok('the brief reads back: brief, guidelines, avoid, editable', bf?.shared?.pitch?.includes(MARK_SHARED) && bf.shared.guidelines.includes('Natural light') && bf.editable === true)
  ok('an attachment keeps only name, path, size and type', JSON.stringify(Object.keys(bf?.shared?.attachments?.[0] ?? {}).sort()) === JSON.stringify(['content_type', 'name', 'size_bytes', 'storage_path']))
  ok('an attachment outside this Experience\'s folder is refused', said(await op.rpc('experience_console_brief_save', { ...shared, p_attachments: [{ name: 'x.pdf', storage_path: `experience-briefs/${none0}/x.pdf` }] }), /folder/))
  ok('a path with .. is refused', said(await op.rpc('experience_console_brief_save', { ...shared, p_attachments: [{ name: 'x.pdf', storage_path: `${folder}../x.pdf` }] }), /folder/))
  ok('more than 10 attachments is refused', said(await op.rpc('experience_console_brief_save', { ...shared, p_attachments: Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.pdf`, storage_path: `${folder}f${i}.pdf` })) }), /10/))
  ok('a brief over 6,000 characters is refused', said(await op.rpc('experience_console_brief_save', { ...shared, p_pitch: 'x'.repeat(6001) }), /too long/))
  const slot = await op.rpc('experience_console_brief_slot', { p_experience_id: E, p_file_name: 'Deck.PDF' })
  ok('the upload slot is inside the Experience\'s folder', typeof slot.data === 'string' && (slot.data as string).startsWith(folder) && (slot.data as string).endsWith('.pdf'))
  ok('an executable file type is refused', said(await op.rpc('experience_console_brief_slot', { p_experience_id: E, p_file_name: 'run.exe' }), /file type/))
  ok('the brand cannot get an upload slot', refused(await brand.rpc('experience_console_brief_slot', { p_experience_id: E, p_file_name: 'a.pdf' })))

  group('A. a creator\'s own brief')
  ok('"own" must be said (NULL is refused)', said(await op.rpc('experience_console_brief_override', { p_roster_id: lG.roster_id, p_own: null, p_pitch: 'x', p_guidelines: null, p_avoid: null, p_attachments: [] }), /own brief/))
  const ov = await op.rpc('experience_console_brief_override', { p_roster_id: lG.roster_id, p_own: true, p_pitch: `For G only ${MARK_OWN}`, p_guidelines: 'Front camera', p_avoid: null, p_attachments: [] })
  ok('G gets their own brief', !ov.error, ov.error?.message)
  ok('the creator cannot set an override', refused(await cG.rpc('experience_console_brief_override', { p_roster_id: lG.roster_id, p_own: true, p_pitch: 'hack', p_guidelines: null, p_avoid: null, p_attachments: [] })))
  const legs2 = ((await op.rpc('experience_console_legs', { p_experience_id: E })).data ?? []) as any[]
  ok('the console marks who has their own brief', legs2.find((l) => l.creator_id === G.id)?.has_own_brief === true && legs2.find((l) => l.creator_id === D.id)?.has_own_brief === false)

  // ═══ B. Scope + allowance ═══
  group('B. per-creator scope and the allowance (draft)')
  const draft = (l: any, x: Record<string, unknown> = {}) => op.rpc('experience_console_leg_draft', { p_roster_id: l.roster_id, p_product_id: l.day_rate_product_id, p_days: 1, p_deliverables: per, p_affiliate_count: 1, p_ad_rights_count: 0, p_boost_count: 0, ...x })
  ok('ad rights on more videos than the creator makes is refused', said(await draft(lG, { p_ad_rights_count: 3 }), /ad rights/))
  ok('a negative boost is refused', said(await draft(lG, { p_boost_count: -1 }), /Boosted/))
  ok('an allowance in paise (not whole rupees) is refused', said(await draft(lG, { p_allowance_paise: 150050 }), /allowance/))
  ok('a negative allowance is refused', said(await draft(lG, { p_allowance_paise: -100 }), /allowance/))
  ok('an allowance over ₹10,00,000 is refused', said(await draft(lG, { p_allowance_paise: 100000100 }), /allowance/))
  ok('boost past what was bought (2 + 1 default = 3 of 2) is refused', said(await draft(lG, { p_boost_count: 2 }), /brand bought/))
  const dg = await draft(lG, { p_ad_rights_count: 2, p_boost_count: 1, p_allowance_paise: 150000 })
  ok('G: 1 affiliate, 2 with ad rights, 1 boosted, ₹1,500 allowance', !dg.error, dg.error?.message)
  const rec = dg.data as any
  ok('reconcile: ad rights target = every video placed (bought "all")', rec?.ad_rights_target === 4 && rec?.ad_rights_placed === 4, JSON.stringify({ t: rec?.ad_rights_target, p: rec?.ad_rights_placed }))
  ok('reconcile: boost 1 per creator × 2 = 2, placed 2', rec?.boost_target === 2 && rec?.boost_placed === 2)
  ok('reconcile: months carried for the screen', rec?.ad_rights_months === 6 && rec?.boost_months === 3)
  ok('0547: a bought right with no per-creator count is refused (never "as agreed" or "all")', said(await draft(lD, { p_ad_rights_count: null }), /ad rights/))
  ok('0547: …the same for boost', said(await draft(lD, { p_ad_rights_count: 2, p_boost_count: null }), /boosted/))
  ok('0547: a send with counts never stated is refused', said(await op.rpc('experience_console_leg_send', { p_roster_id: lD.roster_id, p_expected_gross_paise: 1, p_expected_platform_pct: 15, p_expected_net_paise: 1 }), /Pick the shoot day rate|counts first/))
  ok('D drafted with every count stated (2 ad rights, 1 boosted, no allowance)', !(await draft(lD, { p_ad_rights_count: 2, p_boost_count: 1 })).error)

  group('B. send: the allowance is outside the fee, and frozen')
  const tG = creatorLegTerms({ dayRatePaise: 1000000, days: 1, track: lG.track })
  const sendG = (allow: number | null | undefined) => op.rpc('experience_console_leg_send', { p_roster_id: lG.roster_id, p_expected_gross_paise: tG.creatorGrossPaise, p_expected_platform_pct: tG.platformPct, p_expected_net_paise: tG.creatorNetPaise, ...(allow === undefined ? {} : { p_expected_allowance_paise: allow }) })
  ok('a stale allowance on the screen is refused', said(await sendG(100000), /changed/))
  ok('omitting the allowance when there is one is refused', said(await sendG(undefined), /changed/))
  const sG = await sendG(150000)
  ok('G sent with the allowance the screen showed', !sG.error, sG.error?.message)
  const gLeg = sG.data as string; legDeals.push(gLeg)
  const tD = creatorLegTerms({ dayRatePaise: 800000, days: 1, track: lD.track })
  const sD = await op.rpc('experience_console_leg_send', { p_roster_id: lD.roster_id, p_expected_gross_paise: tD.creatorGrossPaise, p_expected_platform_pct: tD.platformPct, p_expected_net_paise: tD.creatorNetPaise })
  ok('D sent the old way (no allowance, no new argument)', !sD.error, sD.error?.message)
  const dLeg = sD.data as string; legDeals.push(dLeg)
  const terms = async (d: string) => (await admin.from('experience_creator_terms').select('day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise, allowance_paise').eq('deal_id', d).single()).data as any
  const xg = await terms(gLeg), xd = await terms(dLeg)
  ok('G gross / fee % / net are exactly day rate × days (allowance not in them)', Number(xg.creator_gross_paise) === tG.creatorGrossPaise && Number(xg.platform_pct) === tG.platformPct && Number(xg.creator_net_paise) === tG.creatorNetPaise,
    `${xg.creator_gross_paise}/${xg.platform_pct}/${xg.creator_net_paise}`)
  ok('G allowance ₹1,500 stored beside the terms', Number(xg.allowance_paise) === 150000)
  ok('D allowance 0', Number(xd.allowance_paise) === 0)
  const ros = async (id: string) => (await admin.from('experience_roster').select('leg_affiliate_count, leg_ad_rights_count, leg_boost_count').eq('id', id).single()).data as any
  const rg = await ros(lG.roster_id), rd = await ros(lD.roster_id)
  ok('G scope frozen: 1 affiliate, 2 ad rights, 1 boosted', rg.leg_affiliate_count === 1 && rg.leg_ad_rights_count === 2 && rg.leg_boost_count === 1)
  ok('D scope frozen as stated: 1 affiliate, 2 ad rights, 1 boosted', rd.leg_affiliate_count === 1 && rd.leg_ad_rights_count === 2 && rd.leg_boost_count === 1)
  ok('a sent leg cannot be re-drafted (scope frozen)', refused(await draft(lG, { p_boost_count: 0 })))
  ok('the allowance on locked terms cannot change, even by the service role', refused(await admin.from('experience_creator_terms').update({ allowance_paise: 999900 }).eq('deal_id', gLeg)))
  ok('…it is still ₹1,500', Number((await terms(gLeg)).allowance_paise) === 150000)

  group('B. what the creator sees (their own leg only)')
  const ctxG = (await cG.rpc('creator_leg_context', { p_deal_id: gLeg })).data as any
  const ctxD = (await cD.rpc('creator_leg_context', { p_deal_id: dLeg })).data as any
  ok('G: allowance ₹1,500, total to you = net + allowance', Number(ctxG?.allowance_paise) === 150000 && Number(ctxG?.total_to_creator_paise) === tG.creatorNetPaise + 150000)
  ok('G: ad rights 2 (6 months), boost 1 (3 months)', ctxG?.ad_rights_videos === 2 && ctxG?.ad_rights_months === 6 && ctxG?.boost_videos === 1 && ctxG?.boost_months === 3)
  ok('G reads THEIR OWN brief, not the shared one', String(ctxG?.brief_detail?.pitch).includes(MARK_OWN) && !JSON.stringify(ctxG).includes(MARK_SHARED))
  ok('D reads the shared brief, with its attachment and guidelines', String(ctxD?.brief_detail?.pitch).includes(MARK_SHARED) && ctxD?.brief_detail?.attachments?.length === 1 && String(ctxD?.brief_detail?.guidelines).includes('Natural light'))
  ok('D never sees G\'s own brief', !JSON.stringify(ctxD).includes(MARK_OWN))
  ok('the brief is not locked yet (shoot not confirmed)', ctxG?.brief_detail?.locked === false)
  ok('G cannot read D\'s leg', refused(await cG.rpc('creator_leg_context', { p_deal_id: dLeg })))
  ok('a creator cannot read the terms table for another creator\'s allowance', ((await cG.from('experience_creator_terms').select('allowance_paise').eq('deal_id', dLeg)).data ?? []).length === 0)

  group('B. the brand never sees the allowance, scope money or the brief')
  const bJson = JSON.stringify([
    (await brand.rpc('brand_experience', { p_experience_id: E })).data,
    (await brand.rpc('brand_experience_roster', { p_experience_id: E })).data,
    (await brand.rpc('brand_experiences')).data,
  ])
  ok('the brand probe really read the brand screens', !bJson.startsWith('[null'))
  ok('brand screens carry no allowance, no creator money, no brief text', !/allowance/i.test(bJson) && !bJson.includes('150000') && !bJson.includes(MARK_OWN) && !bJson.includes(MARK_SHARED), bJson.slice(0, 120))
  ok('the brand cannot read the terms table', ((await brand.from('experience_creator_terms').select('allowance_paise').eq('deal_id', gLeg)).data ?? []).length === 0)

  group('A. brief changes tell exactly the sent creators on that brief')
  const sv2 = await op.rpc('experience_console_brief_save', { ...shared, p_pitch: `Updated ${MARK_SHARED}` })
  ok('a shared change → D only (G has their own)', JSON.stringify((sv2.data as any)?.notify_deal_ids) === JSON.stringify([dLeg]))
  const ov2 = await op.rpc('experience_console_brief_override', { p_roster_id: lG.roster_id, p_own: true, p_pitch: `Updated ${MARK_OWN}`, p_guidelines: null, p_avoid: null, p_attachments: [] })
  ok('an own-brief change → G only', JSON.stringify((ov2.data as any)?.notify_deal_ids) === JSON.stringify([gLeg]))

  // ═══ C. Messages ═══
  group('C. Guapd ↔ creator messages: who may write')
  const m1 = await cG.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: MARK_MSG })
  ok('G writes on their own leg before accepting (open from send)', !m1.error, m1.error?.message)
  ok('G cannot write on D\'s leg', refused(await cG.rpc('creator_leg_message_send', { p_deal_id: dLeg, p_body: 'x' })))
  ok('the brand cannot write as a creator', refused(await brand.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: 'x' })))
  ok('staff cannot write as a creator', refused(await op.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: 'x' })))
  ok('logged out: refused', refused(await anon.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: 'x' })))
  ok('an empty message is refused', said(await cG.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: '   ' }), /Write a message/))
  ok('a message over 4,000 characters is refused', said(await cG.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: 'x'.repeat(4001) }), /4,000/))
  ok('a direct insert on a leg thread is refused (only the functions write)', refused(await cG.from('messages').insert({ deal_id: gLeg, sender_party: 'creator', body: 'direct' })))
  const m2 = await op.rpc('experience_console_leg_message_send', { p_deal_id: gLeg, p_body: MARK_GUAPD })
  ok('operational staff reply as Guapd', !m2.error, m2.error?.message)
  for (const [n, s] of [['brand', brand], ['creator', cG], ['anonymous', anon], ['service role', admin]] as const) {
    ok(`${n}: cannot write as Guapd or read the staff thread`, refused(await (s as SupabaseClient).rpc('experience_console_leg_message_send', { p_deal_id: gLeg, p_body: 'x' }))
      && refused(await (s as SupabaseClient).rpc('experience_console_leg_thread', { p_deal_id: gLeg })))
  }
  const gRow = (await admin.from('messages').select('sender_party, deals(brand_id)').eq('deal_id', gLeg).eq('body', MARK_GUAPD).single()).data as any
  const houseId = ((await admin.from('brands').select('id').eq('is_guapd', true).limit(1)).data ?? [])[0]?.id
  ok('Guapd\'s message is the deal\'s brand party, and that brand is the house brand', gRow?.sender_party === 'brand' && gRow?.deals?.brand_id === houseId && houseId !== B.brand_id)

  group('C. who may read (RLS): the leg\'s creator only')
  const readAs = async (s: SupabaseClient, d: string) => ((await s.from('messages').select('id, body').eq('deal_id', d)).data ?? []) as any[]
  const gSees = await readAs(cG, gLeg)
  ok('G reads both messages on their thread', gSees.length === 2 && gSees.some((m) => m.body === MARK_GUAPD))
  ok('G reads nothing on D\'s thread', (await readAs(cG, dLeg)).length === 0)
  ok('D reads nothing on G\'s thread', (await readAs(cD, gLeg)).length === 0)
  ok('the brand reads nothing on any leg thread', (await readAs(brand, gLeg)).length === 0 && (await readAs(brand, dLeg)).length === 0)
  ok('staff read nothing through RLS (only through the gated function)', (await readAs(op, gLeg)).length === 0)
  ok('logged out reads nothing', (await readAs(anon, gLeg)).length === 0)
  ok('the brand cannot see the leg deal itself', ((await brand.from('deals').select('id').in('id', [gLeg, dLeg])).data ?? []).length === 0)
  ok('the house brand can never gain a member (even with the service key)', said(await admin.from('brand_members').insert({ brand_id: houseId, user_id: SPARE.id, is_admin: false }), /house brand/))
  ok('…and it has none', ((await admin.from('brand_members').select('user_id').eq('brand_id', houseId)).data ?? []).length === 0)

  group('C. the staff side: thread, list, unread')
  // This thread's unread for this staff user. The global count also includes any real staging threads.
  const gUnread = async () => Number(((await op.rpc('experience_console_leg_threads', { p_experience_id: null })).data as any[] ?? []).find((t) => t.deal_id === gLeg)?.unread ?? -1)
  ok('replying marked the thread read for the staff member who replied', await gUnread() === 0)
  await cG.rpc('creator_leg_message_send', { p_deal_id: gLeg, p_body: 'one more question' })
  const globalBefore = Number((await op.rpc('experience_console_unread_messages')).data)
  ok('a new creator message shows as unread for staff', await gUnread() === 1)
  const th = (await op.rpc('experience_console_leg_thread', { p_deal_id: gLeg })).data as any
  ok('the thread: 3 messages, creator → Guapd → creator', th?.messages?.length === 3 && th.messages[0].from === 'creator' && th.messages[1].from === 'guapd' && th.messages[2].from === 'creator')
  ok('opening it marks it read for this staff user (and the global count drops by one)', await gUnread() === 0 && Number((await op.rpc('experience_console_unread_messages')).data) === globalBefore - 1)
  ok('…but not for another staff user', Number((await fin.rpc('experience_console_unread_messages')).data) >= 1)
  const list = ((await op.rpc('experience_console_leg_threads', { p_experience_id: E })).data ?? []) as any[]
  ok('the Deals list has both sent legs', list.length === 2 && list.some((r) => r.deal_id === gLeg) && list.some((r) => r.deal_id === dLeg))
  const keys = Array.from(new Set(list.flatMap((r) => Object.keys(r))))
  ok('the Deals list carries no money field', !keys.some((k) => MONEYISH.test(k)), keys.join(','))
  ok('the brand cannot list leg threads', refused(await brand.rpc('experience_console_leg_threads', { p_experience_id: E })))

  group('C. audit: lengths, never the text')
  const ev = ((await admin.from('events').select('detail').eq('deal_id', gLeg).eq('event_type', 'experience.leg_message')).data ?? []) as any[]
  ok('deal events record each message by length', ev.length === 3 && ev.every((e) => typeof e.detail?.length === 'number' && !JSON.stringify(e.detail).includes(MARK_MSG) && !JSON.stringify(e.detail).includes(MARK_GUAPD)))
  const oe = ((await admin.from('ops_events').select('detail, action').eq('target_id', gLeg).gte('created_at', startedAt)).data ?? []) as any[]
  ok('ops_events never carry message or brief text', !JSON.stringify(oe).includes(MARK_GUAPD) && !JSON.stringify(oe).includes(MARK_OWN))

  // ═══ The three-state scope rule (0547) ═══
  group('B. three-state scope: sent, shoot not confirmed → re-split only')
  const snap = async () => JSON.stringify([
    (await admin.from('experience_creator_terms').select('day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise, allowance_paise, locked_at').eq('deal_id', gLeg).single()).data,
    (await admin.from('deals').select('price_paise, fee_percent, status').eq('id', gLeg).single()).data,
    (await fin.rpc('experience_pnl', { p_experience_id: E })).data?.guapd_margin_paise,
  ])
  const moneyBefore = await snap()
  const cur = { affiliate: 1, ad_rights: 2, boost: 1 }
  const rescope = (a: number | null, ad: number | null, b: number | null, exp: unknown = cur, s: SupabaseClient = op) =>
    s.rpc('experience_console_leg_rescope', { p_roster_id: lG.roster_id, p_affiliate_count: a, p_ad_rights_count: ad, p_boost_count: b, p_expected: exp })
  for (const [n, s] of [['brand', brand], ['creator', cG], ['anonymous', anon], ['service role', admin]] as const) ok(`${n}: cannot re-split`, refused(await rescope(0, 1, 0, cur, s as SupabaseClient)))
  ok('a NULL count is refused', said(await rescope(1, null, 1), /every count/))
  ok('a stale screen is refused', said(await rescope(1, 1, 1, { affiliate: 0, ad_rights: 2, boost: 1 }), /changed since/))
  ok('above what the brand bought per creator is refused (affiliate 2 of 1 bought)', said(await rescope(2, 2, 1), /bought the affiliate link on 1/))
  ok('above what the brand bought per creator is refused (boost 2 of 1 bought)', said(await rescope(1, 2, 2), /bought boosting on 1/))
  ok('above the creator\'s own videos is refused (ad rights 3 of 2)', said(await rescope(1, 3, 1), /between 0/))
  const rs1 = await rescope(0, 1, 1)
  ok('a re-split within what was bought is allowed (affiliate 1→0, ad rights 2→1)', !rs1.error, rs1.error?.message)
  const rg2 = (await admin.from('experience_roster').select('leg_affiliate_count, leg_ad_rights_count, leg_boost_count').eq('id', lG.roster_id).single()).data as any
  ok('…the counts are the new split', rg2.leg_affiliate_count === 0 && rg2.leg_ad_rights_count === 1 && rg2.leg_boost_count === 1)
  ok('…the deal\'s items follow: no video carries the affiliate link now', ((await admin.from('deal_deliverable_items').select('affiliate_link').eq('deal_id', gLeg)).data ?? []).every((i: any) => i.affiliate_link === false))
  ok('…terms, fee %, net, allowance, deal price and margin are byte-identical (labels only)', (await snap()) === moneyBefore)
  const cx = (await cG.rpc('creator_leg_context', { p_deal_id: gLeg })).data as any
  ok('…the creator sees the new split', cx?.affiliate_count === 0 && cx?.ad_rights_videos === 1 && cx?.boost_videos === 1)
  ok('…and it is audited as a re-split (counts only)', ((await admin.from('events').select('detail').eq('deal_id', gLeg).eq('event_type', 'experience.leg_rescoped')).data ?? []).length === 1)
  const back = await rescope(1, 2, 1, { affiliate: 0, ad_rights: 1, boost: 1 })
  ok('moving it back up to what was bought is allowed', !back.error, back.error?.message)
  ok('…still byte-identical money', (await snap()) === moneyBefore)

  // ═══ Lock at shoot confirmed; P&L; payout ═══
  group('A. the brief locks when the shoot is confirmed')
  await admin.from('deals').update({ status: 'agreed' }).in('id', [gLeg, dLeg])
  const sch = await op.rpc('experience_console_schedule_shoot', { p_experience_id: E })
  ok('shoot confirmed', !sch.error, sch.error?.message)
  ok('saving the shared brief is now refused', said(await op.rpc('experience_console_brief_save', shared), /locked/))
  ok('an own brief is now refused', said(await op.rpc('experience_console_brief_override', { p_roster_id: lD.roster_id, p_own: true, p_pitch: 'late', p_guidelines: null, p_avoid: null, p_attachments: [] }), /locked/))
  ok('a new attachment slot is refused', said(await op.rpc('experience_console_brief_slot', { p_experience_id: E, p_file_name: 'a.pdf' }), /locked/))
  ok('the old one-box setter is refused too', said(await op.rpc('experience_console_set_creator_brief', { p_experience_id: E, p_brief: 'late' }), /locked/))
  ok('three-state: after the shoot is confirmed a re-split is refused (new scope = new invoice / leg)', said(await op.rpc('experience_console_leg_rescope', { p_roster_id: lG.roster_id, p_affiliate_count: 0, p_ad_rights_count: 2, p_boost_count: 1, p_expected: { affiliate: 1, ad_rights: 2, boost: 1 } }), /frozen once the shoot is confirmed/))
  ok('the creator sees it as final', ((await cG.rpc('creator_leg_context', { p_deal_id: gLeg })).data as any)?.brief_detail?.locked === true)

  group('B. the P&L counts the allowance once, outside the fee')
  const pnl = (await fin.rpc('experience_pnl', { p_experience_id: E })).data as any
  const gross = tG.creatorGrossPaise + tD.creatorGrossPaise, net = tG.creatorNetPaise + tD.creatorNetPaise
  ok('allowances line = ₹1,500', Number(pnl?.creator_allowance_total_paise) === 150000)
  ok('fee kept = gross − net (no allowance in it)', Number(pnl?.platform_fee_kept_paise) === gross - net)
  ok('margin = revenue − net − allowance − costs; sub-total + fee kept = margin',
    Number(pnl?.guapd_margin_paise) === Number(pnl?.brand_revenue_paise) - net - 150000 - Number(pnl?.guapd_costs_total_paise)
    && Number(pnl?.subtotal_paise) + Number(pnl?.platform_fee_kept_paise) === Number(pnl?.guapd_margin_paise))
  ok('operational staff still cannot read the P&L', refused(await op.rpc('experience_pnl', { p_experience_id: E })))
  const tsM = experienceMargin({ brandInvoiceSubtotalsPaise: [Number(pnl?.brand_revenue_paise)],
    creatorLegs: [{ creatorGrossPaise: tG.creatorGrossPaise, creatorNetPaise: tG.creatorNetPaise, allowancePaise: 150000 }, { creatorGrossPaise: tD.creatorGrossPaise, creatorNetPaise: tD.creatorNetPaise, allowancePaise: 0 }],
    guapdCostsPaise: [Number(pnl?.guapd_costs_total_paise)] })
  ok('experienceMargin() matches the database P&L line for line, allowance as a cost',
    tsM.guapdMarginPaise === Number(pnl?.guapd_margin_paise) && tsM.subtotalPaise === Number(pnl?.subtotal_paise) && tsM.platformFeeKeptPaise === Number(pnl?.platform_fee_kept_paise) && tsM.creatorAllowanceTotalPaise === Number(pnl?.creator_allowance_total_paise),
    `ts ${tsM.guapdMarginPaise} db ${pnl?.guapd_margin_paise}`)
  const cost = (cat: string, deal: string | null) => op.rpc('experience_console_cost_add', { p_experience_id: E, p_label: 'Cab', p_category: cat, p_basis: 'flat_total', p_quantity: null, p_unit_rate_paise: null, p_total_paise: 50000, p_provided_by: 'guapd', p_creator_leg_deal_id: deal, p_note: null })
  ok('a travel cost tied to G (who has an allowance) is refused: no double count', said(await cost('travel', gLeg), /allowance/))
  ok('a travel cost tied to D (no allowance) is fine', !(await cost('travel', dLeg)).error)

  group('B. the payout pays the allowance in full beside the fee statement')
  await admin.from('experiences').update({ shoot_date: '2026-10-01' }).eq('id', E)
  const out = await op.rpc('experience_console_leg_shoot_outcome', { p_roster_id: lG.roster_id, p_outcome: 'done', p_reason: null })
  ok('G shot', !out.error, out.error?.message)
  // 0561: G's 2 ad-rights videos must be posted as collabs before the invoice.
  ok('0561: G cannot invoice before posting their 2 collab videos', said(await invoiceAs(cG, gLeg), /./) && ((await cG.rpc('creator_leg_context', { p_deal_id: gLeg })).data as any)?.collab_waiting === 2)
  await postCollabsFixture(E, gLeg, 2)
  ok('0552: G confirms the shoot and raises their invoice', !(await invoiceAs(cG, gLeg)).error)
  ok('TDS above net + allowance is refused', said(await op.rpc('experience_console_payout_request', { p_deal_id: gLeg, p_tds_paise: tG.creatorNetPaise + 150001 }), /TDS/))
  const pr = await op.rpc('experience_console_payout_request', { p_deal_id: gLeg, p_tds_paise: 0 })
  ok('payout requested', !pr.error, pr.error?.message)
  const vp = (await admin.from('vendor_payouts').select('gross_paise, platform_pct, platform_fee_paise, amount_paise, allowance_paise, tds_paise, net_amount_paise').eq('id', pr.data as string).single()).data as any
  ok('statement: amount = gross − fee = net (allowance not in it)', Number(vp.amount_paise) === tG.creatorNetPaise && Number(vp.gross_paise) - Number(vp.platform_fee_paise) === Number(vp.amount_paise))
  ok('allowance ₹1,500 on the payout; paid = net + allowance − TDS', Number(vp.allowance_paise) === 150000 && Number(vp.net_amount_paise) === tG.creatorNetPaise + 150000)
  const st = await op.rpc('experience_console_payout_set_tds', { p_payout_id: pr.data, p_tds_paise: 10000 })
  ok('TDS set: paid = net + allowance − TDS', !st.error && Number((await admin.from('vendor_payouts').select('net_amount_paise').eq('id', pr.data as string).single()).data!.net_amount_paise) === tG.creatorNetPaise + 150000 - 10000)
  ok('a payout whose allowance differs from the terms is refused', refused(await admin.from('vendor_payouts').insert({ experience_id: E, deal_id: dLeg, vendor_id: (await admin.from('vendors').select('id').eq('creator_id', G.id).single()).data!.id, reason: 'creator_fee', gross_paise: tD.creatorGrossPaise, platform_pct: tD.platformPct, platform_fee_paise: tD.creatorGrossPaise - tD.creatorNetPaise, amount_paise: tD.creatorNetPaise, allowance_paise: 5000, tds_paise: 0, net_amount_paise: tD.creatorNetPaise + 5000, status: 'requested', provider: 'manual', idempotency_key: `61-test-${Date.now()}` })))
  const mine = ((await cG.rpc('creator_payouts')).data ?? []) as any[]
  ok('the creator\'s payouts list shows the allowance', mine.some((p) => p.deal_id === gLeg && Number(p.allowance_paise) === 150000))
  const ctx3 = (await cG.rpc('creator_leg_context', { p_deal_id: gLeg })).data as any
  ok('the creator\'s statement shows the allowance', Number(ctx3?.payout?.allowance_paise) === 150000)
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  for (const E of exps) {
    await admin.from('experience_collab_posts').delete().eq('experience_id', E)
    await admin.from('vendor_payouts').delete().eq('experience_id', E)
    await admin.from('experience_creator_invoices').delete().eq('experience_id', E)
    await admin.from('experience_pnl_snapshots').delete().eq('experience_id', E)
    await admin.from('experience_deliverable_releases').delete().eq('experience_id', E)
    await admin.from('experience_roster').update({ leg_deal_id: null, leg_shoot_outcome: null, leg_shoot_outcome_at: null, leg_shoot_outcome_by: null, leg_shoot_outcome_reason: null }).eq('experience_id', E)
  }
  if (newVendorCreators.length) await admin.from('vendors').delete().in('creator_id', newVendorCreators)
  for (const E of exps) await admin.from('experience_leg_counters').delete().eq('experience_id', E)
  if (legDeals.length) {
    await admin.from('message_reads').delete().in('deal_id', legDeals)
    await admin.from('messages').delete().in('deal_id', legDeals)
    await admin.from('notifications').delete().in('deal_id', legDeals)
    await admin.from('events').delete().in('deal_id', legDeals)
    await admin.from('deals').delete().in('id', legDeals)
  }
  for (const E of exps) { await admin.from('experience_cost_lines').delete().eq('experience_id', E); await admin.from('experiences').delete().eq('id', E) }
  if (createdRates.length) await admin.from('creator_products').delete().in('id', createdRates.filter(Boolean))
  for (const p of priorRates) await admin.from('creator_products').update({ is_active: p.is_active, price_paise: p.price_paise }).eq('id', p.id)
  for (const g of grants) {
    const a = (await admin.from('users').select('auth_id').eq('id', g).single()).data?.auth_id
    if (a) await admin.from('ops_events').delete().eq('actor_auth_id', a).gte('created_at', startedAt)
    await admin.from('staff_access').delete().eq('user_id', g)
  }
  const left = await admin.from('experiences').select('id').like('title', '[61-test]%')
  const leftMsgs = legDeals.length ? ((await admin.from('messages').select('id').in('deal_id', legDeals)).data ?? []).length : 0
  const staffAfter = ((await admin.from('staff_access').select('user_id')).data ?? []).length
  ok('cleanup: nothing left behind (Experiences, deals, messages, staff grants)', (left.data ?? []).length === 0 && leftMsgs === 0 && staffAfter === staffBefore,
    `left=${(left.data ?? []).length} msgs=${leftMsgs} staff ${staffBefore}→${staffAfter}`)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
