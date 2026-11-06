import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { markAiOnboarding } from '@/lib/ai/onboarding'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'

/** POST { done: 'highlight' | 'intro' }: the signed-in brand user dismissed or
 *  used the sparkle-icon highlight, or saw the intro. Stored per user. */
const Body = z.object({ done: z.enum(['highlight', 'intro']) }).strict()

export async function POST(request: NextRequest) {
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  if (!creatorSearchEnabled(a.brand.brandId)) return jsonFail(404, 'Not found.')
  const r = Body.safeParse(await request.json().catch(() => null))
  if (!r.success) return jsonFail(400, 'Bad request.')
  await markAiOnboarding(a.brand.profileId, r.data.done === 'highlight' ? { highlight: true } : { intro: true })
  return NextResponse.json({ ok: true })
}
