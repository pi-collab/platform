/**
 * 0581: PAN is required with a creator's bank account, against STAGING with a
 * real creator session. Picks a creator who has NO payout details of their own,
 * saves test details through the real (encrypted) path, and removes them after.
 *
 *   - saving a bank account with no PAN on file is refused
 *   - a wrong PAN is refused
 *   - with a PAN it saves, read back masked
 *   - re-saving with the PAN box empty KEEPS the PAN on file (before 0581 it erased it)
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-creator-pan-required.ts
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
const said = (r: { error: { message: string } | null }, re: RegExp) => !!r.error && re.test(r.error.message)
let vendorId: string | null = null, vendorMadeHere = false

async function sessionFor(authId: string): Promise<SupabaseClient> {
  const { data: u } = await admin.auth.admin.getUserById(authId)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! })
  const s = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session')
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${s.access_token}` } }, auth: { persistSession: false } })
}

async function run() {
  const { data: withDetails } = await admin.from('vendor_payout_details').select('vendor_id, vendors(creator_id)')
  const taken = new Set(((withDetails ?? []) as any[]).map((r) => r.vendors?.creator_id).filter(Boolean))
  const { data: cr } = await admin.from('creators').select('id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null).limit(100)
  const C = ((cr ?? []) as any[]).find((c) => c.users?.auth_id && !taken.has(c.id))
  if (!C) throw new Error('no creator without payout details')
  vendorMadeHere = !(await admin.from('vendors').select('id').eq('creator_id', C.id).maybeSingle()).data
  const s = await sessionFor(C.users.auth_id)
  const save = (pan: string | null) => s.rpc('creator_set_payout_details', { p_holder: 'Test Creator', p_account: '501004433221', p_account_confirm: '501004433221', p_ifsc: 'HDFC0001234', p_pan: pan, p_gst_registered: false })

  console.log('\nPAN is required with the bank account')
  ok('no PAN, none on file: refused', said(await save(null), /Enter your PAN/))
  ok('…and nothing was saved', (await s.rpc('creator_payout_details')).data?.on_file === false)
  ok('a wrong PAN: refused', said(await save('ABC123'), /PAN looks wrong/))
  const r1 = await save('abcpt1234q')
  vendorId = (await admin.from('vendors').select('id').eq('creator_id', C.id).maybeSingle()).data?.id ?? null
  ok('with a PAN (any case): saved, read back masked', !r1.error && r1.data?.on_file === true && r1.data?.pan_masked === '••••••234Q', JSON.stringify(r1.error ?? r1.data?.pan_masked))
  const r2 = await save('')
  ok('re-saved with the PAN box empty: the PAN on file is KEPT', !r2.error && r2.data?.pan_masked === '••••••234Q' && r2.data?.changed === false, JSON.stringify(r2.error ?? { pan: r2.data?.pan_masked, changed: r2.data?.changed }))
  const r3 = await save('ABCPT9999Z')
  ok('a new PAN replaces it, and counts as a change', !r3.error && r3.data?.pan_masked === '••••••999Z' && r3.data?.changed === true)
}

run().catch((e) => { failed++; console.error('❌ run aborted:', e.message) }).finally(async () => {
  if (vendorId) {
    await admin.from('vendor_payout_detail_changes').delete().eq('vendor_id', vendorId)
    await admin.from('vendor_payout_details').delete().eq('vendor_id', vendorId)
    if (vendorMadeHere) await admin.from('vendors').delete().eq('id', vendorId)
    const left = ((await admin.from('vendor_payout_details').select('vendor_id').eq('vendor_id', vendorId)).data ?? []).length
    ok('cleanup: the test bank details are gone', left === 0)
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`)
  process.exit(failed ? 1 : 0)
})
