import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const entries = await (await getCollection<any>('petty_cash')).find({}).sort({ _id: -1 }).toArray()
    return NextResponse.json({ ok: true, pettyCash: entries.map((entry) => ({
      id: entry.id ?? entry._id?.toString?.(),
      date: entry.date,
      amount: Number(entry.amount ?? 0),
      reason: entry.reason,
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch petty cash records.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const amount = Number(body.amount ?? 0)
    const reason = String(body.reason ?? '').trim()
    const date = String(body.date ?? new Date().toISOString().slice(0, 10))

    if (!Number.isFinite(amount) || amount <= 0 || !reason) {
      return NextResponse.json({ ok: false, error: 'A positive amount and reason are required.' }, { status: 400 })
    }

    const entry = { id: `PC-${Date.now().toString().slice(-8)}`, date, amount, reason, createdAt: new Date() }
    await (await getCollection<any>('petty_cash')).insertOne(entry)
    return NextResponse.json({ ok: true, pettyCash: entry })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save petty cash record.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}