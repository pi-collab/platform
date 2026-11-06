/**
 * Guapd AI abuse controls (0591), against a running site with STAGING data,
 * calling the API directly (not only the buttons).
 *
 *   - an UNAPPROVED brand cannot create or send an invite; an invite row for
 *     it (planted with the service role) does not exist to the outside: page,
 *     open and accept all 404; Instagram Marketplace search is refused
 *   - an unapproved brand gets no more than /browse: city, language and
 *     engagement filters are not applied, cards carry only /browse fields
 *   - an APPROVED brand can create and mark-sent an invite; its summary is
 *     Guapd's own text, with no timeline
 *   - Load more reads the stored order: no creator twice, ends cleanly
 *   - forged requests fail (another brand's search, extra keys, bad shapes)
 *
 * Needs the site started with CREATOR_SEARCH=1 and META_CREATOR_MARKETPLACE=1
 * (and the Meta stub settings, see scripts/test-meta-marketplace.ts).
 *   NODE_PATH=apps/web/node_modules:node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-guapd-ai-abuse.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { EMPTY_BRIEF_FILTERS, PAGE_SIZE, type BriefFilters } from '../apps/web/lib/ai/creator-search-types'

const APP = (process.env.GUAPD_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const CARD_KEYS = ['gaps', 'handle', 'id', 'name', 'nicheTags', 'photoUrl', 'reason', 'selfReported', 'verified']

async function main() {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging data')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const login = async (status: 'approved' | 'unreviewed') => {
    const { data } = await admin.from('brand_members').select('brand_id, users(auth_id), brands!inner(brand_status, is_guapd)').eq('brands.brand_status', status).eq('brands.is_guapd', false).limit(1).single()
    const email = (await admin.auth.admin.getUserById((data as any).users.auth_id)).data.user!.email!
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const jar: { name: string; value: string }[] = []
    const sb = createServerClient(URL, ANON, { cookies: { getAll: () => jar, setAll: (cs) => cs.forEach(({ name, value }) => { const i = jar.findIndex((j) => j.name === name); i >= 0 ? (jar[i].value = value) : jar.push({ name, value }) }) } })
    await sb.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: 'magiclink' })
    return { brandId: data!.brand_id as string, cookie: jar.map((c) => `${c.name}=${c.value}`).join('; ') }
  }
  const A = await login('approved'), U = await login('unreviewed')
  const call = async (who: { cookie: string }, p: string, body: unknown) => {
    const r = await fetch(`${APP}${p}`, { method: 'POST', headers: { cookie: who.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, j: await r.json().catch(() => ({})) }
  }
  const E = EMPTY_BRIEF_FILTERS
  const F = (x: Partial<BriefFilters['hard']>): BriefFilters => ({ ...E, hard: { ...E.hard, ...x }, mustHave: { niches: [], keywords: [] }, summary: 'Test.' })
  const made = { searches: [] as string[], invites: [] as string[] }
  const search = async (brandId: string, filters: BriefFilters, extra: Record<string, unknown> = {}, raw = false) => {
    const stored = raw ? filters : { ...filters, mustHave: { niches: ['Home, Interior Design & DIY'], keywords: [] }, context: { productCategory: null, deliverables: ['reels'], tone: [], timeline: 'launch on 12 March, DM 9876543210' } }
    const { data } = await admin.from('brand_creator_searches').insert({ brand_id: brandId, brief: 'abuse test', filters: stored, ...extra }).select('id').single()
    made.searches.push(data!.id); return data!.id as string
  }
  try {
    console.log('== an unapproved brand and invites (API, not the button)')
    const us = await search(U.brandId, F({}))
    const c1 = await call(U, '/api/invites', { searchId: us, igUsername: 'abuse_test_creator' })
    ok('create an invite: 403 not_approved', c1.status === 403 && c1.j.kind === 'not_approved', `${c1.status}`)
    ok('no invite row was written', ((await admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).eq('brand_id', U.brandId)).count ?? 0) === 0)
    const planted = 'i-' + Array.from(randomBytes(26), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
    const { data: pi } = await admin.from('brand_creator_invites').insert({ brand_id: U.brandId, search_id: us, token: planted, ig_username: 'abuse_test_creator', summary: 'Planted.' }).select('id').single()
    made.invites.push(pi!.id)
    const sent = await call(U, '/api/invites/sent', { inviteId: pi!.id, via: 'copy' })
    ok('mark an invite sent: 403 not_approved', sent.status === 403)
    ok('an unapproved brand\'s invite link does not exist (404)', (await fetch(`${APP}/c/${planted}`)).status === 404)
    ok('opening it via the API: 404', (await fetch(`${APP}/api/invites/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: planted }) })).status === 404)
    ok('Instagram Marketplace search: 403', (await call(U, '/api/meta/creator-search', { searchId: us })).status === 403)
    const conn = await fetch(`${APP}/api/meta/connect`, { headers: { cookie: U.cookie }, redirect: 'manual' })
    ok('Facebook connect: sent back, no login started', (conn.headers.get('location') ?? '').includes('meta=not_approved'))
    const sett = (await (await fetch(`${APP}/settings?tab=instagram`, { headers: { cookie: U.cookie } })).text())
    ok('no Instagram section in Settings', !sett.includes('Creator Marketplace'))
    ok('nothing about Instagram on /ai', !(await (await fetch(`${APP}/ai?intro=1`, { headers: { cookie: U.cookie } })).text()).includes('Creator Marketplace'))

    console.log('\n== an approved brand and invites')
    const as = await search(A.brandId, F({}))
    const c2 = await call(A, '/api/invites', { searchId: as, igUsername: 'abuse_test_creator' })
    ok('approved: invite created', c2.status === 200 && /\/c\/i-[a-z0-9]{26}$/.test(c2.j.invite?.link ?? ''), `${c2.status}`)
    if (c2.j.invite?.id) made.invites.push(c2.j.invite.id)
    const { data: row } = await admin.from('brand_creator_invites').select('summary, timeline').eq('id', c2.j.invite.id).single()
    ok('invite summary is Guapd\'s own text, no timeline, no typed text', row?.summary === 'Looking for Home, Interior Design & DIY creators to make reels for a campaign on Guapd.' && row.timeline === null, row?.summary)
    const page = await (await fetch(`${APP}/c/${c2.j.invite.link.split('/c/')[1]}`)).text()
    ok('invite page shows none of the brief\'s free text', !/March|9876543210|DM /.test(page))
    ok('approved: mark sent works', (await call(A, '/api/invites/sent', { inviteId: c2.j.invite.id, via: 'copy' })).status === 200)
    ok('forged: an unapproved brand cannot mark another brand\'s invite sent', (await call(U, '/api/invites/sent', { inviteId: c2.j.invite.id, via: 'whatsapp' })).status === 403)

    console.log('\n== an unapproved brand sees no more than /browse')
    const hard = { cities: ['shillong'], languages: ['Tamil'] as BriefFilters['hard']['languages'], minEngagementPct: 99 }
    const ur = await call(U, '/api/creators/search', { searchId: us, filters: F(hard) })
    const ar = await call(A, '/api/creators/search', { searchId: as, filters: F(hard) })
    const plain = await call(U, '/api/creators/search', { searchId: us, filters: F({}) })
    ok('approved brand: city/language/engagement filters apply (nobody in Shillong, Tamil, 99%)', ar.status === 200 && ar.j.results.length === 0, `${ar.j.results?.length}`)
    ok('unapproved brand: those filters are not applied, so they reveal nothing', ur.status === 200 && JSON.stringify(ur.j.results.map((r: any) => r.id).sort()) === JSON.stringify(plain.j.results.map((r: any) => r.id).sort()), `${ur.j.results?.length} vs ${plain.j.results?.length}`)
    ok('unapproved brand is told why', (ur.j.notChecked ?? []).some((n: string) => /apply once Guapd approves your brand/.test(n)) && ur.j.restricted === true)
    ok('cards carry only /browse fields', (ur.j.results ?? []).every((r: any) => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(CARD_KEYS)))
    ok('no reason mentions what /browse does not show', !(ur.j.results ?? []).some((r: any) => /engagement|completed|on time|replied|makes content in|\bin [A-Z]/.test(r.reason)))

    console.log('\n== Load more')
    const { data: vis } = await admin.from('creators').select('id').eq('is_bookable', true).eq('is_guapd', false).is('search_hidden_at', null)
    // The stored order with the first 5 "shown": Load more must continue from 6.
    const order = (vis ?? []).map((c) => c.id)
    // Filters that everyone matches, so every stored id is still valid.
    const ls = await search(A.brandId, F({}), { ranked_ids: order, shown_count: 5, result_ids: order.slice(0, 5) }, true)
    const m1 = await call(A, '/api/creators/search', { searchId: ls, more: true })
    const got = (m1.j.results ?? []).map((r: any) => r.id)
    const expected = order.slice(5, 5 + PAGE_SIZE)
    ok('Load more returns exactly the next ids of the stored order', m1.status === 200 && JSON.stringify(got) === JSON.stringify(expected), `${got.length} of ${expected.length}`)
    ok('no repeats with what was already shown', got.every((id: string) => !order.slice(0, 5).includes(id)) && new Set(got).size === got.length)
    ok('a page is at most PAGE_SIZE', got.length <= PAGE_SIZE && got.length > 0)
    ok('hasMore is right', m1.j.hasMore === (order.length > 5 + PAGE_SIZE))
    let last = m1
    while (last.j.hasMore) last = await call(A, '/api/creators/search', { searchId: ls, more: true })
    const end = await call(A, '/api/creators/search', { searchId: ls, more: true })
    ok('it ends cleanly: then nothing more, hasMore false', end.status === 200 && end.j.results.length === 0 && end.j.hasMore === false)
    const { data: after } = await admin.from('brand_creator_searches').select('result_ids, shown_count').eq('id', ls).single()
    ok('shown ids recorded once each, and all of them', new Set(after!.result_ids).size === (after!.result_ids as string[]).length && (after!.result_ids as string[]).length === order.length && after!.shown_count === order.length)
    const hiddenOne = order[order.length - 1]
    const ls2 = await search(A.brandId, F({}), { ranked_ids: order, shown_count: order.length - 1, result_ids: order.slice(0, -1) }, true)
    await admin.from('creators').update({ search_hidden_at: new Date().toISOString() }).eq('id', hiddenOne)
    try {
      const mh = await call(A, '/api/creators/search', { searchId: ls2, more: true })
      ok('a creator who hid since is skipped, not replaced by a weaker match', mh.status === 200 && mh.j.results.length === 0 && mh.j.hasMore === false)
    } finally { await admin.from('creators').update({ search_hidden_at: null }).eq('id', hiddenOne) }

    console.log('\n== alerting (log only)')
    const devLog = process.env.GUAPD_DEV_LOG
    if (devLog) {
      for (let i = 0; i < 10; i++) {
        const r = await call(A, '/api/invites', { searchId: as, igUsername: `burst_test_${i}` })
        if (r.j.invite?.id) made.invites.push(r.j.invite.id)
      }
      await new Promise((r) => setTimeout(r, 800))
      const log = fs.readFileSync(devLog, 'utf8')
      const line = log.split('\n').reverse().find((l) => l.includes('[abuse-alert] invites many created') && l.includes(A.brandId)) ?? ''
      ok('many invites quickly: an alert with brand id and counts', /invites_10m=\d+ invites_24h=\d+/.test(line), line.slice(0, 120))
      ok('no brief text in any log line', !/abuse test|9876543210|12 March/.test(log))
    } else {
      console.log('  ⏭  set GUAPD_DEV_LOG to the dev server log to check alerts')
    }

    console.log('\n== forged requests')
    ok('Load more on another brand\'s search: 404', (await call(U, '/api/creators/search', { searchId: as, more: true })).status === 404)
    ok('chip edit on another brand\'s search: 404', (await call(U, '/api/creators/search', { searchId: as, filters: F({}) })).status === 404)
    ok('more must be true', (await call(A, '/api/creators/search', { searchId: as, more: false })).status === 400)
    ok('extra keys refused', (await call(A, '/api/creators/search', { searchId: as, more: true, offset: 0 })).status === 400)
    ok('invite with a forged username refused', (await call(A, '/api/invites', { searchId: as, igUsername: 'bad name<script>' })).status === 400)
    ok('invite on another brand\'s search: 404', (await call(A, '/api/invites', { searchId: us, igUsername: 'abuse_test_creator' })).status === 404)
  } finally {
    if (made.invites.length) await admin.from('brand_creator_invites').delete().in('id', made.invites)
    if (made.searches.length) await admin.from('brand_creator_searches').delete().in('id', made.searches)
    const { count } = await admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).or('ig_username.eq.abuse_test_creator,ig_username.like.burst_test_%')
    ok('teardown: test searches and invites removed', (count ?? 0) === 0)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
