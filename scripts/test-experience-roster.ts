/**
 * 0532: the Experience roster in the staff console, against STAGING with real
 * sessions. Grants TEMPORARY operational access to one real user and removes
 * it; deletes the Experience it makes (roster, notes and quotes cascade) and
 * the ops_events rows it produced.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-experience-roster.ts
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
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const group = (g: string) => console.log(`\n${g}`)
const refused = (r: { error: { message: string } | null }) => !!r.error
let E = '', staffUserId = ''
const touched: string[] = []

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function run() {
  // Actors
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands(is_guapd)').limit(40)
  const B = (bm ?? []).find((m: any) => m.users?.auth_id && !m.brands?.is_guapd) as any
  const { data: crs } = await admin.from('creators').select('id, user_id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(30)
  const C = (crs ?? []).find((c: any) => c.users?.auth_id) as any
  const { data: access } = await admin.from('staff_access').select('user_id')
  const busy = new Set([B.user_id, C.user_id, ...(access ?? []).map((a) => a.user_id)])
  const { data: users } = await admin.from('users').select('id, auth_id').not('auth_id', 'is', null).limit(80)
  const [STAFF, NONE] = (users ?? []).filter((u: any) => !busy.has(u.id)) as any[]
  const { data: bookable } = await admin.from('creators').select('id').eq('is_bookable', true).eq('is_guapd', false).limit(4)
  const { data: notBookable } = await admin.from('creators').select('id').eq('is_bookable', false).eq('is_guapd', false).limit(1)
  const { data: house } = await admin.from('creators').select('id').eq('is_guapd', true).single()
  if (!B || !C || !STAFF || !NONE || (bookable ?? []).length < 4 || !house) throw new Error('missing test actors (need 4 bookable creators)')
  const [K1, K2, K3, K4] = bookable!.map((b) => b.id)

  await admin.from('staff_access').insert({ user_id: STAFF.id, experiences_operational: true, experiences_financial: true })  // quoting is the brand price: finance only (0537)
  staffUserId = STAFF.id
  const staff = await sessionFor(STAFF.auth_id), none = await sessionFor(NONE.auth_id)
  const brand = await sessionFor(B.users.auth_id), creator = await sessionFor(C.users.auth_id)
  const anon = createClient(URL, ANON)

  // An agreed Experience: 2 creators × (2 UGC video + 1 Story); sold 4 videos.
  const c = await staff.rpc('experience_console_create', {
    p_brand_id: B.brand_id, p_title: '[roster-test] Kiro shoot', p_creator_count: 2,
    p_deliverables: [{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }],
    p_affiliate: false, p_affiliate_per_creator: null, p_ad_rights: false, p_ad_rights_per_creator: null, p_ad_rights_months: null,
    p_boost: false, p_boost_per_creator: null, p_boost_months: null, p_location: 'Mumbai', p_date_from: null, p_date_to: null,
    p_brief: null, p_channel: 'email',
  })
  if (c.error) throw new Error('create: ' + c.error.message)
  E = c.data as string
  ok('the roster cannot be built before the price is agreed', refused(await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1], p_added_by: 'guapd', p_channel: null })))
  const q = await staff.rpc('experience_console_quote', { p_experience_id: E, p_proposed_by: 'guapd', p_per_video_paise: 350000, p_deliverable_count: 4, p_misc_paise: 0, p_deliverables: [], p_shoot_date: '2026-11-11', p_shoot_city: 'Mumbai', p_message: null, p_channel: null })
  await staff.rpc('experience_console_accept', { p_quote_id: q.data, p_channel: 'email' })

  group('gating: only staff with operational access, refused by the database')
  for (const [n, s] of [['no access (outreach-like)', none], ['real brand', brand], ['creator', creator], ['anonymous', anon], ['service role', admin]] as const) {
    const cl = s as SupabaseClient
    const all = [
      await cl.rpc('experience_console_creators'),
      await cl.rpc('experience_console_roster', { p_experience_id: E }),
      await cl.rpc('experience_console_reconcile', { p_experience_id: E }),
      await cl.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1], p_added_by: 'guapd', p_channel: null }),
      await cl.rpc('experience_console_roster_lock', { p_experience_id: E }),
    ]
    ok(`${n}: every roster read and write refused`, all.every(refused))
  }
  ok('the internal reconcile function cannot be called directly by anyone', refused(await staff.rpc('experience_roster_reconcile', { p_experience_id: E })) && refused(await admin.rpc('experience_roster_reconcile', { p_experience_id: E })))

  group('adding creators')
  const picker = await staff.rpc('experience_console_creators')
  ok('the creator picker never lists the house creator', !picker.error && !(picker.data ?? []).some((x: any) => x.id === house.id))
  ok('…and lists bookable creators only', !(picker.data ?? []).some((x: any) => x.id === notBookable?.[0]?.id))
  ok('the house creator cannot be added', refused(await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [house.id], p_added_by: 'guapd', p_channel: null })))
  if (notBookable?.[0]) ok('a creator who is not bookable cannot be added', refused(await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [notBookable[0].id], p_added_by: 'guapd', p_channel: null })))
  ok("a brand's suggestion needs the channel", refused(await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K3], p_added_by: 'brand', p_channel: null })))
  const add = await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1, K2], p_added_by: 'guapd', p_channel: null })
  ok('staff add two creators', !add.error && add.data === 2, add.error?.message ?? String(add.data))
  const sug = await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K3], p_added_by: 'brand', p_channel: 'whatsapp' })
  ok("staff add the brand's suggestion (via WhatsApp)", !sug.error && sug.data === 1)
  ok('adding someone already on the roster adds nobody', (await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K1], p_added_by: 'guapd', p_channel: null })).data === 0)
  let roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  touched.push(...roster.map((r) => r.id))
  const row = (id: string) => roster.find((r) => r.creator_id === id)
  ok('each starts from the agreed per-creator plan (2 UGC video + 1 Story)', roster.length === 3 && roster.every((r) => JSON.stringify(r.planned_deliverables) === JSON.stringify([{ type: 'UGC video', count: 2 }, { type: 'Story', count: 1 }])))
  ok('all start awaiting the brand', roster.every((r) => r.brand_decision === 'pending' && !r.locked))
  ok("the brand's pick is marked as theirs", row(K3).added_by === 'brand')

  group('the contract check: combined total against what was sold')
  let rec = (await staff.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('3 creators × 2 = 6 videos against 4 sold: flagged', rec.ok === false && rec.videos_planned === 6 && rec.videos_sold === 4)
  ok('lock refused while any creator awaits the brand', refused(await staff.rpc('experience_console_roster_lock', { p_experience_id: E })))
  ok('a decision needs the channel', refused(await staff.rpc('experience_console_roster_decide', { p_roster_id: row(K1).id, p_decision: 'accepted', p_channel: null })))
  await staff.rpc('experience_console_roster_decide', { p_roster_id: row(K1).id, p_decision: 'accepted', p_channel: 'email' })
  await staff.rpc('experience_console_roster_decide', { p_roster_id: row(K2).id, p_decision: 'accepted', p_channel: 'email' })
  const rej = await staff.rpc('experience_console_roster_decide', { p_roster_id: row(K3).id, p_decision: 'rejected', p_channel: 'call' })
  ok('staff record accept, accept, reject (via email, email, call)', !rej.error)
  rec = (await staff.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('a rejected creator does not count: 4 of 4 videos, 2 of 2 stories, ok', rec.ok === true && rec.videos_planned === 4 && rec.creators_counted === 2, JSON.stringify(rec.lines))
  // Uneven is fine as long as the total matches: one does 3, the other 1.
  await staff.rpc('experience_console_roster_plan', { p_roster_id: row(K1).id, p_deliverables: [{ type: 'UGC video', count: 3 }, { type: 'Story', count: 1 }] })
  rec = (await staff.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('one creator doing 3 while the other does 2 is flagged (5 against 4)', rec.ok === false && rec.videos_planned === 5)
  ok('…and lock is refused while it does not add up', refused(await staff.rpc('experience_console_roster_lock', { p_experience_id: E })))
  await staff.rpc('experience_console_roster_plan', { p_roster_id: row(K2).id, p_deliverables: [{ type: 'UGC video', count: 1 }, { type: 'Story', count: 1 }] })
  rec = (await staff.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('3 + 1 = 4: uneven creators, matching total, ok (no per-creator uniformity)', rec.ok === true && rec.videos_planned === 4)
  ok('an unknown deliverable type is refused', refused(await staff.rpc('experience_console_roster_plan', { p_roster_id: row(K2).id, p_deliverables: [{ type: 'Podcast', count: 1 }] })))

  group('the Guapd note: staff only, at the data layer')
  const SECRET = 'Call notes: prefers mornings, rate flexible'
  await staff.rpc('experience_console_roster_note', { p_roster_id: row(K1).id, p_note: SECRET })
  roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  ok('staff read the note back', row(K1).note === SECRET)
  const bn = await brand.from('experience_roster_notes').select('note')
  const cn = await creator.from('experience_roster_notes').select('note')
  ok('the brand cannot read the notes table', refused(bn), bn.error?.message ?? `${bn.data?.length} rows`)
  ok('the creator cannot read the notes table', refused(cn), cn.error?.message ?? `${cn.data?.length} rows`)
  ok('the brand cannot write a note', refused(await brand.from('experience_roster_notes').insert({ roster_id: row(K1).id, note: 'x' })))
  const br = await brand.from('experience_roster').select('id, brand_decision').eq('experience_id', E)
  ok('the brand still reads its own roster basics (for its future view)', !br.error && (br.data ?? []).length === 3, br.error?.message ?? '')
  const bp = await brand.from('experience_roster').select('id, decision_channel').eq('experience_id', E)
  ok('…but not the columns added here (channel, planned deliverables)', refused(bp) && refused(await brand.from('experience_roster').select('planned_deliverables').eq('experience_id', E)))
  const cr = await creator.from('experience_roster').select('id').eq('experience_id', E)
  ok('the creator reads no roster at all', !!cr.error || (cr.data ?? []).length === 0)
  const nAudit = (await admin.from('ops_events').select('detail').eq('target_id', row(K1).id).eq('action', 'experience.roster_note_set')).data ?? []
  ok('the audit row records the note length, never its text', nAudit.length === 1 && !JSON.stringify(nAudit[0].detail).includes('mornings') && (nAudit[0].detail as any).note_length === SECRET.length)

  group('lock, and after lock')
  const lk = await staff.rpc('experience_console_roster_lock', { p_experience_id: E })
  ok('lock succeeds once every decision is in and the total matches', !lk.error && lk.data === 2, lk.error?.message ?? String(lk.data))
  const ex = (await staff.rpc('experience_console_get', { p_experience_id: E })).data
  ok('the Experience moves exactly one step: rostering → confirmed', ex.status === 'confirmed', ex.status)
  roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  ok('the two accepted creators are locked; the rejected one is not', row(K1).locked && row(K2).locked && !row(K3).locked)
  ok('a locked creator cannot be re-decided', refused(await staff.rpc('experience_console_roster_decide', { p_roster_id: row(K1).id, p_decision: 'rejected', p_channel: 'email' })))
  ok("a locked creator's plan cannot change", refused(await staff.rpc('experience_console_roster_plan', { p_roster_id: row(K1).id, p_deliverables: [] })))
  ok('a locked creator cannot be removed', refused(await staff.rpc('experience_console_roster_remove', { p_roster_id: row(K1).id })))
  ok("a locked creator's note can still be updated", !refused(await staff.rpc('experience_console_roster_note', { p_roster_id: row(K1).id, p_note: 'Confirmed for the shoot' })))
  const after = await staff.rpc('experience_console_roster_add', { p_experience_id: E, p_creator_ids: [K4], p_added_by: 'guapd', p_channel: null })
  ok('creators can still be added after lock', !after.error && after.data === 1)
  roster = ((await staff.rpc('experience_console_roster', { p_experience_id: E })).data ?? []) as any[]
  touched.push(row(K4).id)
  rec = (await staff.rpc('experience_console_reconcile', { p_experience_id: E })).data as any
  ok('the extra creator is flagged against the sold total (6 against 4)', rec.ok === false && rec.videos_planned === 6)
  ok('the status stays confirmed (adding never moves it back)', (await staff.rpc('experience_console_get', { p_experience_id: E })).data.status === 'confirmed')
  ok('the locked set is untouched', row(K1).locked && row(K2).locked)
  ok('an unlocked addition can still be removed', !refused(await staff.rpc('experience_console_roster_remove', { p_roster_id: row(K4).id })))

  group('audit')
  const acts = new Set(((await admin.from('ops_events').select('action').in('target_id', [...touched, E])).data ?? []).map((a) => a.action))
  for (const a of ['experience.roster_added', 'experience.roster_decision_recorded', 'experience.roster_plan_changed', 'experience.roster_note_set', 'experience.roster_removed', 'experience.roster_locked']) {
    ok(`ops_events has ${a}`, acts.has(a))
  }

  group('revoking')
  await admin.from('staff_access').update({ experiences_operational: false, experiences_financial: false }).eq('user_id', STAFF.id)  // financial includes operational, so revoke both
  ok('operational off → roster refused at once', refused(await staff.rpc('experience_console_roster', { p_experience_id: E })))
}

run().catch((e) => { console.error(e); failed++ }).finally(async () => {
  if (E) {
    const { data: qids } = await admin.from('experience_quotes').select('id').eq('experience_id', E)
    await admin.from('ops_events').delete().in('target_id', [E, ...touched, ...(qids ?? []).map((x) => x.id)])
    await admin.from('experiences').delete().eq('id', E)
  }
  if (staffUserId) await admin.from('staff_access').delete().eq('user_id', staffUserId)
  const left = await admin.from('experiences').select('id').like('title', '[roster-test]%')
  ok('cleanup: nothing left behind', (left.data ?? []).length === 0)
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
})
