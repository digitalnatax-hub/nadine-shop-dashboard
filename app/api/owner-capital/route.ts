import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const amount = Number(body.amount)
    const date = String(body.date ?? '')

    if (!Number.isFinite(amount) || amount <= 0 || !isValidDate(date)) {
      return NextResponse.json({ ok: false, error: 'Enter a valid date and a positive capital amount.' }, { status: 400 })
    }

    const movement = {
      id: `OWNER-CAPITAL-${randomUUID()}`,
      date,
      account: 'cash',
      type: 'owner_capital',
      amount,
      reference: 'Owner capital contribution',
      user: String(body.user ?? 'unknown'),
      createdAt: new Date(),
    }
    await (await getCollection<any>('cash_movements')).insertOne(movement)

    return NextResponse.json({ ok: true, movement })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add owner capital.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
