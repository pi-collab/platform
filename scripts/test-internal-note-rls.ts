/**
 * deals.internal_note is the BRAND's private note ("brand-only, never shown to
 * creator", migration 0220). This checks, with a real creator login, that the
 * creator on a deal cannot read it through the API.
 *
 * Since 0527 the note lives in deal_brand_notes (brand-only read) and the old
 * deals.internal_note column is dropped. The test writes ONE temporary note on
 * a real deal with the service role and deletes it at the end.
 *
 * Run from the repo root:
 *   NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx scripts/test-internal-note-rls.ts
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

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const res = await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })
  const s = await res.json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function run() {
  // Any deal whose creator and brand can both sign in.
  const { data: deals } = await admin.from('deals').select('id, brand_id, creator_id').limit(50)
  let deal: { id: string; brand_id: string; creator_id: string } | undefined, cAuth = '', bAuth = ''
  for (const d of deals ?? []) {
    const { data: cr } = await admin.from('creators').select('users(auth_id)').eq('id', d.creator_id).maybeSingle()
    const { data: bm } = await admin.from('brand_members').select('users(auth_id)').eq('brand_id', d.brand_id).limit(1).maybeSingle()
    const c = (cr?.users as any)?.auth_id, b = (bm?.users as any)?.auth_id
    if (c && b) { deal = d; cAuth = c; bAuth = b; break }
  }
  if (!deal) throw new Error('no deal with both a creator and a brand login')

  const creator = await sessionFor(cAuth)
  const brand = await sessionFor(bAuth)

  const { data: prior } = await admin.from('deal_brand_notes').select('deal_id, note').eq('deal_id', deal.id).maybeSingle()
  const MARK = `rls-test ${Date.now()}`
  await admin.from('deal_brand_notes').upsert({ deal_id: deal.id, note: MARK })
  try {
    console.log('\nthe old column')
    const col = await creator.from('deals').select('id, internal_note').eq('id', deal.id).maybeSingle()
    ok('deals.internal_note no longer exists (nothing left to leak)', !!col.error && /internal_note/.test(col.error.message), col.error?.message ?? 'COLUMN STILL READABLE')

    console.log('\ncreator on the deal')
    const own = await creator.from('deals').select('id').eq('id', deal.id).maybeSingle()
    ok('creator can still read their own deal (control)', !!own.data, own.error?.message ?? '')
    const cn = await creator.from('deal_brand_notes').select('deal_id, note').eq('deal_id', deal.id)
    ok('creator CANNOT read the brand note on their own deal', !cn.error && (cn.data ?? []).length === 0, cn.error?.message ?? `${cn.data?.length} row(s) returned`)
    const cw = await creator.from('deal_brand_notes').upsert({ deal_id: deal.id, note: 'creator write' })
    ok('creator CANNOT write a brand note', !!cw.error, cw.error?.message ?? 'WRITE ALLOWED')

    console.log('\nbrand on the deal')
    const bn = await brand.from('deal_brand_notes').select('deal_id, note').eq('deal_id', deal.id).maybeSingle()
    ok('brand reads its own note', bn.data?.note === MARK, bn.error?.message ?? '')
    const bw = await brand.from('deal_brand_notes').upsert({ deal_id: deal.id, note: 'brand direct write' })
    ok('brand cannot write directly either (server action only)', !!bw.error, bw.error?.message ?? 'WRITE ALLOWED')
  } finally {
    if (prior) await admin.from('deal_brand_notes').upsert(prior)
    else await admin.from('deal_brand_notes').delete().eq('deal_id', deal.id)
  }

  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  if (failed) process.exitCode = 1
}
run().catch(e => { console.error(e); process.exitCode = 1 })
