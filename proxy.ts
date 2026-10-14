import { NextRequest, NextResponse } from 'next/server'
import { readSessionToken, SESSION_COOKIE } from '@/lib/session'

const excludedPaths = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/system-control',
])

export async function proxy(request: NextRequest) {
  if (excludedPaths.has(request.nextUrl.pathname)) return NextResponse.next()

  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (session?.role === 'superadmin') return NextResponse.next()

  try {
    const statusUrl = new URL('/api/system-control', request.url)
    const response = await fetch(statusUrl, { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: 'Unable to verify system status.' }, { status: 503 })
    }

    const payload = await response.json()
    if (payload.systemControl?.enabled) {
      return NextResponse.json({
        ok: false,
        error: payload.systemControl.message || 'System Error: service is temporarily unavailable.',
      }, { status: 423 })
    }

    return NextResponse.next()
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to verify system status.' }, { status: 503 })
  }
}

export const config = {
  matcher: '/api/:path*',
}
