import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const products = await (await getCollection<any>('products')).find({}).sort({ _id: -1 }).toArray()
    return NextResponse.json({ ok: true, products: products.map((product) => ({
      id: Number(product.id),
      name: product.name,
      category: product.category,
      stock: Number(product.stock ?? 0),
      unit: product.unit,
      buy: Number(product.buy ?? 0),
      sell: Number(product.sell ?? 0),
      min: Number(product.min ?? 5),
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch products.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  let productId: number | undefined
  let purchaseId: string | undefined
  let debtId: number | undefined
  let productSaved = false
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    const category = String(body.category ?? 'Other').trim() || 'Other'
    const stock = Number(body.stock ?? 0)
    const unit = String(body.unit ?? 'pieces').trim() || 'pieces'
    const buy = Number(body.buy ?? 0)
    const sell = Number(body.sell ?? 0)
    const min = Number(body.min ?? 5)
    const openingPayment = body.openingPayment === 'credit' ? 'credit' : body.openingPayment === 'cash' ? 'cash' : null
    const supplier = String(body.supplier ?? '').trim()
    const paymentMethod = String(body.paymentMethod ?? 'cash')
    const openingValue = stock * buy

    if (!name || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(buy) || buy < 0 || !Number.isFinite(sell) || sell < 0 || !Number.isFinite(min) || min < 0) {
      return NextResponse.json({ ok: false, error: 'Product name and valid non-negative stock and prices are required.' }, { status: 400 })
    }
    if (openingValue > 0 && !openingPayment) {
      return NextResponse.json({ ok: false, error: 'Choose whether the opening stock was paid in cash or bought on credit.' }, { status: 400 })
    }
    if (openingPayment === 'credit' && !supplier) {
      return NextResponse.json({ ok: false, error: 'Enter the supplier for opening stock bought on credit.' }, { status: 400 })
    }
    if (openingPayment === 'cash' && !['cash', 'petty_cash', 'bank', 'mobile_money', 'other'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Choose a valid payment account.' }, { status: 400 })
    }

    const products = await getCollection<any>('products')
    const last = await products.find({}).sort({ id: -1 }).limit(1).next()
    const id = Number(last?.id ?? 0) + 1
    productId = id

    const product = {
      id,
      name,
      category,
      stock,
      unit,
      buy,
      sell,
      min,
      createdAt: new Date(),
    }

    await products.insertOne(product)
    productSaved = true

    let purchase = null
    let debt = null
    if (openingValue > 0 && openingPayment) {
      purchaseId = `PO-OPEN-${id}-${Date.now()}`
      const purchaseItem = { productId: id, name, qty: stock, unit, unitCost: buy, priorStock: 0, priorCost: buy }
      purchase = {
        id: purchaseId,
        date: new Date().toISOString().slice(0, 10),
        supplier: openingPayment === 'credit' ? supplier : 'Opening stock',
        items: [purchaseItem],
        subtotal: openingValue,
        vatAmount: 0,
        total: openingValue,
        paidAmount: openingPayment === 'cash' ? openingValue : 0,
        paymentMethod: openingPayment === 'cash' ? paymentMethod : 'credit',
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      }
      await (await getCollection<any>('inventory_purchases')).insertOne(purchase)

      if (openingPayment === 'credit') {
        const debts = await getCollection<any>('debts')
        const lastDebt = await debts.find({}).sort({ id: -1 }).limit(1).next()
        debtId = Number(lastDebt?.id ?? 0) + 1
        debt = {
          id: debtId,
          name: supplier,
          phone: '',
          amount: openingValue,
          original: openingValue,
          paidAmount: 0,
          kind: 'supplier',
          due: purchase.date,
          status: 'unpaid',
          description: `Opening stock for ${name}`,
          purchaseId,
          createdAt: new Date(),
        }
        await debts.insertOne(debt)
      } else if (paymentMethod === 'petty_cash') {
        await (await getCollection<any>('petty_cash')).insertOne({
          id: `PC-${Date.now().toString().slice(-8)}`,
          date: purchase.date,
          amount: openingValue,
          reason: `Opening stock: ${name}`,
          type: 'inventory_purchase_payment',
          category: 'Inventory purchase',
          paymentMethod,
          reference: purchaseId,
          user: String(body.user ?? 'unknown'),
          createdAt: new Date(),
        })
      } else {
        await (await getCollection<any>('cash_movements')).insertOne({
          id: `PURCHASE-${purchaseId}`,
          date: purchase.date,
          account: paymentMethod,
          type: 'inventory_purchase_payment',
          amount: -openingValue,
          reference: purchaseId,
          user: String(body.user ?? 'unknown'),
          createdAt: new Date(),
        })
      }
    }

    return NextResponse.json({ ok: true, product: { ...product }, purchase, debt })
  } catch (error) {
    if (productId !== undefined && productSaved) await (await getCollection<any>('products')).deleteOne({ id: productId })
    if (purchaseId) {
      await (await getCollection<any>('inventory_purchases')).deleteOne({ id: purchaseId })
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `PURCHASE-${purchaseId}` })
      await (await getCollection<any>('petty_cash')).deleteOne({ reference: purchaseId })
    }
    if (debtId !== undefined) await (await getCollection<any>('debts')).deleteOne({ id: debtId })
    const message = error instanceof Error ? error.message : 'Unable to create product.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
