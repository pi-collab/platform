/**
 * Phase 0 regression walk for the deal write guard (migration 0520) and the
 * server-only invoices change (0521), against STAGING.
 *
 * Signs in as a real brand member and a real creator, then makes exactly the
 * database writes the app's server actions make, with the same role
 * (`authenticated`, user JWT) — which is precisely what the guard trigger
 * sees. Server actions themselves are not called, so no WhatsApp, email or
 * in-app notification goes to anyone.
 *
 * Uses FRESH deals between those real accounts, titled "[guard-walk]", so no
 * existing test deal is moved to paid; deletes them at the end.
 *
 * Every transition the app makes is exercised once. A legit write that the
 * guard refuses is reported as a REGRESSION and is not worked around.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/walk-deal-guard.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(__dirname, '../apps/web/.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }

const admin = createClient(URL, SERVICE)
const rows: { step: string; who: string; expect: 'allow' | 'refuse'; ok: boolean; detail: string }[] = []
const made: string[] = []

function record(step: string, who: string, expect: 'allow' | 'refuse', error: { message: string } | null, extra = '') {
  const ok = expect === 'allow' ? !error : !!error
  rows.push({ step, who, expect, ok, detail: error ? error.message : extra || 'ok' })
}

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const email = u?.user?.email
  if (!email) throw new Error(`no email for ${authId}`)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const res = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }),
  })
  const s = await res.json()
  if (!s.access_token) throw new Error(`no session for ${authId}`)
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function status(id: string) {
  const { data } = await admin.from('deals').select('status, price_paise, revisions_used, is_posted, shipment_status, title').eq('id', id).single()
  return data!
}

/** createDeal: service-role insert of the deal (0520), brand-session insert of items. */
async function newDeal(brand: SupabaseClient, ids: { brand_id: string; creator_id: string; created_by: string }, label: string, opts: { shipment?: boolean } = {}) {
  const { data, error } = await admin.from('deals').insert({
    ...ids, status: 'negotiating', title: `[guard-walk] ${label}`, deliverables: '2 × Reel',
    price_paise: 2_000_000, revision_limit: 2, payment_terms: 'Net 30', last_offer_by: 'brand',
    fee_percent: 15, fee_mode: 'deducted', fee_basis: 'brand_standard', track: 'deals',
    requires_shipment: !!opts.shipment, shipment_status: opts.shipment ? 'pending' : null,
  }).select('id').single()
  record(`create ${label} (createDeal insert, service role)`, 'server', 'allow', error)
  if (!data) throw new Error('create failed: ' + error?.message)
  made.push(data.id)
  const { data: items, error: itemsErr } = await brand.from('deal_deliverable_items').insert([
    { deal_id: data.id, label: 'Instagram Reel', platform: 'instagram', handle: 'test', price_paise: 1_000_000 },
    { deal_id: data.id, label: 'Instagram Reel', platform: 'instagram', handle: 'test', price_paise: 1_000_000 },
  ]).select('id')
  record(`create ${label}: items (brand session)`, 'brand', 'allow', itemsErr)
  return { id: data.id, items: (items ?? []).map(i => i.id) }
}

async function run() {
  // A deal pair where both the brand member and the creator can sign in.
  const { data: deals } = await admin.from('deals').select('brand_id, creator_id').limit(50)
  let pick: { brand_id: string; creator_id: string; brandAuth: string; creatorAuth: string; created_by: string } | null = null
  for (const d of deals ?? []) {
    const { data: bm } = await admin.from('brand_members').select('user_id, users(auth_id)').eq('brand_id', d.brand_id).limit(1).maybeSingle()
    const { data: cr } = await admin.from('creators').select('users(auth_id)').eq('id', d.creator_id).maybeSingle()
    const b = (bm?.users as any)?.auth_id, c = (cr?.users as any)?.auth_id
    if (b && c) { pick = { ...d, brandAuth: b, creatorAuth: c, created_by: bm!.user_id }; break }
  }
  if (!pick) { console.error('No brand/creator pair with logins'); process.exit(1) }
  const brand = await sessionFor(pick.brandAuth)
  const creator = await sessionFor(pick.creatorAuth)
  const ids = { brand_id: pick.brand_id, creator_id: pick.creator_id, created_by: pick.created_by }
  const now = () => new Date().toISOString()

  // ── Deal A: the full lifecycle, brand accepts a creator counter ─────────────
  const A = await newDeal(brand, ids, 'A full lifecycle', { shipment: true })

  let r = await brand.from('deals').update({ title: '[guard-walk] A full lifecycle (renamed)' }).eq('id', A.id)
  record('brand renames deal', 'brand', 'allow', r.error)
  // The brand's note left deals in 0527 (the creator could read it there); it
  // is written by the server action only, never by the session directly.
  r = await brand.from('deal_brand_notes').upsert({ deal_id: A.id, note: 'guard walk note' })
  record('brand writes a deal note directly (0527: server action only)', 'brand', 'deny', r.error)
  const { data: camp } = await admin.from('campaigns').select('id').eq('brand_id', pick.brand_id).limit(1).maybeSingle()
  if (camp) {
    r = await brand.from('deals').update({ campaign_id: camp.id }).eq('id', A.id)
    record('brand assigns deal to its own campaign', 'brand', 'allow', r.error)
    r = await brand.from('deals').update({ campaign_id: null }).eq('id', A.id)
    record('brand removes deal from campaign', 'brand', 'allow', r.error)
  } else {
    rows.push({ step: 'brand assigns deal to its own campaign', who: 'brand', expect: 'allow', ok: true, detail: 'SKIPPED: brand has no campaign' })
  }

  r = await creator.from('deals').update({ shipping_address: '1 Test Street, Pune' }).eq('id', A.id)
  record('creator saves shipping address', 'creator', 'allow', r.error)

  // counter (events/messages only, no deals write), then brand accepts it
  await admin.from('events').insert({ deal_id: A.id, event_type: 'deal.counter_offer', detail: { counter_items: [], counter_total_paise: 2_200_000, note: 'guard walk' } })
  r = await creator.from('messages').insert({ deal_id: A.id, sender_party: 'creator', body: 'guard walk counter' })
  record('creator counter message', 'creator', 'allow', r.error)
  r = await brand.from('deals').update({ status: 'agreed', agreed_at: now(), rights_confirmed_at: now(), price_paise: 2_200_000 }).eq('id', A.id).eq('status', 'negotiating')
  record('brand accepts counter: negotiating → agreed (+price)', 'brand', 'allow', r.error, (await status(A.id)).status)

  r = await brand.from('deals').update({ shipment_status: 'shipped', tracking_link: 'https://track.example/1', carrier_note: 'Delhivery', shipped_at: now() }).eq('id', A.id).eq('shipment_status', 'pending')
  record('brand marks shipped', 'brand', 'allow', r.error)
  r = await brand.from('deals').update({ shipment_status: 'delivered' }).eq('id', A.id).eq('shipment_status', 'shipped')
  record('brand marks delivered', 'brand', 'allow', r.error)

  for (const it of A.items) {
    r = await creator.from('deal_deliverable_items').update({ item_status: 'submitted', external_url: 'https://example.com/v1', version: 1, submitted_at: now() }).eq('id', it)
    record('creator submits item', 'creator', 'allow', r.error)
  }
  r = await creator.from('deals').update({ status: 'delivered' }).eq('id', A.id).in('status', ['agreed', 'revision'])
  record('creator submits for review: agreed → delivered', 'creator', 'allow', r.error, (await status(A.id)).status)

  r = await brand.from('deal_deliverable_items').update({ item_status: 'revision', revision_note: 'tweak' }).eq('id', A.items[0])
  record('brand requests item revision', 'brand', 'allow', r.error)
  const rev = await brand.rpc('request_deal_revision', { p_deal_id: A.id })
  record('brand request_deal_revision RPC: delivered → revision', 'brand', 'allow', rev.error, (await status(A.id)).status)

  r = await creator.from('deal_deliverable_items').update({ item_status: 'submitted', external_url: 'https://example.com/v2', version: 2, submitted_at: now() }).eq('id', A.items[0])
  record('creator resubmits item', 'creator', 'allow', r.error)
  r = await creator.from('deals').update({ status: 'delivered' }).eq('id', A.id).in('status', ['agreed', 'revision'])
  record('creator resubmits: revision → delivered', 'creator', 'allow', r.error, (await status(A.id)).status)

  for (const it of A.items) {
    r = await brand.from('deal_deliverable_items').update({ item_status: 'approved', approved_at: now() }).eq('id', it)
    record('brand approves item', 'brand', 'allow', r.error)
  }
  r = await brand.from('deals').update({ status: 'approved' }).eq('id', A.id).in('status', ['delivered', 'revision'])
  record('brand approves deal: delivered → approved', 'brand', 'allow', r.error, (await status(A.id)).status)

  for (const it of A.items) {
    r = await creator.from('deal_deliverable_items').update({ posted_url: 'https://instagram.com/p/x', posted_at: now() }).eq('id', it)
    record('creator posts item', 'creator', 'allow', r.error)
  }
  r = await creator.from('deals').update({ is_posted: true, posted_url: 'https://instagram.com/p/x', posted_at: now() }).eq('id', A.id)
  record('creator marks deal posted (after approval)', 'creator', 'allow', r.error)

  // invoices: generate / issue / accept are service-role writes now (0521)
  let inv = await admin.from('invoices').insert({
    deal_id: A.id, status: 'draft', base_paise: 2_200_000, overage_paise: 0, fee_paise: 330_000, fee_percent: 15,
    fee_mode: 'deducted', brand_pays_paise: 2_200_000, creator_receives_paise: 1_870_000, payment_terms: 'Net 30', payment_due_days: 30,
  }).select('id').single()
  record('generateInvoice (service role)', 'server', 'allow', inv.error)
  const invId = inv.data?.id
  let u = await admin.from('invoices').update({ status: 'issued', issued_at: now() }).eq('id', invId).eq('status', 'draft')
  record('issueInvoice (service role)', 'server', 'allow', u.error)
  u = await admin.from('invoices').update({ status: 'accepted', accepted_at: now() }).eq('id', invId).eq('status', 'issued')
  record('acceptInvoice (service role)', 'server', 'allow', u.error)

  const paid = await brand.rpc('mark_deal_paid', { p_deal_id: A.id })
  const after = await status(A.id)
  const paidRes = paid.data as { status?: string; message?: string } | null
  record('brand mark_deal_paid RPC: approved → paid → complete', 'brand', 'allow',
    paid.error ?? (paidRes?.status === 'error' ? { message: paidRes.message ?? 'rpc error' } : null), after.status)
  if (!paid.error && after.status !== 'complete') rows[rows.length - 1] = { ...rows[rows.length - 1], ok: false, detail: `ended as ${after.status}` }

  // ── Deal B: creator accepts the brand's offer ──────────────────────────────
  const B = await newDeal(brand, ids, 'B creator accepts')
  r = await creator.from('deals').update({ status: 'agreed', rights_confirmed_at: now() }).eq('id', B.id).eq('status', 'negotiating')
  record('creator accepts: negotiating → agreed', 'creator', 'allow', r.error, (await status(B.id)).status)

  // ── Deal C: creator accepts a brand counter (price applied) ────────────────
  const C = await newDeal(brand, ids, 'C creator accepts brand counter')
  r = await creator.from('deals').update({ status: 'agreed', rights_confirmed_at: now(), price_paise: 1_800_000 }).eq('id', C.id).eq('status', 'negotiating')
  record('creator accepts brand counter: negotiating → agreed (+price)', 'creator', 'allow', r.error, (await status(C.id)).status)

  // ── Deal D: creator declines ──────────────────────────────────────────────
  const D = await newDeal(brand, ids, 'D creator declines')
  r = await creator.from('deals').update({ status: 'declined' }).eq('id', D.id).eq('status', 'negotiating')
  record('creator declines: negotiating → declined', 'creator', 'allow', r.error, (await status(D.id)).status)

  // ── Deal E: createDeal rollback (items failed) ─────────────────────────────
  const E = await newDeal(brand, ids, 'E rollback')
  r = await brand.from('deals').update({ status: 'cancelled' }).eq('id', E.id)
  record('createDeal rollback: negotiating → cancelled', 'brand', 'allow', r.error, (await status(E.id)).status)

  // ── Refusals on B (agreed): spot checks the guard still blocks ─────────────
  r = await brand.from('deals').update({ fee_percent: 0 }).eq('id', B.id)
  record('brand sets fee 0', 'brand', 'refuse', r.error)
  r = await brand.from('deals').update({ status: 'complete' }).eq('id', B.id)
  record('brand jumps agreed → complete', 'brand', 'refuse', r.error)
  r = await creator.from('deals').update({ price_paise: 99_000_000 }).eq('id', B.id)
  record('creator raises price on an agreed deal', 'creator', 'refuse', r.error)
  r = await creator.from('deals').update({ is_posted: true }).eq('id', B.id)
  record('creator marks posted before approval', 'creator', 'refuse', r.error)
  r = await brand.from('deals').insert({ ...ids, title: 'x', deliverables: 'x', price_paise: 1, status: 'negotiating' })
  record('brand inserts a deal directly', 'brand', 'refuse', r.error)

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('\nPhase 0 deal-guard walk (staging)\n')
  for (const x of rows) {
    const mark = x.ok ? '✅' : (x.expect === 'allow' ? '❌ REGRESSION' : '❌ NOT BLOCKED')
    console.log(`${mark}  [${x.who}] ${x.step}${x.expect === 'refuse' ? ' (should refuse)' : ''} — ${x.detail}`)
  }
  const bad = rows.filter(x => !x.ok)
  console.log(bad.length ? `\n${bad.length} FAILED` : `\nALL ${rows.length} PASSED`)
  if (bad.length) process.exitCode = 1
}

run()
  .catch(e => { console.error('Walk error:', e); process.exitCode = 1 })
  .finally(async () => {
    // Clean up the [guard-walk] deals and everything hanging off them.
    for (const id of made) {
      await admin.from('invoices').delete().eq('deal_id', id)
      await admin.from('deal_deliverable_items').delete().eq('deal_id', id)
      await admin.from('messages').delete().eq('deal_id', id)
      await admin.from('events').delete().eq('deal_id', id)
      await admin.from('notifications').delete().eq('deal_id', id)
      const { error } = await admin.from('deals').delete().eq('id', id)
      if (error) console.log(`  cleanup: could not delete ${id}: ${error.message}`)
    }
    console.log(`Cleaned up ${made.length} [guard-walk] deals.`)
  })
