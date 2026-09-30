import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

type PurchaseItem = { productId: number; qty: number; unitCost: number }

export async function POST(request: Request) {
  const applied: { id: number; stock: number; buy: number }[] = []
  let purchaseId: string | undefined
  let debtId: number | undefined

  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const supplier = String(body.supplier ?? '').trim()
    const date = String(body.date ?? new Date().toISOString().slice(0, 10))
    const items: PurchaseItem[] = Array.isArray(body.items) ? body.items.map((item: any) => ({
      productId: Number(item.productId),
      qty: Number(item.qty),
      unitCost: Number(item.unitCost),
    })) : []
    const vatAmount = Number(body.vatAmount ?? 0)
    const paymentMethod = String(body.paymentMethod ?? 'cash')
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
    const total = subtotal + vatAmount
    const paidAmount = Number(body.paidAmount ?? 0)

    if (!supplier || !items.length || items.some((item) => !Number.isInteger(item.productId) || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      return NextResponse.json({ ok: false, error: 'Supplier and valid product quantities and costs are required.' }, { status: 400 })
    }
    if (!Number.isFinite(vatAmount) || vatAmount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total) {
      return NextResponse.json({ ok: false, error: 'VAT and paid amounts must be valid, and payment cannot exceed the purchase total.' }, { status: 400 })
    }
    if (!['cash', 'petty_cash', 'bank', 'mobile_money', 'other'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Select a valid payment method.' }, { status: 400 })
    }

    const products = await getCollection<any>('products')
    const purchaseItems = []
    for (const item of items) {
      const product = await products.findOne({ id: item.productId })
      if (!product) throw new Error(`Product ${item.productId} was not found.`)
      const currentStock = Number(product.stock ?? 0)
      const currentCost = Number(product.buy ?? product.buy_price ?? 0)
      const nextStock = currentStock + item.qty
      const nextCost = nextStock > 0 ? (currentStock * currentCost + item.qty * item.unitCost) / nextStock : item.unitCost
      const updated = await products.updateOne({ id: item.productId, stock: product.stock }, { $set: { stock: nextStock, buy: nextCost } })
      if (!updated.modifiedCount) throw new Error(`${product.name} changed during this purchase. Refresh and try again.`)
      applied.push({ id: item.productId, stock: currentStock, buy: currentCost })
      purchaseItems.push({ productId: item.productId, name: product.name, qty: item.qty, unit: product.unit, unitCost: item.unitCost })
    }

    purchaseId = `PO-${Date.now()}`
    const purchase = { id: purchaseId, date, supplier, items: purchaseItems, subtotal, vatAmount, total, paidAmount, paymentMethod, user: String(body.user ?? 'unknown'), createdAt: new Date() }
    await (await getCollection<any>('inventory_purchases')).insertOne(purchase)

    let debt = null
    const outstanding = total - paidAmount
    if (outstanding > 0) {
      const debts = await getCollection<any>('debts')
      const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
      debtId = Number(last?.id ?? 0) + 1
      debt = {
        id: debtId,
        name: supplier,
        phone: '',
        amount: outstanding,
        original: outstanding,
        paidAmount: 0,
        kind: 'supplier',
        due: date,
        status: 'unpaid',
        description: `Inventory purchase ${purchaseId}`,
        purchaseId,
        createdAt: new Date(),
      }
      await debts.insertOne(debt)
    }

    if (paidAmount > 0 && paymentMethod === 'petty_cash') {
      await (await getCollection<any>('petty_cash')).insertOne({
        id: `PC-${Date.now().toString().slice(-8)}`,
        date,
        amount: paidAmount,
        reason: `Inventory purchase ${purchaseId}`,
        type: 'inventory_purchase_payment',
        category: 'Inventory purchase',
        paymentMethod,
        reference: purchaseId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    } else if (paidAmount > 0) {
      await (await getCollection<any>('cash_movements')).insertOne({
        id: `PURCHASE-${purchaseId}`,
        date,
        account: paymentMethod,
        type: 'inventory_purchase_payment',
        amount: -paidAmount,
        reference: purchaseId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    }

    return NextResponse.json({ ok: true, purchase, debt })
  } catch (error) {
    for (const item of applied.reverse()) {
      await (await getCollection<any>('products')).updateOne({ id: item.id }, { $set: { stock: item.stock, buy: item.buy } })
    }
    if (purchaseId) await (await getCollection<any>('inventory_purchases')).deleteOne({ id: purchaseId })
    if (purchaseId) {
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `PURCHASE-${purchaseId}` })
      await (await getCollection<any>('petty_cash')).deleteOne({ reference: purchaseId })
    }
    if (debtId !== undefined) await (await getCollection<any>('debts')).deleteOne({ id: debtId })
    const message = error instanceof Error ? error.message : 'Unable to record inventory purchase.'
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('not found') ? 404 : 503 })
  }
}