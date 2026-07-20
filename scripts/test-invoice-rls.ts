/**
 * Invoice RLS behavioral verification script.
 *
 * Tests that migration 019 correctly enforces:
 *   - Brand CANNOT insert an invoice (RLS rejects)
 *   - Creator CAN insert an invoice
 *   - Creator CAN update draft → issued
 *   - Brand CAN update issued → accepted
 *
 * Run: npx tsx scripts/test-invoice-rls.ts
 * Requires: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in env or .env.local
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Load env ──────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '../apps/web/.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Test state ────────────────────────────────────────────────────
let testInvoiceId: string | null = null
let testDealId: string | null = null

// ── Helpers ───────────────────────────────────────────────────────
function pass(label: string) { console.log(`  ✅ PASS: ${label}`) }
function fail(label: string, detail?: string) {
  console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`)
  process.exitCode = 1
}

async function getSessionFor(authId: string): Promise<string> {
  // Use admin API to generate an access token for a real user
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}/factors`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  })

  // We need a different approach — sign in as the user using admin impersonation.
  // Supabase GoTrue admin can generate a session via the token endpoint.
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'magiclink', email: '' }) // placeholder
  })

  // Actually, the cleanest way: create a Supabase client with service role,
  // use admin.auth.admin.generateLink to get a magic link, extract the token.
  // But that still requires visiting the link.
  //
  // Alternative: use the undocumented POST /auth/v1/token?grant_type=id_token
  // with a custom token. But the simplest for testing: use supabase-js
  // admin.auth.admin.getUserById then create a custom JWT.
  //
  // SIMPLEST: just use the RPC approach — call PostgREST directly with a
  // custom JWT signed with the JWT secret.
  throw new Error('placeholder')
}

async function run() {
  console.log('\n🔒 Invoice RLS Behavioral Verification\n')
  console.log('─'.repeat(50))

  // ── 1. Find test data ──────────────────────────────────────────
  // Find a deal WITHOUT an invoice, get its brand user auth_id and creator user auth_id
  const { data: deals } = await admin
    .from('deals')
    .select('id, brand_id, creator_id, status, price_paise')
    .limit(20)

  if (!deals?.length) { console.error('No deals found'); process.exit(1) }

  // Find existing invoice deal_ids to exclude
  const { data: existingInvoices } = await admin
    .from('invoices')
    .select('deal_id')

  const invoicedDealIds = new Set((existingInvoices ?? []).map(i => i.deal_id))
  const testDeal = deals.find(d => !invoicedDealIds.has(d.id))

  if (!testDeal) { console.error('No deal without an invoice found for testing'); process.exit(1) }

  testDealId = testDeal.id
  console.log(`Test deal: ${testDeal.id} (status: ${testDeal.status}, price: ${testDeal.price_paise})`)

  // Get brand user's auth_id
  const { data: brandMember } = await admin
    .from('brand_members')
    .select('user_id, users(auth_id)')
    .eq('brand_id', testDeal.brand_id)
    .limit(1)
    .single()

  // Get creator's user auth_id
  const { data: creator } = await admin
    .from('creators')
    .select('user_id, users(auth_id)')
    .eq('id', testDeal.creator_id)
    .limit(1)
    .single()

  if (!brandMember || !creator) {
    console.error('Could not find brand member or creator for the test deal')
    process.exit(1)
  }

  const brandAuthId = (brandMember.users as any).auth_id as string
  const creatorAuthId = (creator.users as any).auth_id as string

  console.log(`Brand auth_id:   ${brandAuthId}`)
  console.log(`Creator auth_id: ${creatorAuthId}`)

  // ── 2. Get real sessions via admin impersonation ───────────────
  // Use admin.auth.admin.generateLink to create magic links, then
  // exchange OTP for session. This is the proper way to get real
  // RLS-scoped sessions without knowing passwords.

  // Get brand user email
  const { data: brandAuthUser } = await admin.auth.admin.getUserById(brandAuthId)
  const { data: creatorAuthUser } = await admin.auth.admin.getUserById(creatorAuthId)

  if (!brandAuthUser?.user?.email) {
    console.error('Brand user has no email — cannot generate test session')
    process.exit(1)
  }

  // For creator: they may not have an email (phone-only). We need to handle that.
  const creatorEmail = creatorAuthUser?.user?.email
  const creatorPhone = creatorAuthUser?.user?.phone

  console.log(`Brand email:   ${brandAuthUser.user.email}`)
  console.log(`Creator email: ${creatorEmail ?? '(none)'} phone: ${creatorPhone ?? '(none)'}`)
  console.log('')

  // Generate magic link OTPs and exchange them for sessions
  async function getSession(userId: string): Promise<string> {
    // Use the admin API to directly generate a session
    // Supabase has an undocumented admin endpoint for this
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/sessions`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.access_token) return data.access_token
    }

    // Fallback: generate a magic link and extract the OTP token
    const { data: userData } = await admin.auth.admin.getUserById(userId)
    const email = userData?.user?.email
    if (email) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email
      })
      if (linkData?.properties?.hashed_token) {
        // Exchange the hashed token for a session via verifyOtp
        const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            apikey: ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'magiclink',
            token_hash: linkData.properties.hashed_token
          })
        })
        if (verifyRes.ok) {
          const session = await verifyRes.json()
          if (session.access_token) return session.access_token
        }
      }
    }

    throw new Error(`Could not get session for user ${userId}`)
  }

  const brandToken = await getSession(brandAuthId)
  const creatorToken = await getSession(creatorAuthId)

  console.log(`Brand token:   ${brandToken.slice(0, 20)}...`)
  console.log(`Creator token: ${creatorToken.slice(0, 20)}...`)
  console.log('')

  // Create RLS-scoped clients
  const brandClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${brandToken}` } }
  })
  const creatorClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${creatorToken}` } }
  })

  // ── 3. Verify sessions work ───────────────────────────────────
  const { data: brandUser } = await brandClient.auth.getUser()
  const { data: creatorUser } = await creatorClient.auth.getUser()

  if (brandUser?.user?.id !== brandAuthId) {
    console.error('Brand session verification failed'); process.exit(1)
  }
  if (creatorUser?.user?.id !== creatorAuthId) {
    console.error('Creator session verification failed'); process.exit(1)
  }

  console.log('Sessions verified.\n')

  // ── TEST 1: Brand INSERT → must be REJECTED ───────────────────
  console.log('TEST 1: Brand attempts to INSERT an invoice')
  const { data: brandInsert, error: brandInsertErr } = await brandClient
    .from('invoices')
    .insert({
      deal_id: testDeal.id,
      status: 'draft',
      base_paise: testDeal.price_paise,
      overage_paise: 0,
      fee_paise: 0,
      fee_percent: 0,
      fee_mode: 'on_top',
      brand_pays_paise: testDeal.price_paise,
      creator_receives_paise: testDeal.price_paise
    })
    .select('id')
    .single()

  if (brandInsertErr) {
    pass('Brand INSERT rejected by RLS')
    console.log(`         Error: ${brandInsertErr.message}`)
  } else {
    fail('Brand INSERT succeeded — RLS did NOT block it!', `Created invoice ${brandInsert?.id}`)
    // Clean up the accidentally created invoice
    if (brandInsert?.id) {
      await admin.from('invoices').delete().eq('id', brandInsert.id)
    }
  }

  // ── TEST 2: Creator INSERT → must SUCCEED ─────────────────────
  console.log('\nTEST 2: Creator attempts to INSERT an invoice')
  const { data: creatorInsert, error: creatorInsertErr } = await creatorClient
    .from('invoices')
    .insert({
      deal_id: testDeal.id,
      status: 'draft',
      base_paise: testDeal.price_paise,
      overage_paise: 0,
      fee_paise: 0,
      fee_percent: 0,
      fee_mode: 'on_top',
      brand_pays_paise: testDeal.price_paise,
      creator_receives_paise: testDeal.price_paise
    })
    .select('id')
    .single()

  if (creatorInsertErr) {
    fail('Creator INSERT rejected — should be allowed', creatorInsertErr.message)
  } else {
    pass('Creator INSERT succeeded')
    testInvoiceId = creatorInsert!.id
    console.log(`         Invoice ID: ${testInvoiceId}`)
  }

  if (!testInvoiceId) {
    console.error('\nCannot continue — creator INSERT failed, no invoice to test updates on.')
    process.exit(1)
  }

  // ── TEST 3: Creator UPDATE draft → issued ─────────────────────
  console.log('\nTEST 3: Creator updates invoice draft → issued')
  const { error: creatorUpdateErr } = await creatorClient
    .from('invoices')
    .update({ status: 'issued', issued_at: new Date().toISOString() })
    .eq('id', testInvoiceId)

  if (creatorUpdateErr) {
    fail('Creator UPDATE rejected — should be allowed', creatorUpdateErr.message)
  } else {
    // Verify the status actually changed
    const { data: check } = await admin
      .from('invoices')
      .select('status')
      .eq('id', testInvoiceId)
      .single()
    if (check?.status === 'issued') {
      pass('Creator UPDATE draft → issued succeeded')
    } else {
      fail('Creator UPDATE returned no error but status did not change', `status = ${check?.status}`)
    }
  }

  // ── TEST 4: Brand UPDATE issued → accepted ────────────────────
  console.log('\nTEST 4: Brand updates invoice issued → accepted')
  const { error: brandUpdateErr } = await brandClient
    .from('invoices')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', testInvoiceId)

  if (brandUpdateErr) {
    fail('Brand UPDATE rejected — should be allowed', brandUpdateErr.message)
  } else {
    const { data: check } = await admin
      .from('invoices')
      .select('status')
      .eq('id', testInvoiceId)
      .single()
    if (check?.status === 'accepted') {
      pass('Brand UPDATE issued → accepted succeeded')
    } else {
      fail('Brand UPDATE returned no error but status did not change', `status = ${check?.status}`)
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log('Cleaning up test invoice...')
  if (testInvoiceId) {
    const { error: delErr } = await admin
      .from('invoices')
      .delete()
      .eq('id', testInvoiceId)
    if (delErr) {
      console.log(`  ⚠️  Cleanup failed: ${delErr.message}. Manually delete invoice ${testInvoiceId}`)
    } else {
      console.log('  Cleaned up.')
    }
  }

  // ── Policy summary ──────────────────────────────────────────────
  console.log('\nExpected policies on invoices (verify via SQL editor):')
  console.log('  SELECT tablename, policyname FROM pg_policies')
  console.log("  WHERE tablename = 'invoices' ORDER BY policyname;")
  console.log('')
  console.log('  - invoices_deny_delete (DELETE)')
  console.log('  - invoices_insert_creator (INSERT)')
  console.log('  - invoices_read (SELECT)')
  console.log('  - invoices_update_brand (UPDATE)')
  console.log('  - invoices_update_creator (UPDATE)')

  console.log('\n' + '─'.repeat(50))
  console.log(process.exitCode ? '\n⚠️  SOME TESTS FAILED' : '\n✅ ALL TESTS PASSED')
  console.log('')
}

run().catch(err => {
  console.error('Script error:', err)
  // Cleanup on crash
  if (testInvoiceId) {
    admin.from('invoices').delete().eq('id', testInvoiceId)
      .then(() => console.log('Cleaned up test invoice after crash'))
  }
  process.exit(1)
})
