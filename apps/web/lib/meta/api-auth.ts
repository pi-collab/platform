import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { isRedirectError } from 'next/dist/client/components/redirect'
import { verifyBrand } from '@/lib/brand-auth'

/** A signed-in brand for a JSON route, or the error response to return. */
export async function brandForApi(request: NextRequest): Promise<{ brand: Awaited<ReturnType<typeof verifyBrand>> } | { response: NextResponse }> {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.nextUrl.host) return { response: NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 403 }) }
  try {
    return { brand: await verifyBrand() }
  } catch (err) {
    if (isRedirectError(err)) return { response: NextResponse.json({ ok: false, message: 'Sign in as a brand.' }, { status: 401 }) }
    throw err
  }
}

export const jsonFail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status })
