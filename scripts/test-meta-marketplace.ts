/**
 * Instagram Creator Marketplace (0587, lib/meta/*), without real Meta access.
 *
 *   1. Pure: Meta parameters built from Guapd filters, validated against
 *      Meta's documented values; budget, dates and competitor names never
 *      reach `query` in either mode.
 *   2. Live, against a local dev server whose Graph and Login dialog point at
 *      a stub this script runs on :4599 (META_GRAPH_BASE / META_DIALOG_BASE,
 *      honoured outside production only), with STAGING data:
 *      Facebook Login → encrypted connection; search → matched to Guapd, email
 *      dropped, cached; invite → link, page, open/sent/accept tracking;
 *      deauthorize → connection deleted. Everything made here is removed.
 *
 * Start the dev server with: CREATOR_SEARCH=1 META_CREATOR_MARKETPLACE=1
 *   META_APP_ID=test-app META_APP_SECRET=test-secret-local
 *   META_GRAPH_BASE=http://localhost:4599/graph META_DIALOG_BASE=http://localhost:4599/dialog
 *   INSTAGRAM_TOKEN_KEY=<any 32-byte base64 test key>
 * Then: NODE_PATH=apps/web/node_modules:node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-meta-marketplace.ts
 */
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { createHmac } from 'crypto'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { EMPTY_BRIEF_FILTERS, type BriefFilters } from '../apps/web/lib/ai/creator-search-types'
import { DEFAULT_META_OPTIONS, MetaOptionsSchema, MetaParamsSchema, buildMetaParams, directQuery, extractedQuery } from '../apps/web/lib/meta/marketplace-params'
import { whatsappUrl } from '../apps/web/lib/meta/invite-links'

let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }
const APP = 'http://localhost:3000'
const SECRET = 'test-secret-local'

const E = EMPTY_BRIEF_FILTERS
const FILTERS: BriefFilters = {
  ...E,
  hard: { ...E.hard, cities: ['mumbai'], languages: ['Hindi', 'English'], followersMin: 15000, followersMax: 90000, budgetMaxRupees: 50000 },
  mustHave: { niches: ['Home, Interior Design & DIY'], keywords: ['home fragrance'] },
  niceToHave: { niches: [], keywords: ['candles'] },
  exclude: { niches: [], keywords: ['brandx'] },
  context: { productCategory: 'diffusers', deliverables: ['reels'], tone: ['minimal'], timeline: 'launch in March' },
  summary: 'Home styling creators in Mumbai for a home fragrance launch.',
}
const BRIEF = 'We are launching home fragrance diffusers. Looking for home styling creators in Mumbai who make calm minimal reels. Budget is ₹50k per creator. Launch on 12 March. Do not pick anyone who has worked with BrandX. Hindi or English content.'

async function main() {
  console.log('== 1. parameters')
  const p = buildMetaParams(FILTERS, BRIEF, 'extracted', DEFAULT_META_OPTIONS)!
  ok('builds and passes the strict schema', !!p && MetaParamsSchema.safeParse(p).success)
  ok('country is India', JSON.stringify(p.creator_countries) === '["IN"]')
  ok('Mumbai → state IN-MH (one country)', JSON.stringify(p.creator_states) === '["IN-MH"]')
  ok('followers snapped to Meta buckets (15k → 10k, 90k → 100k)', p.creator_min_followers === 10000 && p.creator_max_followers === 100000)
  ok('niche → interests', JSON.stringify(p.creator_interests) === '["HOME_AND_GARDEN"]')
  ok('languages → ISO 639-1', JSON.stringify(p.creator_language) === '["hi","en"]')
  ok('extracted query: keywords only', p.query === 'home fragrance diffusers candles minimal', p.query)
  const d = directQuery(BRIEF, FILTERS)!
  ok('direct query: trimmed to 200', d.length <= 200, `${d.length}`)
  ok('direct query: no budget, no money', !/50|₹|budget|rupee/i.test(d), d)
  ok('direct query: no dates or timing', !/march|\b12\b|launch on/i.test(d), d)
  ok('direct query: the competitor sentence is dropped whole', !/worked with/i.test(d), d)
  ok('direct query: no competitor name', !/brandx/i.test(d), d)
  ok('extracted query: no competitor name', !/brandx/i.test(extractedQuery(FILTERS) ?? ''))
  ok('a city with no known state sends no states (never narrows to part)', buildMetaParams({ ...FILTERS, hard: { ...FILTERS.hard, cities: ['mumbai', 'shillong'] } }, BRIEF, 'extracted', DEFAULT_META_OPTIONS)?.creator_states === undefined)
  ok('a country outside India: no call', buildMetaParams({ ...FILTERS, hard: { ...FILTERS.hard, country: 'usa' } }, BRIEF, 'extracted', DEFAULT_META_OPTIONS) === null)
  ok('options: an engaged-accounts value off Meta\'s list is rejected', !MetaOptionsSchema.safeParse({ ...DEFAULT_META_OPTIONS, minEngagedAccounts: 5000 }).success)
  ok('options: an unknown option key is rejected', !MetaOptionsSchema.safeParse({ ...DEFAULT_META_OPTIONS, email: true }).success)
  ok('options: post activity enum enforced', !MetaOptionsSchema.safeParse({ ...DEFAULT_META_OPTIONS, latestPostActivity: 'last_year' }).success)
  ok('schema: more than 5 interests rejected', !MetaParamsSchema.safeParse({ creator_countries: ['IN'], creator_interests: ['BEAUTY', 'FASHION', 'SPORTS', 'TV_AND_MOVIES', 'MUSIC_AND_AUDIO', 'FOOD_AND_DRINK'] }).success)
  ok('schema: states without exactly one country rejected', !MetaParamsSchema.safeParse({ creator_states: ['IN-MH'] }).success)
  ok('schema: followers off Meta\'s list rejected', !MetaParamsSchema.safeParse({ creator_min_followers: 12345 }).success)
  ok('options map through (verified, recent posts)', buildMetaParams(FILTERS, BRIEF, 'extracted', { ...DEFAULT_META_OPTIONS, verifiedAccount: true, latestPostActivity: 'last_30_days' })?.verified_account === true)
  ok('wa.me: 10-digit Indian number gets 91', whatsappUrl('98765 43210', 'hi')?.startsWith('https://wa.me/919876543210?text=hi') === true)
  ok('wa.me: junk number refused', whatsappUrl('123', 'hi') === null)

  console.log('\n== 2. live, against the Graph stub')
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  // A bookable Guapd creator with a handle: the stub returns them, so they must match.
  const { data: guapdCreator } = await admin.from('creators').select('id, handle').eq('is_bookable', true).eq('is_guapd', false).not('handle', 'is', null).limit(1).single()
  const matchUser = String(guapdCreator!.handle).replace(/^@+/, '').toLowerCase()
  const NOT_ON = 'notonguapd_creator'

  const stub = { scope: '', marketplaceHits: 0, lastQuery: null as URLSearchParams | null, tokens: [] as string[] }
  const server = http.createServer((req, res) => {
    const u = new globalThis.URL(req.url!, 'http://localhost:4599')
    const send = (j: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)) }
    if (u.pathname === '/dialog') {
      stub.scope = u.searchParams.get('scope') ?? ''
      res.writeHead(302, { location: `${u.searchParams.get('redirect_uri')}?code=stub-code&state=${u.searchParams.get('state')}` }); return res.end()
    }
    const tok = u.searchParams.get('access_token'); if (tok) stub.tokens.push(tok)
    if (u.pathname === '/graph/oauth/access_token') return send(u.searchParams.get('code') ? { access_token: 'short-user-token' } : { access_token: 'long-user-token', expires_in: 5184000 })
    if (u.pathname === '/graph/me') return send({ id: 'fb-user-test-1' })
    if (u.pathname === '/graph/me/permissions') return send({ data: ['instagram_basic', 'pages_show_list', 'pages_manage_metadata', 'business_management', 'instagram_creator_marketplace_discovery'].map((permission) => ({ permission, status: 'granted' })) })
    if (u.pathname === '/graph/me/accounts') return send({ data: [{ id: 'page-1', name: 'Test Brand Page', access_token: 'page-token-secret', instagram_business_account: { id: 'ig-biz-1', username: 'testbrand' } }] })
    if (u.pathname === '/graph/ig-biz-1/creator_marketplace_creators') {
      stub.marketplaceHits++; stub.lastQuery = u.searchParams
      if (u.searchParams.get('access_token') !== 'page-token-secret') { res.writeHead(400); return res.end('{"error":{"message":"bad token","code":190}}') }
      return send({ data: [
        { id: '1', username: matchUser, biography: 'Home and decor', country: 'IN', category: 'Home', email: 'onguapd@example.com', profile_picture_url: 'https://example.com/a.jpg', onboarded_status: 'ONBOARDED', insights: { data: [{ name: 'total_followers', values: [{ value: 12000 }] }] } },
        { id: '2', username: NOT_ON, biography: 'Candles and calm homes', country: 'IN', category: 'Creator', email: 'creator@example.com', profile_picture_url: 'https://example.com/b.jpg', onboarded_status: 'NOT_ONBOARDED' },
        { id: '3', username: 'BAD NAME!!', biography: 'x' },
      ] })
    }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>((r) => server.listen(4599, r))

  // Brand session.
  const { data: bms } = await admin.from('brand_members').select('brand_id, users(auth_id), brands!inner(is_guapd, brand_status, name)').eq('brands.is_guapd', false).neq('brands.brand_status', 'rejected').limit(5)
  const bm = (bms ?? [])[0] as any
  const brandId = bm.brand_id as string
  const email = (await admin.auth.admin.getUserById(bm.users.auth_id)).data.user!.email!
  const signIn = async (mail: string) => {
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: mail })
    const jar: { name: string; value: string }[] = []
    const sb = createServerClient(URL, ANON, { cookies: { getAll: () => jar, setAll: (cs) => cs.forEach(({ name, value }) => { const i = jar.findIndex((j) => j.name === name); i >= 0 ? (jar[i].value = value) : jar.push({ name, value }) }) } })
    await sb.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: 'magiclink' })
    return jar.map((c) => `${c.name}=${c.value}`).join('; ')
  }
  const brandCookie = await signIn(email)
  const post = (pathName: string, body: unknown, cookie = brandCookie) => fetch(`${APP}${pathName}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })

  const made = { searchId: '', invites: [] as string[], igRowFor: null as string | null, startedAt: new Date().toISOString() }
  const { data: existingConn } = await admin.from('brand_meta_connections').select('id').eq('brand_id', brandId).maybeSingle()
  if (existingConn) throw new Error('this brand already has a Meta connection; not touching it')
  try {
    const { data: search } = await admin.from('brand_creator_searches').insert({ brand_id: brandId, brief: BRIEF, filters: FILTERS }).select('id').single()
    made.searchId = search!.id

    // Not connected yet.
    const nc = await post('/api/meta/creator-search', { searchId: made.searchId })
    ok('search before connecting: 409 not connected', nc.status === 409)

    // Facebook Login through the stub.
    const c1 = await fetch(`${APP}/api/meta/connect?s=${made.searchId}`, { headers: { cookie: brandCookie }, redirect: 'manual' })
    const setCookies = c1.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    ok('connect redirects to the Login dialog', c1.status === 307 && (c1.headers.get('location') ?? '').startsWith('http://localhost:4599/dialog'))
    const d1 = await fetch(c1.headers.get('location')!, { redirect: 'manual' })
    ok('dialog asked for the discovery scope (flag on)', stub.scope.includes('instagram_creator_marketplace_discovery') && stub.scope.includes('pages_show_list'), stub.scope)
    const forged = await fetch(d1.headers.get('location')!.replace(/state=[^&]+/, 'state=forged'), { headers: { cookie: `${brandCookie}; ${setCookies}` }, redirect: 'manual' })
    ok('a forged state is refused', (forged.headers.get('location') ?? '').includes('meta=state_mismatch'))
    const c2 = await fetch(`${APP}/api/meta/connect?s=${made.searchId}`, { headers: { cookie: brandCookie }, redirect: 'manual' })
    const sc2 = c2.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const d2 = await fetch(c2.headers.get('location')!, { redirect: 'manual' })
    const cb = await fetch(d2.headers.get('location')!, { headers: { cookie: `${brandCookie}; ${sc2}` }, redirect: 'manual' })
    ok('callback lands back on the search, connected', (cb.headers.get('location') ?? '').includes(`/ai?s=${made.searchId}&meta=connected`), cb.headers.get('location') ?? '')
    const { data: row } = await admin.from('brand_meta_connections').select('*').eq('brand_id', brandId).single()
    ok('connection saved for the brand, with the Instagram business account', row?.ig_user_id === 'ig-biz-1' && row.page_id === 'page-1')
    ok('tokens are encrypted at rest', !!row && !JSON.stringify(row).includes('page-token-secret') && !JSON.stringify(row).includes('long-user-token'))

    // Search.
    const s1 = await post('/api/meta/creator-search', { searchId: made.searchId })
    const j1 = await s1.json()
    ok('search: 200', s1.status === 200, JSON.stringify(j1).slice(0, 120))
    const q = stub.lastQuery!
    ok('Meta got the page token, not the user token', q.get('access_token') === 'page-token-secret')
    ok('Meta got exactly the requested fields', q.get('fields') === 'id,username,biography,country,insights,category,email,profile_picture_url,onboarded_status')
    ok('Meta got validated values only', q.get('creator_countries') === '["IN"]' && q.get('creator_min_followers') === '10000' && q.get('creator_interests') === '["HOME_AND_GARDEN"]')
    const sentText = Array.from(q.entries()).filter(([k]) => k !== 'access_token').map(([, v]) => v).join(' ')
    ok('Meta never got the brief, budget, dates or the competitor', !/50k|50000|₹|budget|march|brandx|launching/i.test(sentText), q.get('query') ?? '')
    const text = JSON.stringify(j1)
    ok('no email address in the response', !/@example\.com/.test(text))
    const on = j1.creators.find((c: any) => c.username === matchUser), off = j1.creators.find((c: any) => c.username === NOT_ON)
    ok('a Guapd creator is matched: On Guapd', on?.guapd?.creatorId === guapdCreator!.id)
    ok('a creator not on Guapd is not matched', off && off.guapd === null)
    ok('has a public email is a flag, not the address', off?.hasPublicEmail === true)
    ok('followers read from insights', on?.followers === 12000)
    ok('a malformed username is dropped', !j1.creators.some((c: any) => /BAD/.test(c.username)))
    const hits = stub.marketplaceHits
    await post('/api/meta/creator-search', { searchId: made.searchId })
    ok('the same search again is served from the short cache', stub.marketplaceHits === hits)
    const { data: runs } = await admin.from('brand_creator_searches').select('meta_runs').eq('id', made.searchId).single()
    ok('only real Meta calls are counted', runs?.meta_runs === 1)
    const bad = await post('/api/meta/creator-search', { searchId: made.searchId, options: { ...DEFAULT_META_OPTIONS, minEngagedAccounts: 7 } })
    ok('options off Meta\'s list: 400', bad.status === 400)

    // Invite.
    const i1 = await post('/api/invites', { searchId: made.searchId, igUsername: NOT_ON })
    const ij = await i1.json()
    ok('invite: tracked link /c/i-<token>', i1.status === 200 && /\/c\/i-[a-z0-9]{26}$/.test(ij.invite?.link ?? ''), ij.invite?.link)
    const token = (ij.invite.link as string).split('/c/')[1]
    made.invites.push(ij.invite.id)
    ok('invite: message carries the link, no money', ij.message.includes(ij.invite.link) && !/₹|50k/.test(ij.message))
    ok('invite: Instagram profile and message links', ij.instagram.message === `https://ig.me/m/${NOT_ON}` && ij.instagram.profile.includes(NOT_ON))
    ok('invite: email sending not offered yet', ij.emailAvailable === false)
    const i2 = await (await post('/api/invites', { searchId: made.searchId, igUsername: `@${NOT_ON.toUpperCase()}` })).json()
    ok('invite: one per creator per search', i2.invite.id === ij.invite.id)

    const page = await fetch(`${APP}/c/${token}`)
    const html = await page.text()
    ok('invite page renders at /c/<token>', page.status === 200 && html.includes(FILTERS.summary) && html.includes(`@${NOT_ON}`))
    ok('invite page shows no budget, competitor or email', !/50k|brandx|@example\.com/i.test(html))
    const open = await fetch(`${APP}/api/invites/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    ok('open is recorded and remembered in a cookie', open.status === 200 && (open.headers.get('set-cookie') ?? '').includes('guapd_invite='))
    await post('/api/invites/sent', { inviteId: ij.invite.id, via: 'copy' })
    const { data: inv1 } = await admin.from('brand_creator_invites').select('*').eq('id', ij.invite.id).single()
    ok('tracking: opened and sent', !!inv1?.opened_at && !!inv1.sent_at && inv1.sent_via === 'copy')
    ok('the invite row holds the username only (no email, bio or insights)', !JSON.stringify(inv1).includes('example.com') && !('biography' in (inv1 ?? {})))

    // Accept as a creator: wrong Instagram first, then the invited one.
    const { data: cands } = await admin.from('creators').select('id, users(auth_id)').eq('is_guapd', false).not('user_id', 'is', null)
    let creatorId = '', creatorMail = ''
    for (const c of cands ?? []) {
      const { data: has } = await admin.from('creator_instagram_connections').select('id').eq('creator_id', c.id).maybeSingle()
      const m = (await admin.auth.admin.getUserById((c as any).users.auth_id)).data.user?.email
      if (!has && m) { creatorId = c.id; creatorMail = m; break }
    }
    const creatorCookie = await signIn(creatorMail)
    const ig = (username: string) => ({ creator_id: creatorId, ig_user_id: 'test-ig', ig_app_scoped_id: 'test-ig-app', username, account_type: 'MEDIA_CREATOR', status: 'connected', token_ciphertext: 'x', token_iv: 'x', token_tag: 'x', token_expires_at: new Date(Date.now() + 86400e3).toISOString(), last_synced_at: new Date().toISOString() })
    await admin.from('creator_instagram_connections').insert(ig('someone_else'))
    made.igRowFor = creatorId
    const mm = await post('/api/invites/accept', { token }, creatorCookie)
    ok('accept with a different Instagram: refused', mm.status === 403)
    await admin.from('creator_instagram_connections').update({ username: NOT_ON }).eq('creator_id', creatorId)
    const asCreator = await (await fetch(`${APP}/c/${token}`, { headers: { cookie: creatorCookie } })).text()
    ok('invite page offers Accept to the invited creator', asCreator.includes('Accept invite'))
    const acc = await post('/api/invites/accept', { token }, creatorCookie)
    ok('accept: 200', acc.status === 200)
    const { data: inv2 } = await admin.from('brand_creator_invites').select('signed_up_at, accepted_at, creator_id').eq('id', ij.invite.id).single()
    ok('tracking: signed up and accepted, linked to the creator', !!inv2?.signed_up_at && !!inv2.accepted_at && inv2.creator_id === creatorId)
    const { count: notes } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('type', 'creator_invite_accepted').gte('created_at', made.startedAt)
    ok('the brand is told in-app', (notes ?? 0) > 0)

    // Deauthorize: a bad signature is ignored, a good one deletes the connection.
    const b64 = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const payload = b64(Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fb-user-test-1', issued_at: Math.floor(Date.now() / 1000) })))
    const form = (sig: string) => new URLSearchParams({ signed_request: `${sig}.${payload}` })
    await fetch(`${APP}/api/meta/deauthorize`, { method: 'POST', body: form(b64(createHmac('sha256', 'wrong').update(payload).digest())) })
    ok('deauthorize with a bad signature changes nothing', !!(await admin.from('brand_meta_connections').select('id').eq('brand_id', brandId).maybeSingle()).data)
    await fetch(`${APP}/api/meta/deauthorize`, { method: 'POST', body: form(b64(createHmac('sha256', SECRET).update(payload).digest())) })
    ok('deauthorize deletes the connection and its tokens', !(await admin.from('brand_meta_connections').select('id').eq('brand_id', brandId).maybeSingle()).data)
  } finally {
    server.close()
    if (made.invites.length) await admin.from('brand_creator_invites').delete().in('id', made.invites)
    if (made.igRowFor) await admin.from('creator_instagram_connections').delete().eq('creator_id', made.igRowFor).eq('ig_user_id', 'test-ig')
    await admin.from('notifications').delete().eq('type', 'creator_invite_accepted').gte('created_at', made.startedAt)
    await admin.from('brand_meta_connections').delete().eq('brand_id', brandId).eq('fb_user_id', 'fb-user-test-1')
    if (made.searchId) await admin.from('brand_creator_searches').delete().eq('id', made.searchId)
    const left = await Promise.all([
      admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
      admin.from('brand_meta_connections').select('id', { count: 'exact', head: true }).eq('fb_user_id', 'fb-user-test-1'),
      admin.from('creator_instagram_connections').select('id', { count: 'exact', head: true }).eq('ig_user_id', 'test-ig'),
    ])
    ok('teardown: no invites, connections or test Instagram rows left', left.every((r) => (r.count ?? 0) === 0))
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
