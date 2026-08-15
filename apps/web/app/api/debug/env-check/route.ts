import { NextRequest, NextResponse } from 'next/server'
import { isEmailConfigured } from '@/lib/email'
import { isWhatsAppConfigured } from '@/lib/whatsapp'

/**
 * TEMPORARY diagnostic — reports which env vars a running deployment can
 * actually see. DELETE once the notification channels are confirmed working.
 *
 * Exists because three staging deploys in a row failed to send email while
 * every upstream signal was healthy (events fired, recipients resolved,
 * correct build serving). The only unknown was what the runtime could see,
 * and runtime logs are retention-limited and easy to mis-filter. This answers
 * it in one request.
 *
 * SAFETY:
 *  - Secrets report PRESENCE AND LENGTH ONLY. No value is ever returned.
 *  - Non-secret config (switches, sender, site URL) is echoed via
 *    JSON.stringify so a trailing space or wrong case is VISIBLE — that is
 *    the entire point: `EMAIL_ENABLED` must be exactly "true", and "true "
 *    or "True" look identical in a dashboard field.
 *  - Hard 404 on production. This must never be reachable on a live site,
 *    even though presence-only output is low-sensitivity.
 *  - On staging it also sits behind the Basic Auth gate in middleware.ts.
 */

export const dynamic = 'force-dynamic'

/** Secrets: presence and length only — never the value. */
const SECRET_VARS = [
  'RESEND_API_KEY',
  'MSG91_AUTH_KEY',
  'OFFER_TOKEN_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'STAGING_BASIC_AUTH_PASSWORD',
  // Publishable by design (it ships in the client bundle), but presence and
  // length are all that's needed to confirm it landed.
  'NEXT_PUBLIC_POSTHOG_KEY',
] as const

/** Non-secret config: echoed exactly, so whitespace/case problems show up. */
const VISIBLE_VARS = [
  'EMAIL_ENABLED',
  'EMAIL_FROM',
  'EMAIL_REPLY_TO',
  'MSG91_WHATSAPP_ENABLED',
  'MSG91_WHATSAPP_NUMBER',
  'MSG91_WHATSAPP_LANG',
  'MSG91_WHATSAPP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  // Must be exactly https://eu.i.posthog.com — a US host would send Indian
  // users' analytics to the wrong region, contradicting the privacy policy.
  'NEXT_PUBLIC_POSTHOG_HOST',
  // Where the "brand awaiting approval" nudge goes. Unset = the gate still
  // works, the ops email just logs and no-ops — so its absence is silent and
  // needs to be visible here.
  'OPS_NOTIFY_EMAIL',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
] as const

/**
 * Public hostnames this must never answer on, whatever VERCEL_ENV says.
 *
 * Gated by HOST rather than VERCEL_ENV: staging.guapd.com turned out to run
 * with VERCEL_ENV === 'production', so an env-based guard 404'd the very
 * environment this exists to diagnose. Host is the thing we actually care
 * about — never expose this on the live site.
 */
const BLOCKED_HOSTS = new Set(['guapd.com', 'www.guapd.com'])

export async function GET(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0]
  if (BLOCKED_HOSTS.has(host)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const secrets: Record<string, string> = {}
  for (const key of SECRET_VARS) {
    const v = process.env[key]
    secrets[key] = v ? `set (${v.length} chars)` : 'MISSING'
  }

  const visible: Record<string, string> = {}
  for (const key of VISIBLE_VARS) {
    const v = process.env[key]
    visible[key] = v === undefined ? 'MISSING' : JSON.stringify(v)
  }

  return NextResponse.json(
    {
      note: 'Temporary diagnostic. Secrets show presence/length only. Delete this route once notifications are verified.',
      // THE ANSWER: these are the exact booleans the senders gate on. If a
      // channel reports false, that channel makes no HTTP request at all.
      verdict: {
        emailWillSend: isEmailConfigured(),
        whatsappWillSend: isWhatsAppConfigured(),
        // PostHog initialises CLIENT-side and only after consent, so the
        // server can only confirm the vars exist for the bundle. Actual
        // capture still requires the user to accept analytics.
        posthogConfigured: Boolean(
          process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST,
        ),
      },
      // Why a verdict is false. EMAIL needs all three of EMAIL_ENABLED==="true",
      // RESEND_API_KEY and EMAIL_FROM. WhatsApp needs MSG91_WHATSAPP_ENABLED
      // ==="true", MSG91_AUTH_KEY and MSG91_WHATSAPP_NUMBER.
      config: visible,
      secretsPresence: secrets,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
