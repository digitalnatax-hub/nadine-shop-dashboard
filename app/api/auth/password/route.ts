import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const username = String(body.username ?? '').trim()
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')

    if (!username || !currentPassword || newPassword.length < 6) {
      return NextResponse.json({ ok: false, error: 'Username, current password and a new password of at least 6 characters are required.' }, { status: 400 })
    }

    const users = await getCollection<any>('users')
    const user = await users.findOne({ username, password: currentPassword })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Current password is incorrect.' }, { status: 401 })
    }

    await users.updateOne({ _id: user._id }, { $set: { password: newPassword } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to change password.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}