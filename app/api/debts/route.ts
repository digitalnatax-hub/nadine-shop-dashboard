import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const debts = await (await getCollection<any>('debts')).find({}).sort({ _id: -1 }).toArray()
    return NextResponse.json({ ok: true, debts: debts.map((debt) => ({
      id: Number(debt.id),
      name: debt.name,
      phone: debt.phone ?? '',
      amount: Number(debt.amount ?? 0),
      original: Number(debt.original ?? debt.amount ?? 0),
      kind: debt.kind,
      due: debt.due ? new Date(debt.due).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch debts.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    const amount = Number(body.amount ?? 0)
    const kind = body.kind === 'supplier' ? 'supplier' : 'customer'
    const due = body.due ? String(body.due) : new Date().toISOString().slice(0, 10)

    if (!name || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Name and amount are required.' }, { status: 400 })
    }

    const debts = await getCollection<any>('debts')
    const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
    const id = Number(last?.id ?? 0) + 1

    const debt = {
      id,
      name,
      phone: body.phone ?? '',
      amount,
      original: amount,
      kind,
      due,
      createdAt: new Date(),
    }

    await debts.insertOne(debt)

    return NextResponse.json({ ok: true, debt: { ...debt } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create debt record.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
