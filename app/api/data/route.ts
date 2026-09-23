import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()

    const productsCol = await getCollection<any>('products')
    const salesCol = await getCollection<any>('sales')
    const debtsCol = await getCollection<any>('debts')
    const pettyCashCol = await getCollection<any>('petty_cash')

    const products = await productsCol.find({}).sort({ _id: -1 }).toArray()
    const sales = await salesCol.find({}).sort({ _id: -1 }).toArray()
    const debts = await debtsCol.find({}).sort({ _id: -1 }).toArray()
    const pettyCash = await pettyCashCol.find({}).sort({ _id: -1 }).toArray()

    return NextResponse.json({
      ok: true,
      products: products.map((product) => ({
        id: Number(product.id),
        name: product.name,
        category: product.category,
        stock: Number(product.stock ?? 0),
        unit: product.unit,
        buy: Number(product.buy ?? product.buy_price ?? 0),
        sell: Number(product.sell ?? product.sell_price ?? 0),
        min: Number(product.min ?? product.min_stock ?? 5),
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        date: sale.date ?? sale.sale_date,
        items: Array.isArray(sale.items) ? sale.items : [],
        total: Number(sale.total ?? 0),
        profit: Number(sale.profit ?? 0),
        vat: Boolean(sale.vat),
      })),
      debts: debts.map((debt) => ({
        id: Number(debt.id),
        name: debt.name,
        phone: debt.phone ?? '',
        amount: Number(debt.amount ?? 0),
        original: Number(debt.original ?? debt.original_amount ?? debt.amount ?? 0),
        kind: debt.kind,
        due: debt.due ? new Date(debt.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date',
      })),
      pettyCash: pettyCash.map((entry) => ({
        id: entry.id ?? entry._id?.toString?.(),
        date: entry.date,
        amount: Number(entry.amount ?? 0),
        reason: entry.reason,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load shop data.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
