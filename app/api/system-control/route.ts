import { NextResponse } from 'next/server'
import { getCollection } from '@/lib/db'
import { readRequestSession } from '@/lib/session'

type SystemControl = {
  enabled: boolean
  message: string
}

const DEFAULT_SYSTEM_CONTROL: SystemControl = {
  enabled: false,
  message: 'Some system services got an error. Please contact the system developer for a service status update and assistance with restoring access.',
}

export async function GET() {
  try {
    const settings = await getCollection<any>('system_settings')
    const saved = await settings.findOne({ id: 'system-control' })

    return NextResponse.json({
      ok: true,
      systemControl: {
        enabled: Boolean(saved?.enabled),
        message: typeof saved?.message === 'string' && saved.message.trim()
          ? saved.message.trim()
          : DEFAULT_SYSTEM_CONTROL.message,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load system status.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (readRequestSession(request)?.role !== 'superadmin') {
    return NextResponse.json({ ok: false, error: 'Superadmin access required.' }, { status: 403 })
  }

  try {
    const input = await request.json() as Partial<SystemControl>
    const settings = await getCollection<any>('system_settings')
    const next: SystemControl = {
      enabled: Boolean(input.enabled),
      message: typeof input.message === 'string' && input.message.trim()
        ? input.message.trim().slice(0, 500)
        : DEFAULT_SYSTEM_CONTROL.message,
    }

    await settings.updateOne(
      { id: 'system-control' },
      { $set: { ...next, updatedAt: new Date() } },
      { upsert: true },
    )

    return NextResponse.json({ ok: true, systemControl: next })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update system status.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
