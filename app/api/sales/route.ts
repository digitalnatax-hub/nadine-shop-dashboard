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
      creditDebtId: sale.creditDebtId,
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
    const requestedItems = Array.isArray(body.items) ? body.items : []
    const vat = Boolean(body.vat)

    if (!requestedItems.length) {
      return NextResponse.json({ ok: false, error: 'At least one product is required.' }, { status: 400 })
    }

    const sales = await getCollection<any>('sales')
    const products = await getCollection<any>('products')
    const items = []
    const reserved: { id: number; qty: number }[] = []

    try {
      for (const requested of requestedItems) {
        const productId = Number(requested.productId)
        const qty = Number(requested.qty)
        if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty <= 0) {
          throw new Error('Each item needs a valid product and quantity.')
        }
        const product = await products.findOne({ id: productId })
        if (!product) throw new Error('A selected product no longer exists.')
        const updated = await products.updateOne({ id: productId, stock: { $gte: qty } }, { $inc: { stock: -qty } })
        if (!updated.modifiedCount) throw new Error(`${product.name} does not have enough stock.`)
        reserved.push({ id: productId, qty })
        items.push({ productId, name: product.name, qty, unit: product.unit, price: Number(product.sell), buy: Number(product.buy ?? product.buy_price ?? 0) })
      }

      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
      const profit = items.reduce((sum, item) => sum + (item.price - item.buy) * item.qty, 0)
      const sale = { id: saleId, date: saleDate, items, total: subtotal * (vat ? 1.18 : 1), profit, vat, createdAt: new Date() }
      await sales.insertOne(sale)

      return NextResponse.json({ ok: true, sale: { id: saleId, date: saleDate, items, total: sale.total, profit, vat } })
    } catch (error) {
      for (const item of reserved.reverse()) {
        await products.updateOne({ id: item.id }, { $inc: { stock: item.qty } })
      }
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record sale.'
    return NextResponse.json({ ok: false, error: message }, { status: message.toLowerCase().includes('stock') ? 409 : 503 })
  }
}
