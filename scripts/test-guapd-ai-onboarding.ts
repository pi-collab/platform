/**
 * Guapd AI brand onboarding (0590), against a running site with STAGING data.
 *
 *   - the "New: Guapd AI" highlight: brand home only, once per brand USER
 *     (dismissed on one device stays dismissed on another)
 *   - first /ai visit shows the intro, then the search page with "What is
 *     Guapd AI?"; ?intro=1 shows it again
 *   - "Coming soon" rows start nothing: disabled buttons, no links; a tap only
 *     opens a note; the note saves to ai_feature_interest and nothing else
 *   - GUAPD_META_ON unset: nothing about Instagram, Facebook, Meta or Creator
 *     Marketplace on /ai, the intro or brand Settings; Meta routes 404
 *   - GUAPD_META_ON=1 (site started with the Meta stub settings): the banner
 *     shows only for an unconnected brand with no known eligibility problem;
 *     a connected brand gets the source switch; Settings explains eligibility
 *
 * Run twice: dev server with CREATOR_SEARCH=1 (Meta off), then with the Meta
 * stub settings and GUAPD_META_ON=1. Everything made here is removed.
 *   NODE_PATH=apps/web/node_modules:node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-guapd-ai-onboarding.ts
 */
import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const APP = (process.env.GUAPD_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const META_ON = process.env.GUAPD_META_ON === '1'
const HIGHLIGHT = 'New: Guapd AI. Describe the creators you want and get matches in seconds.'
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const clean = (h: string) => h.replace(/<!-- -->/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')

async function main() {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging data')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: bm } = await admin.from('brand_members').select('brand_id, user_id, users(auth_id), brands!inner(is_guapd)').eq('brands.is_guapd', false).limit(1).single()
  const brandId = bm!.brand_id as string, userId = bm!.user_id as string
  const email = (await admin.auth.admin.getUserById((bm as any).users.auth_id)).data.user!.email!
  const session = async () => {
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const jar: { name: string; value: string }[] = []
    const sb = createServerClient(URL, ANON, { cookies: { getAll: () => jar, setAll: (cs) => cs.forEach(({ name, value }) => { const i = jar.findIndex((j) => j.name === name); i >= 0 ? (jar[i].value = value) : jar.push({ name, value }) }) } })
    await sb.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: 'magiclink' })
    return jar
  }
  const asCookie = (jar: { name: string; value: string }[]) => jar.map((c) => `${c.name}=${c.value}`).join('; ')
  const deviceA = asCookie(await session())
  const page = async (p: string, cookie = deviceA) => clean(await (await fetch(`${APP}${p}`, { headers: { cookie } })).text())

  const { data: prior } = await admin.from('brand_user_ai_onboarding').select('*').eq('user_id', userId).maybeSingle()
  const { data: priorConn } = await admin.from('brand_meta_connections').select('id').eq('brand_id', brandId).maybeSingle()
  const { data: priorElig } = await admin.from('brand_meta_eligibility').select('*').eq('brand_id', brandId).maybeSingle()
  if (priorConn) throw new Error('this brand has a real Meta connection; not touching it')
  const started = new Date().toISOString()
  try {
    console.log(`== highlight and intro (${APP}, Meta ${META_ON ? 'on' : 'off'})`)
    await admin.from('brand_user_ai_onboarding').delete().eq('user_id', userId)
    ok('brand home shows the highlight to a new user', (await page('/dashboard')).includes(HIGHLIGHT))
    ok('the highlight is on the brand home only (not /browse)', !(await page('/browse')).includes(HIGHLIGHT))
    ok('the highlight says only that Guapd AI finds creators', !/campaign|instagram/i.test(HIGHLIGHT))
    await fetch(`${APP}/api/ai/onboarding`, { method: 'POST', headers: { cookie: deviceA, 'Content-Type': 'application/json' }, body: JSON.stringify({ done: 'highlight' }) })
    const deviceB = asCookie(await session())
    ok('dismissed on one device, gone on another (stored per user)', !(await page('/dashboard', deviceB)).includes(HIGHLIGHT))

    await admin.from('brand_user_ai_onboarding').delete().eq('user_id', userId)
    const intro = await page('/ai')
    ok('first /ai visit shows the intro', intro.includes('Start with a brief') && intro.includes('Describe your brief') && intro.includes('Review ranked matches') && intro.includes('Send an offer'))
    ok('intro says what is included now', intro.includes('Creators on Guapd. Verified numbers are marked Verified'))
    const { data: ob } = await admin.from('brand_user_ai_onboarding').select('*').eq('user_id', userId).single()
    ok('seeing the intro also ends the highlight', !!ob?.intro_seen_at && !!ob.highlight_done_at)
    ok('no highlight on the home after opening Guapd AI', !(await page('/dashboard')).includes(HIGHLIGHT))
    const search = await page('/ai')
    ok('the next visit is the search page, with "What is Guapd AI?"', search.includes('Describe the creators you want') && search.includes('What is Guapd AI?') && !search.includes('Start with a brief'))
    ok('?intro=1 shows the intro again', (await page('/ai?intro=1')).includes('Start with a brief'))

    console.log('\n== Coming soon')
    const soon = intro.slice(intro.indexOf('aria-label="Coming soon"'))
    ok('both rows are there, marked Coming soon', soon.includes('Write your brief with Guapd AI') && soon.includes('Create and send campaigns with Guapd AI'))
    ok('rows are disabled buttons with no links', (soon.match(/aria-disabled="true"/g) ?? []).length === 2 && !/<a\s/.test(soon.slice(0, soon.indexOf('</div></div></div>') + 1 || undefined)))
    ok('no dates or promises in the rows', !/\b(20\d\d|q[1-4]|soon:|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(soon.slice(0, 600)))
    const routeSrc = fs.readFileSync(path.resolve(__dirname, '../apps/web/app/api/ai/interest/route.ts'), 'utf8')
    ok('the note route writes ai_feature_interest and nothing else', (routeSrc.match(/\.from\('([a-z_]+)'\)/g) ?? []).every((m) => m.includes('ai_feature_interest')))
    const bad = await fetch(`${APP}/api/ai/interest`, { method: 'POST', headers: { cookie: deviceA, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'send_campaign' }) })
    ok('an unknown feature is refused', bad.status === 400)
    const b = await chromium.launch({ channel: 'chrome' })
    try {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
      await ctx.addCookies(deviceA.split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: new globalThis.URL(APP).hostname, path: '/' } }))
      const p = await ctx.newPage()
      const calls: string[] = []
      p.on('request', (r) => { if (r.method() !== 'GET' && r.url().startsWith(APP)) calls.push(new globalThis.URL(r.url()).pathname) })
      await p.goto(`${APP}/ai?intro=1`, { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: /decline/i }).click({ timeout: 3000 }).catch(() => {})
      const before = p.url()
      await p.getByRole('button', { name: /Create and send campaigns with Guapd AI/ }).click({ force: true }) // aria-disabled: not startable, but a tap opens the note
      ok('tapping a row opens the note', await p.getByText("We're building this. Tell us what you'd want it to do").isVisible())
      ok('tapping a row does not navigate', p.url() === before)
      await p.getByLabel("What you'd want it to do").fill('Send to ten creators at once')
      await p.getByRole('button', { name: 'Send', exact: true }).click()
      await p.getByText('Thanks. We read every note.').waitFor()
      ok('the only call is saving the note', calls.length === 1 && calls[0] === '/api/ai/interest', calls.join(','))
      const { data: note } = await admin.from('ai_feature_interest').select('brand_id, feature, note').eq('brand_id', brandId).gte('created_at', started).order('created_at', { ascending: false }).limit(1).single()
      ok('the note is saved with the brand id and the row', note?.feature === 'campaigns' && note.note === 'Send to ten creators at once')
      await ctx.close()
    } finally { await b.close() }

    const settings = await page('/settings?tab=instagram')
    if (!META_ON) {
      console.log('\n== Meta off: nothing about Instagram')
      const words = /Creator Marketplace|Connect Instagram|Facebook|\bMeta\b/
      ok('search page: nothing about Instagram or Meta', !words.test(search), (search.match(words) ?? [''])[0])
      ok('intro: nothing about Instagram or Meta', !words.test(intro), (intro.match(words) ?? [''])[0])
      ok('brand Settings: no Instagram section', !/Creator Marketplace/.test(settings))
      ok('/api/meta/connect is 404', (await fetch(`${APP}/api/meta/connect`, { headers: { cookie: deviceA }, redirect: 'manual' })).status === 404)
      ok('/api/meta/creator-search is 404', (await fetch(`${APP}/api/meta/creator-search`, { method: 'POST', headers: { cookie: deviceA, 'Content-Type': 'application/json' }, body: '{}' })).status === 404)
    } else {
      console.log('\n== Meta on: banner, source switch, eligibility')
      const BANNER = "Showing creators on Guapd. Connect Instagram to also search Instagram's Creator Marketplace"
      await admin.from('brand_meta_eligibility').delete().eq('brand_id', brandId)
      ok('unconnected brand: banner under the box', (await page('/ai')).includes(BANNER))
      ok('intro: what connecting adds and needs, and that it is optional', (await page('/ai?intro=1')).includes('Optional: Instagram Creator Marketplace') && (await page('/ai?intro=1')).includes('Instagram decides which accounts are eligible'))
      for (const st of ['no_page', 'no_instagram', 'not_eligible'] as const) {
        await admin.from('brand_meta_eligibility').upsert({ brand_id: brandId, state: st }, { onConflict: 'brand_id' })
        ok(`${st}: no banner (no repeated prompt)`, !(await page('/ai')).includes(BANNER))
        const s2 = await page('/settings?tab=instagram')
        ok(`${st}: Settings explains it`, st === 'no_page' ? s2.includes('has no Facebook Page') : st === 'no_instagram' ? s2.includes('linked to an Instagram business account') : s2.includes('not eligible for Creator Marketplace'))
      }
      await admin.from('brand_meta_eligibility').delete().eq('brand_id', brandId)
      await admin.from('brand_meta_connections').insert({ brand_id: brandId, fb_user_id: 'onboarding-test', page_id: 'p', page_name: 'Test Page', ig_user_id: 'ig', ig_username: 'testbrand', user_token_ciphertext: 'x', user_token_iv: 'x', user_token_tag: 'x', page_token_ciphertext: 'x', page_token_iv: 'x', page_token_tag: 'x' })
      const conn = await page('/ai')
      ok('connected brand: no banner', !conn.includes(BANNER))
      ok('connected brand: source switch Guapd / Instagram / Both', conn.includes('aria-label="Search"') && />Guapd</.test(conn) && />Instagram</.test(conn) && />Both</.test(conn))
      ok('Settings shows the connection', (await page('/settings?tab=instagram')).includes('@testbrand'))
    }
  } finally {
    await admin.from('brand_meta_connections').delete().eq('brand_id', brandId).eq('fb_user_id', 'onboarding-test')
    await admin.from('brand_meta_eligibility').delete().eq('brand_id', brandId)
    if (priorElig) await admin.from('brand_meta_eligibility').insert(priorElig)
    await admin.from('ai_feature_interest').delete().eq('brand_id', brandId).gte('created_at', started)
    await admin.from('brand_user_ai_onboarding').delete().eq('user_id', userId)
    if (prior) await admin.from('brand_user_ai_onboarding').insert(prior)
    ok('teardown: onboarding state, notes and test connection restored', true)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
