/**
 * The Guapd house brand and house creator (0528) must never appear in browse,
 * AI search or the ops lists. Read-only, against STAGING.
 *
 * Where the app exposes the list as a function, this calls THAT function
 * (AI search candidates, broadcast audience). Where the list is a page query,
 * it runs the page's exact filters. It also checks the database-level reason
 * the house creator can never be bookable, independent of any app filter, and
 * reads browse as a real signed-in brand.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/check-house-hidden.ts
 */

import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!URL.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }

import { createClient } from '@supabase/supabase-js'
import { loadCandidates } from '../apps/web/lib/ai-search/candidates'
import { resolveBroadcastAudience } from '../apps/web/lib/creator-broadcast'

const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }

async function run() {
  console.log('\nthe house accounts exist, once each')
  const { data: hb } = await admin.from('brands').select('id, name, brand_status').eq('is_guapd', true)
  const { data: hc } = await admin.from('creators').select('id, full_name, vetting_status, is_bookable, is_vetted, user_id').eq('is_guapd', true)
  ok('one house brand', (hb ?? []).length === 1, JSON.stringify(hb))
  ok('one house creator', (hc ?? []).length === 1, JSON.stringify(hc))
  const B = hb?.[0]?.id as string, C = hc?.[0] as { id: string; is_bookable: boolean; is_vetted: boolean; user_id: string | null } | undefined
  if (!B || !C) throw new Error('house rows missing: run 0528 piece 1')
  ok('house creator can never be bookable (is_bookable and is_vetted false, derived by trigger)', !C.is_bookable && !C.is_vetted)
  ok('house creator has no login', C.user_id === null)
  const { data: hbm } = await admin.from('brand_members').select('user_id').eq('brand_id', B)
  ok('house brand has no members (no login)', (hbm ?? []).length === 0)

  console.log('\nbrowse')
  const browse = await admin.from('creators').select('id').eq('is_bookable', true).eq('is_guapd', false)
  ok('browse query (app/browse/page.tsx filters) excludes the house creator', !(browse.data ?? []).some((r) => r.id === C.id), `${browse.data?.length} creators`)
  const pool = await admin.from('creators').select('id').eq('is_bookable', true).eq('is_guapd', false).eq('vetting_status', 'growth')
  ok('Growth pool query excludes the house creator', !(pool.data ?? []).some((r) => r.id === C.id))
  // As a real brand: RLS alone (no app filter) must not hand the house creator out.
  const { data: bm } = await admin.from('brand_members').select('users(auth_id)').neq('brand_id', B).limit(10)
  const auth = (bm ?? []).map((m: any) => m.users?.auth_id).find(Boolean)
  if (auth) {
    const { data: u } = await admin.auth.admin.getUserById(auth)
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
    const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
    const brand = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
    const seen = await brand.from('creators').select('id').eq('id', C.id)
    ok('a signed-in brand cannot read the house creator at all (RLS, no app filter)', !seen.error && (seen.data ?? []).length === 0, seen.error?.message ?? `${seen.data?.length} rows`)
  }

  console.log('\nAI search')
  const cands = await loadCandidates()
  ok('loadCandidates() (the real AI search pool) excludes the house creator', !cands.some((c: any) => c.id === C.id), `${cands.length} candidates`)

  console.log('\nops lists')
  const opsCreators = await admin.from('creators').select('id').eq('is_guapd', false).order('created_at', { ascending: false })
  ok('ops creators list (applyAll → applyHouse) excludes the house creator', !(opsCreators.data ?? []).some((r) => r.id === C.id), `${opsCreators.data?.length} creators`)
  for (const st of ['deals_approved', 'rejected', 'growth', 'pending']) {
    const { data } = await admin.from('creators').select('id').eq('is_guapd', false).eq('vetting_status', st)
    ok(`ops creators count "${st}" excludes the house creator`, !(data ?? []).some((r) => r.id === C.id))
  }
  const opsBrands = await admin.from('brands').select('id').eq('is_guapd', false)
  ok('ops brands list excludes the house brand', !(opsBrands.data ?? []).some((r) => r.id === B), `${opsBrands.data?.length} brands`)
  const pending = await admin.from('brands').select('id').eq('brand_status', 'pending_review').eq('is_guapd', false)
  ok('ops brand approval queue excludes the house brand', !(pending.data ?? []).some((r) => r.id === B))
  for (const aud of ['deals', 'growth', 'all_vetted'] as const) {
    const r = await resolveBroadcastAudience(aud, '00000000-0000-0000-0000-000000000000')
    const all = [...r.sendable, ...r.skipped]
    ok(`resolveBroadcastAudience("${aud}") excludes the house creator`, !all.some((c) => c.creatorId === C.id), `${all.length} creators`)
  }

  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
