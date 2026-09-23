import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const sales = await (await getCollection<any>('sales')).find({}).sort({ _id: -1 }).toArray()
    return NextResponse.json({ ok: true, sales: sales.map((sale) => ({
      id: sale.id,
      date: sale.date,
      items: sale.items ?? [],
      total: Number(sale.total ?? 0),
      profit: Number(sale.profit ?? 0),
      vat: Boolean(sale.vat),
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch sales.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const saleId = String(body.id ?? `NS-${Date.now()}`)
    const saleDate = String(body.date ?? new Date().toISOString().slice(0, 10))
    const items = Array.isArray(body.items) ? body.items : []
    const total = Number(body.total ?? 0)
    const profit = Number(body.profit ?? 0)
    const vat = Boolean(body.vat)

    if (!items.length) {
      return NextResponse.json({ ok: false, error: 'At least one product is required.' }, { status: 400 })
    }

    const sales = await getCollection<any>('sales')
    const sale = { id: saleId, date: saleDate, items, total, profit, vat, createdAt: new Date() }
    await sales.insertOne(sale)

    return NextResponse.json({ ok: true, sale: { id: saleId, date: saleDate, items, total, profit, vat } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record sale.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
