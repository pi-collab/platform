/**
 * RLS ADVERSARIAL TEST PAGE — /test-rls
 *
 * DELETE THIS ROUTE before going to production.
 * Runs every test from the adversarial test plan against the live DB
 * using the current user's session (anon key + JWT).
 *
 * How to use:
 *  1. Log in at /login
 *  2. Visit /test-rls — results render server-side
 *  3. Log out, log in as Account B, visit /test-rls again for cross-brand tests
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Result = {
  test:     string
  expected: string
  got:      string
  pass:     boolean
  detail?:  string
}

export default async function TestRLSPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const results: Result[] = []

  const check = (test: string, expected: string, condition: boolean, detail?: string): Result => ({
    test, expected, got: condition ? 'PASS' : 'FAIL', pass: condition, detail,
  })

  // ── 1. Own users row readable ──────────────────────────────────
  const { data: ownUser, error: e1 } = await supabase
    .from('users').select('id, email, role').eq('auth_id', user.id).maybeSingle()
  results.push(check(
    '1. Read own users row',
    '1 row returned',
    ownUser !== null && !e1,
    e1?.message ?? JSON.stringify(ownUser),
  ))

  // ── 2. users table returns ONLY own row ───────────────────────
  const { data: allUsers } = await supabase.from('users').select('id')
  results.push(check(
    '2. users table — only own row visible (no other users)',
    '1 row max',
    (allUsers?.length ?? 0) <= 1,
    `rows returned: ${allUsers?.length ?? 0}`,
  ))

  // ── 3. Own brand visible (if onboarded) ───────────────────────
  const { data: brands } = await supabase.from('brands').select('id, name')
  results.push(check(
    '3. brands table — 0 or 1 row (own brand only)',
    '0 or 1 row',
    (brands?.length ?? 0) <= 1,
    `rows: ${JSON.stringify(brands)}`,
  ))

  // ── 4. brand_members — only own brand's rows ──────────────────
  const { data: bm } = await supabase.from('brand_members').select('id, brand_id')
  const brandIds = Array.from(new Set(bm?.map(r => r.brand_id) ?? []))
  results.push(check(
    '4. brand_members — only rows for own brand',
    '0 or 1 distinct brand_id',
    brandIds.length <= 1,
    `distinct brand_ids: ${JSON.stringify(brandIds)}`,
  ))

  // ── 5. deals — only own brand's deals ─────────────────────────
  const { data: deals } = await supabase.from('deals').select('id, brand_id')
  const dealBrandIds = Array.from(new Set(deals?.map(r => r.brand_id) ?? []))
  const myBrandId = brands?.[0]?.id ?? null
  const allDealsOwnBrand = dealBrandIds.every(id => id === myBrandId)
  results.push(check(
    '5. deals — only own brand\'s deals visible',
    'all rows have own brand_id',
    deals?.length === 0 || allDealsOwnBrand,
    `deal brand_ids: ${JSON.stringify(dealBrandIds)}, my brand: ${myBrandId}`,
  ))

  // ── 6. messages — only on accessible deals ────────────────────
  const dealIds = new Set(deals?.map(r => r.id) ?? [])
  const { data: msgs } = await supabase.from('messages').select('id, deal_id')
  const allMsgsOwnDeal = (msgs ?? []).every(m => dealIds.has(m.deal_id))
  results.push(check(
    '6. messages — only on own deals',
    'all message deal_ids in own deals',
    allMsgsOwnDeal,
    `message deal_ids outside own deals: ${(msgs ?? []).filter(m => !dealIds.has(m.deal_id)).length}`,
  ))

  // ── 7. deliverables — only on accessible deals ────────────────
  const { data: delivs } = await supabase.from('deliverables').select('id, deal_id')
  const allDelivsOwnDeal = (delivs ?? []).every(d => dealIds.has(d.deal_id))
  results.push(check(
    '7. deliverables — only on own deals',
    'all deliverable deal_ids in own deals',
    allDelivsOwnDeal,
    `outside own deals: ${(delivs ?? []).filter(d => !dealIds.has(d.deal_id)).length}`,
  ))

  // ── 8. payments — only on accessible deals ────────────────────
  const { data: pmts } = await supabase.from('payments').select('id, deal_id')
  const allPmtsOwnDeal = (pmts ?? []).every(p => dealIds.has(p.deal_id))
  results.push(check(
    '8. payments — only on own deals',
    'all payment deal_ids in own deals',
    allPmtsOwnDeal,
    `outside own deals: ${(pmts ?? []).filter(p => !dealIds.has(p.deal_id)).length}`,
  ))

  // ── 9. events — only on accessible deals ──────────────────────
  const { data: evts } = await supabase.from('events').select('id, deal_id')
  const allEvtsOwnDeal = (evts ?? []).every(e => dealIds.has(e.deal_id ?? ''))
  results.push(check(
    '9. events — only on own deals',
    'all event deal_ids in own deals',
    allEvtsOwnDeal,
    `outside own deals: ${(evts ?? []).filter(e => !dealIds.has(e.deal_id ?? '')).length}`,
  ))

  // ── 10. Direct INSERT into events must fail ────────────────────
  const { error: evtInsertErr } = await supabase.from('events').insert({
    deal_id:    '00000000-0000-0000-0000-000000000000',
    event_type: 'rls.test',
    detail:     {},
  })
  results.push(check(
    '10. Direct INSERT into events — must be rejected',
    'RLS error / permission denied',
    evtInsertErr !== null,
    evtInsertErr?.message ?? 'NO ERROR — FAIL: direct insert succeeded',
  ))

  // ── 11. creators — only vetted ones visible ───────────────────
  const { data: creatorsData } = await supabase
    .from('creators').select('id, is_vetted, user_id')
  const anyUnvetted = (creatorsData ?? []).some(
    c => !c.is_vetted && c.user_id !== ownUser?.id
  )
  results.push(check(
    '11. creators — no unvetted rows visible (unless own profile)',
    'no unvetted creators returned',
    !anyUnvetted,
    `unvetted rows (excluding own): ${(creatorsData ?? []).filter(c => !c.is_vetted && c.user_id !== ownUser?.id).length}`,
  ))

  const pass = results.filter(r => r.pass).length
  const fail = results.filter(r => !r.pass).length

  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto', fontFamily: 'monospace' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        RLS Adversarial Tests
      </h1>
      <p style={{ fontSize: '0.8125rem', color: '#9B8E82', marginBottom: '1.5rem' }}>
        Logged in as: {user.email} — {pass} pass / {fail} fail
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {results.map((r) => (
          <div
            key={r.test}
            style={{
              padding:      '0.75rem 1rem',
              borderRadius: 8,
              background:   r.pass ? '#F0FDF4' : '#FEF2F2',
              border:       `1px solid ${r.pass ? '#BBF7D0' : '#FECACA'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: r.pass ? '#166534' : '#991B1B' }}>
                {r.pass ? '✓' : '✗'} {r.test}
              </span>
              <span style={{ fontSize: '0.75rem', color: r.pass ? '#15803D' : '#DC2626', fontWeight: 700 }}>
                {r.got}
              </span>
            </div>
            {r.detail && (
              <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{r.detail}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#F6F0E5', borderRadius: 8, fontSize: '0.8125rem' }}>
        <strong>Cross-brand test (Test 12):</strong> Log out, sign in with a second Google account,
        visit this page again. All deal/message/payment counts should be 0 or only show that account's data.
        Any row from Account A appearing here is an isolation failure.
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9B8E82' }}>
        DELETE /app/test-rls before production.
      </p>
    </main>
  )
}
