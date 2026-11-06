/**
 * Regression: the two kinds of invite stay on their own routes.
 *
 *   /invite/<token>          the BRAND TEAM invite (Settings → Team), brand_invites
 *   /creator-invite/<token>  the creator campaign invite (0587), reached ONLY
 *                            as guapd.com/c/i-<token>, brand_creator_invites
 *
 * 0e699e6 (staging only, fixed in ec8e058) wrote the creator invite page over
 * the team invite page. This checks the files, that prod (origin/main) has
 * the same team invite page, and both routes live with STAGING data.
 *
 *   GUAPD_BASE_URL (default http://localhost:3000); GUAPD_STAGING_AUTH_FILE for
 *   the deployed staging site's basic auth (never printed).
 *   NODE_PATH=apps/web/node_modules:node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-invite-routes.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { randomBytes } from 'crypto'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(__dirname, '..')
const BASE = (process.env.GUAPD_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
let auth: Record<string, string> = {}
if (process.env.GUAPD_STAGING_AUTH_FILE) {
  const raw = fs.readFileSync(process.env.GUAPD_STAGING_AUTH_FILE.replace(/^~/, os.homedir()), 'utf8').trim()
  auth = { authorization: `Basic ${Buffer.from(raw).toString('base64')}` }
}
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

async function main() {
  console.log('== files')
  const team = read('apps/web/app/invite/[token]/page.tsx')
  const creator = read('apps/web/app/creator-invite/[token]/page.tsx')
  ok('/invite/[token] is the team invite (brand_invites, AcceptInviteCard)', team.includes("from('brand_invites')") && team.includes('AcceptInviteCard') && !team.includes('brand_creator_invites'))
  ok('/invite/[token] holds only the team invite files', fs.readdirSync(path.join(ROOT, 'apps/web/app/invite/[token]')).sort().join(',') === 'AcceptInviteCard.tsx,page.tsx')
  ok('/creator-invite/[token] is the creator invite (brand_creator_invites)', creator.includes("from('brand_creator_invites')") && !creator.includes("from('brand_invites')"))
  const mw = read('apps/web/middleware.ts')
  ok('middleware rewrites /c/i-<token> to /creator-invite/, never /invite/', mw.includes('url.pathname = `/creator-invite/${inviteMatch[1]}`') && !/pathname = `\/invite\//.test(mw))
  const anyOther = execSync(`grep -rln "brand_creator_invites" ${path.join(ROOT, 'apps/web/app')} || true`).toString().trim().split('\n').filter(Boolean).map((f) => path.relative(ROOT, f))
  ok('no team-invite file reads creator invites', !anyOther.some((f) => f.startsWith('apps/web/app/invite/')), anyOther.join(', '))

  console.log('\n== prod (origin/main)')
  execSync('git fetch -q origin main', { cwd: ROOT })
  const prodTeam = execSync('git show "origin/main:apps/web/app/invite/[token]/page.tsx"', { cwd: ROOT }).toString()
  ok('prod team invite page is identical to this one', prodTeam === team)
  const prodHasCreatorInvite = execSync('git ls-tree -r --name-only origin/main -- apps/web/app/creator-invite', { cwd: ROOT }).toString().trim()
  ok('prod has no creator invite route', prodHasCreatorInvite === '')
  const bad = execSync('git branch -r --contains 0e699e6 || true', { cwd: ROOT }).toString()
  ok('the overwrite commit never reached main', !/origin\/main/.test(bad))

  console.log(`\n== live: ${BASE}`)
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging data')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, brands!inner(name, is_guapd)').eq('brands.is_guapd', false).limit(1).single()
  const brandName = (bm as any).brands.name as string
  const made = { team: '' as string, search: '' as string, creatorInvite: '' as string }
  const get = (p: string) => fetch(`${BASE}${p}`, { headers: auth, redirect: 'manual' })
  // React separates joined text with <!-- --> in server HTML.
  const text = async (r: Response) => (await r.text()).replace(/<!-- -->/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
  try {
    const teamToken = randomBytes(32).toString('hex')
    const { data: ti } = await admin.from('brand_invites').insert({ brand_id: bm!.brand_id, email: 'regression-team-invite@example.test', token: teamToken, invited_by: bm!.user_id, expires_at: new Date(Date.now() + 86400e3).toISOString() }).select('id').single()
    made.team = ti!.id
    const r1 = await get(`/invite/${teamToken}`)
    const h1 = await text(r1)
    ok('team invite link works: "Join <brand>" for a signed-out visitor', r1.status === 200 && h1.includes(`Join ${brandName}`) && h1.includes('regression-team-invite@example.test'), `${r1.status}`)
    ok('team invite page is not the creator invite page', !h1.includes('Campaign invite for'))
    const r2 = await text(await get('/invite/not-a-real-token'))
    ok('an unknown team token: "Invalid invite link."', r2.includes('Invalid invite link'))
    ok('a team token is not served at /creator-invite/', (await get(`/creator-invite/${teamToken}`)).status === 404)

    const { data: s } = await admin.from('brand_creator_searches').insert({ brand_id: bm!.brand_id, brief: 'regression', filters: {} }).select('id').single()
    made.search = s!.id
    const ctoken = 'i-' + Array.from(randomBytes(26), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
    const { data: ci } = await admin.from('brand_creator_invites').insert({ brand_id: bm!.brand_id, search_id: s!.id, token: ctoken, ig_username: 'regression_creator', summary: 'Regression check.' }).select('id').single()
    made.creatorInvite = ci!.id
    const r3 = await get(`/c/${ctoken}`)
    if (r3.status === 404) {
      console.log('  ⏭  creator invites are switched off on this site (needs CREATOR_INVITES=1 or META_CREATOR_MARKETPLACE=1), so /c/i-<token> is 404 as expected')
    } else {
      ok('creator invite works at /c/i-<token>', r3.status === 200 && (await text(r3)).includes('Campaign invite for @regression_creator'))
    }
    const r4 = await text(await get(`/invite/${ctoken}`))
    ok('a creator invite token is not served at /invite/ (team page says invalid)', r4.includes('Invalid invite link') && !r4.includes('Campaign invite for'))
  } finally {
    if (made.team) await admin.from('brand_invites').delete().eq('id', made.team)
    if (made.creatorInvite) await admin.from('brand_creator_invites').delete().eq('id', made.creatorInvite)
    if (made.search) await admin.from('brand_creator_searches').delete().eq('id', made.search)
    const { count } = await admin.from('brand_invites').select('id', { count: 'exact', head: true }).eq('email', 'regression-team-invite@example.test')
    ok('teardown: test invites removed', (count ?? 0) === 0)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
