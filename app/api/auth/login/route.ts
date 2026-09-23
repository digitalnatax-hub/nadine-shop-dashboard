import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

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

    return NextResponse.json({
      ok: true,
      user: {
        id: found.id ?? found._id?.toString?.() ?? found._id,
        username: found.username,
        role: found.role,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database access failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
