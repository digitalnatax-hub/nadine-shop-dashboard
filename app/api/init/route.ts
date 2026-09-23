import { NextResponse } from 'next/server'
import { ensureDatabaseSchema } from '@/lib/db'

export async function POST() {
  try {
    await ensureDatabaseSchema()
    return NextResponse.json({ ok: true, message: 'MongoDB schema is ready.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MongoDB is not reachable.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
