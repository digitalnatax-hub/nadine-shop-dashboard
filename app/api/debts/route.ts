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
      paidAmount: Number(debt.paidAmount ?? 0),
      kind: debt.kind,
      due: debt.due ? new Date(debt.due).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: debt.status ?? 'unpaid',
      description: debt.description ?? '',
      items: debt.items ?? [],
      vat: Boolean(debt.vat),
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
    const isSaleOnCredit = Array.isArray(body.items)
    const kind = body.kind === 'supplier' ? 'supplier' : 'customer'
    const due = body.due ? String(body.due) : new Date().toISOString().slice(0, 10)

    if (!name || (kind === 'supplier' && Number(body.amount ?? 0) <= 0) || (isSaleOnCredit && kind !== 'customer')) {
      return NextResponse.json({ ok: false, error: 'Name and amount are required.' }, { status: 400 })
    }
    if (isSaleOnCredit && body.items.length === 0) {
      return NextResponse.json({ ok: false, error: 'At least one product is required for a credit sale.' }, { status: 400 })
    }

    const debts = await getCollection<any>('debts')
    const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
    const id = Number(last?.id ?? 0) + 1

    if (isSaleOnCredit) {
      const products = await getCollection<any>('products')
      const items = []
      const reserved: { id: number; qty: number }[] = []
      try {
        for (const requested of body.items) {
          const productId = Number(requested.productId)
          const qty = Number(requested.qty)
          if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty <= 0) throw new Error('Each item needs a valid product and quantity.')
          const product = await products.findOne({ id: productId })
          if (!product) throw new Error('A selected product no longer exists.')
          const updated = await products.updateOne({ id: productId, stock: { $gte: qty } }, { $inc: { stock: -qty } })
          if (!updated.modifiedCount) throw new Error(`${product.name} does not have enough stock.`)
          reserved.push({ id: productId, qty })
          items.push({ productId, name: product.name, qty, unit: product.unit, price: Number(product.sell), buy: Number(product.buy ?? product.buy_price ?? 0) })
        }
        const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
        const vat = Boolean(body.vat)
        const amount = subtotal * (vat ? 1.18 : 1)
        const description = String(body.description ?? `Credit sale: ${items.map((item) => item.name).join(', ')}`).trim()
        const saleId = `CR-${id}-${Date.now()}`
        const date = new Date().toISOString().slice(0, 10)
        const profit = items.reduce((sum, item) => sum + (item.price - item.buy) * item.qty, 0)
        const sale = {
          id: saleId,
          date,
          customer: name,
          items,
          subtotal,
          total: amount,
          vatRate: vat ? 0.18 : 0,
          vatAmount: amount - subtotal,
          profit,
          vat,
          creditDebtId: id,
          paymentStatus: 'unpaid',
          amountPaid: 0,
          customerBalance: amount,
          createdAt: new Date(),
        }
        const debt = { id, name, phone: body.phone ?? '', amount, original: amount, paidAmount: 0, kind: 'customer', due, status: 'unpaid', description, items, vat, saleId, createdAt: new Date() }
        const sales = await getCollection<any>('sales')
        await sales.insertOne(sale)
        try {
          await debts.insertOne(debt)
        } catch (error) {
          await sales.deleteOne({ id: saleId })
          throw error
        }
        return NextResponse.json({ ok: true, debt })
      } catch (error) {
        for (const item of reserved.reverse()) await products.updateOne({ id: item.id }, { $inc: { stock: item.qty } })
        throw error
      }
    }

    const amount = Number(body.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: 'Name and a positive amount are required.' }, { status: 400 })

    const debt = {
      id,
      name,
      phone: body.phone ?? '',
      amount,
      original: amount,
      paidAmount: 0,
      kind,
      due,
      status: 'unpaid',
      description: String(body.description ?? ''),
      createdAt: new Date(),
    }

    await debts.insertOne(debt)

    return NextResponse.json({ ok: true, debt: { ...debt } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create debt record.'
    return NextResponse.json({ ok: false, error: message }, { status: message.toLowerCase().includes('stock') ? 409 : 503 })
  }
}
