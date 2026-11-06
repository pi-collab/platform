/**
 * The full creator sign-up on an invite, in a browser, on the deployed STAGING
 * site with a FRESH phone number:
 *   invite link → Sign up with your phone → code → onboarding → creator home
 *   shows the invite → invite page asks to connect Instagram → (Instagram
 *   connection simulated: a real one needs a real Instagram login) → Accept →
 *   tracked as opened, signed up, accepted; the brand is notified.
 *
 * Needs: GUAPD_BASE_URL (staging), GUAPD_STAGING_AUTH_FILE ("user:password",
 * never printed), GUAPD_TEST_PHONE (10 digits, a number the tester controls
 * and that has never been used on staging; staging may send it a real code by
 * WhatsApp/SMS). The code typed is staging's bypass code, so nobody has to
 * read it out. The staging site needs CREATOR_SEARCH=1 and CREATOR_INVITES=1
 * (Meta can stay off).
 *
 * Teardown deletes the invite, the search, the simulated Instagram row, the
 * notifications, and the test creator (creator, user, auth user), and lists
 * anything it could not delete.
 *
 *   NODE_PATH=apps/web/node_modules:node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-invite-signup-staging.ts [screenshot dir]
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'crypto'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = (process.env.GUAPD_BASE_URL || '').replace(/\/+$/, '')
const SHOTS = process.argv[2] || null
const PHONE = (process.env.GUAPD_TEST_PHONE || '').replace(/\D/g, '').slice(-10)
if (!BASE || !process.env.GUAPD_STAGING_AUTH_FILE || !/^[6-9]\d{9}$/.test(PHONE)) {
  console.error('Set GUAPD_BASE_URL, GUAPD_STAGING_AUTH_FILE and GUAPD_TEST_PHONE (10 digits).'); process.exit(2)
}
const rawAuth = fs.readFileSync(process.env.GUAPD_STAGING_AUTH_FILE.replace(/^~/, os.homedir()), 'utf8').trim()
const httpCredentials = { username: rawAuth.slice(0, rawAuth.indexOf(':')), password: rawAuth.slice(rawAuth.indexOf(':') + 1) }
const masked = `${PHONE.slice(0, 2)}******${PHONE.slice(-2)}`

let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }

async function main() {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging data')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  console.log(`target: ${BASE}, phone ${masked}`)

  // Fresh: no user, creator or auth account with this number.
  const variants = [PHONE, `91${PHONE}`, `+91${PHONE}`]
  const [{ count: u }, { count: c }] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).in('phone', variants),
    admin.from('creators').select('id', { count: 'exact', head: true }).in('phone', variants),
  ])
  const authUsers = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((x) => x.phone && x.phone.endsWith(PHONE))
  if ((u ?? 0) + (c ?? 0) + authUsers.length > 0) { console.error(`That number is already on staging (${masked}). Use a fresh one.`); process.exit(2) }
  ok('the number is fresh on staging', true)

  const { data: bm } = await admin.from('brand_members').select('brand_id, brands!inner(name, is_guapd)').eq('brands.is_guapd', false).limit(1).single()
  const brandName = (bm as any).brands.name as string
  const IG = `guapd_test_${randomBytes(3).toString('hex')}`
  const made = { search: '', invite: '', creatorId: '', userId: '', authId: '', started: new Date().toISOString() }
  const { data: s } = await admin.from('brand_creator_searches').insert({ brand_id: bm!.brand_id, brief: 'Invite sign-up test', filters: {} }).select('id').single()
  made.search = s!.id
  const token = 'i-' + Array.from(randomBytes(26), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
  const { data: inv } = await admin.from('brand_creator_invites').insert({ brand_id: bm!.brand_id, search_id: s!.id, token, ig_username: IG, summary: 'Home styling creators for a home fragrance launch.', deliverables: ['reels'] }).select('id').single()
  made.invite = inv!.id

  const b = await chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, httpCredentials })
  const p = await ctx.newPage()
  const shot = async (n: string) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/signup-${n}.png`, fullPage: true }) }
  try {
    await p.goto(`${BASE}/c/${token}`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: /decline/i }).click({ timeout: 3000 }).catch(() => {})
    ok('the invite page opens for a visitor', await p.getByText(`Campaign invite for @${IG}`).isVisible())
    await shot('1-invite')
    await p.getByRole('link', { name: 'Sign up with your phone' }).click()
    await p.waitForURL(/\/signup\/creator/)
    await p.getByLabel('Mobile number').fill(PHONE)
    await p.getByRole('button', { name: 'Send code' }).click()
    await p.getByRole('button', { name: /Verify & continue/ }).waitFor()
    await shot('2-code')
    await p.keyboard.type('000000')
    await p.waitForURL(/onboarding|creator\//, { timeout: 30000 })
    ok('phone + code accepted, on to onboarding', /onboarding/.test(p.url()), p.url().replace(BASE, ''))
    await p.getByLabel('Full name').fill('Invite Test Creator')
    await p.locator('input[aria-label$="handle"]').first().fill(IG)
    await p.locator('#follower-range').selectOption({ index: 1 })
    await p.locator('#creator-state').selectOption('Maharashtra')
    await p.getByLabel('City').fill('Mumbai')
    await p.locator('#age-bracket').selectOption('25_34')
    await p.locator('.onboard-terms input[type="checkbox"]').check()
    await shot('3-onboarding')
    await p.getByRole('button', { name: /Complete setup/ }).click()
    await p.waitForURL((u) => !/onboarding/.test(u.toString()), { timeout: 30000 })

    const { data: newUser } = await admin.from('users').select('id, auth_id').in('phone', variants).maybeSingle()
    const { data: newCreator } = newUser ? await admin.from('creators').select('id').eq('user_id', newUser.id).maybeSingle() : { data: null }
    made.userId = newUser?.id ?? ''; made.authId = newUser?.auth_id ?? ''; made.creatorId = newCreator?.id ?? ''
    ok('the account and creator profile were created', !!made.creatorId)

    await p.goto(`${BASE}/creator/dashboard`, { waitUntil: 'networkidle' })
    ok('creator home shows the invite', await p.getByText(`${brandName} invited you to a campaign`).first().isVisible().catch(() => false))
    await shot('4-home')
    await p.getByRole('link', { name: 'View invite' }).first().click()
    await p.waitForURL(new RegExp(`/c/${token}`))
    ok('the invite now asks to connect Instagram', await p.getByRole('link', { name: 'Connect Instagram' }).isVisible())
    await shot('5-connect')

    // Simulated: a real connection needs a real Instagram login.
    await admin.from('creator_instagram_connections').insert({ creator_id: made.creatorId, ig_user_id: 'invite-test', ig_app_scoped_id: 'invite-test-app', username: IG, account_type: 'MEDIA_CREATOR', status: 'connected', token_ciphertext: 'x', token_iv: 'x', token_tag: 'x', token_expires_at: new Date(Date.now() + 86400e3).toISOString(), last_synced_at: new Date().toISOString() })
    await p.reload({ waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Accept invite' }).click()
    await p.getByText(/Accepted\./).waitFor()
    ok('accepting works', true)
    await shot('6-accepted')

    const { data: row } = await admin.from('brand_creator_invites').select('opened_at, signed_up_at, accepted_at, creator_id').eq('id', made.invite).single()
    ok('tracked: opened, signed up, accepted, linked to the new creator', !!row?.opened_at && !!row.signed_up_at && !!row.accepted_at && row.creator_id === made.creatorId)
    const { count: n } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('type', 'creator_invite_accepted').gte('created_at', made.started)
    ok('the brand was notified', (n ?? 0) > 0)
  } finally {
    await b.close()
    const left: string[] = []
    const del = async (label: string, q: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await q; if (error) left.push(`${label}: ${error.message}`) }
    await del('invite', admin.from('brand_creator_invites').delete().eq('id', made.invite))
    await del('search', admin.from('brand_creator_searches').delete().eq('id', made.search))
    await del('notifications', admin.from('notifications').delete().eq('type', 'creator_invite_accepted').gte('created_at', made.started))
    if (made.creatorId) {
      await del('instagram row', admin.from('creator_instagram_connections').delete().eq('creator_id', made.creatorId))
      await del('creator', admin.from('creators').delete().eq('id', made.creatorId))
    }
    if (made.userId) await del('user', admin.from('users').delete().eq('id', made.userId))
    if (made.authId) { const { error } = await admin.auth.admin.deleteUser(made.authId); if (error) left.push(`auth user: ${error.message}`) }
    ok('teardown: test account and invite removed', left.length === 0, left.join(' | '))
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
