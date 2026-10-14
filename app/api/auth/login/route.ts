import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/session'

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Username and password are required.' }, { status: 400 })
    }

    const users = await getCollection<any>('users')
    const found = await users.findOne({
      username: String(username).trim(),
      password: String(password),
    })

    if (!found) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 })
    }

    const settings = await getCollection<any>('system_settings')
    const savedControl = await settings.findOne({ id: 'system-control' })
    const systemControl = {
      enabled: Boolean(savedControl?.enabled),
      message: typeof savedControl?.message === 'string' && savedControl.message.trim()
        ? savedControl.message.trim()
        : 'Some system services got an error. Please contact the system developer for a service status update and assistance with restoring access.',
    }

    if (systemControl.enabled && found.role !== 'superadmin') {
      return NextResponse.json({
        ok: false,
        error: systemControl.message,
        systemControl,
      }, { status: 423 })
    }

    const response = NextResponse.json({
      ok: true,
      systemControl,
      user: {
        id: found.id ?? found._id?.toString?.() ?? found._id,
        username: found.username,
        role: found.role,
      },
    })
    response.cookies.set(SESSION_COOKIE, createSessionToken(found.username, found.role), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 12 * 60 * 60,
    })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database access failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
