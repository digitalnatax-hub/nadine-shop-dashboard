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
      vatRate: Number(sale.vatRate ?? (sale.vat ? 0.18 : 0)),
      vatAmount: Number(sale.vatAmount ?? (sale.vat ? Number(sale.total ?? 0) - Number(sale.total ?? 0) / 1.18 : 0)),
      paymentStatus: sale.paymentStatus ?? (sale.paymentAmount !== undefined ? 'payment' : sale.creditDebtId ? 'unpaid' : 'paid'),
      amountPaid: Number(sale.amountPaid ?? sale.paymentAmount ?? (sale.creditDebtId ? 0 : sale.total ?? 0)),
      customerBalance: Number(sale.customerBalance ?? (sale.paymentAmount !== undefined ? 0 : sale.creditDebtId ? sale.total : 0)),
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
    let saleSaved = false

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
      const total = subtotal * (vat ? 1.18 : 1)
      const vatAmount = total - subtotal
      const sale = { id: saleId, date: saleDate, items, subtotal, total, vatRate: vat ? 0.18 : 0, vatAmount, profit, vat, paymentStatus: 'paid', amountPaid: total, customerBalance: 0, createdAt: new Date() }
      await sales.insertOne(sale)
      saleSaved = true
      await (await getCollection<any>('cash_movements')).insertOne({ id: `SALE-${saleId}`, date: saleDate, account: 'cash', type: 'sale_receipt', amount: total, reference: saleId, createdAt: new Date() })

      return NextResponse.json({ ok: true, sale: { id: saleId, date: saleDate, items, subtotal, total, vatAmount, vatRate: sale.vatRate, profit, vat, paymentStatus: 'paid', amountPaid: total, customerBalance: 0 } })
    } catch (error) {
      if (saleSaved) {
        await sales.deleteOne({ id: saleId })
        await (await getCollection<any>('cash_movements')).deleteOne({ id: `SALE-${saleId}` })
      }
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
