import { NextRequest, NextResponse } from 'next/server'
import { getCollection } from '@/lib/db'
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
    const settings = await getCollection<any>('system_settings')
    const savedControl = await settings.findOne({ id: 'system-control' })
    if (savedControl?.enabled) {
      return NextResponse.json({
        ok: false,
        error: savedControl.message || 'System Error: service is temporarily unavailable.',
      }, { status: 423 })
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Unable to verify system status for API request.', error)
    return NextResponse.json({ ok: false, error: 'Unable to verify system status.' }, { status: 503 })
  }
}

export const config = {
  matcher: '/api/:path*',
}
