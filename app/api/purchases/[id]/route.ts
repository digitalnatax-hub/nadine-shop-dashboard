import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

type PurchaseItemInput = { productId: number; qty: number; unitCost: number }

async function hasLaterInventoryActivity(purchase: any, productIds: number[]) {
  const productIdSet = new Set(productIds)
  const purchaseTime = new Date(purchase.createdAt ?? `${purchase.date}T00:00:00`).getTime()
  const [sales, purchases] = await Promise.all([
    (await getCollection<any>('sales')).find({}).toArray(),
    (await getCollection<any>('inventory_purchases')).find({}).toArray(),
  ])

  const laterSale = sales.some((sale) => {
    const containsProduct = (sale.items ?? []).some((item: any) => productIdSet.has(Number(item.productId)))
    return containsProduct && new Date(sale.createdAt ?? `${sale.date}T00:00:00`).getTime() > purchaseTime
  })

  const laterPurchase = purchases.some((entry) => {
    if (entry.id === purchase.id) return false
    const containsProduct = (entry.items ?? []).some((item: any) => productIdSet.has(Number(item.productId)))
    return containsProduct && new Date(entry.createdAt ?? `${entry.date}T00:00:00`).getTime() > purchaseTime
  })

  return laterSale || laterPurchase
}

function validateSnapshot(product: any, item: any) {
  if (item.priorStock === undefined || item.priorCost === undefined) {
    throw new Error(`The original stock snapshot for ${item.name} is missing; this older purchase cannot be safely changed.`)
  }

  const priorStock = Number(item.priorStock)
  const priorCost = Number(item.priorCost)
  const expectedStock = priorStock + Number(item.qty)
  const expectedCost = expectedStock > 0 ? (priorStock * priorCost + Number(item.qty) * Number(item.unitCost)) / expectedStock : Number(item.unitCost)

  if (Number(product.stock) !== expectedStock || Math.abs(Number(product.buy) - expectedCost) > 0.02) {
    throw new Error(`${item.name} stock or cost has changed since this purchase; edit/delete is blocked to protect inventory value.`)
  }

  return { priorStock, priorCost }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const applied: { productId: number; stock: number; buy: number }[] = []
  let purchase: any
  let linkedDebt: any
  let purchaseUpdated = false

  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await request.json()
    const purchases = await getCollection<any>('inventory_purchases')
    purchase = await purchases.findOne({ id })
    if (!purchase) return NextResponse.json({ ok: false, error: 'Inventory purchase not found.' }, { status: 404 })

    const supplier = String(body.supplier ?? '').trim()
    const date = String(body.date ?? purchase.date)
    const items: PurchaseItemInput[] = Array.isArray(body.items) ? body.items.map((item: any) => ({
      productId: Number(item.productId),
      qty: Number(item.qty),
      unitCost: Number(item.unitCost),
    })) : []
    const vatAmount = Number(body.vatAmount ?? purchase.vatAmount ?? 0)
    const paymentMethod = String(body.paymentMethod ?? purchase.paymentMethod ?? 'cash')
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
    const total = subtotal + vatAmount
    const paidAmount = paymentMethod === 'credit' ? 0 : Number(body.paidAmount ?? purchase.paidAmount ?? 0)

    if (!supplier || !items.length || items.some((item) => !Number.isInteger(item.productId) || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)
      || !Number.isFinite(vatAmount) || vatAmount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total
      || !['cash', 'petty_cash', 'bank', 'mobile_money', 'other', 'credit'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Enter a supplier, valid items, payment method, VAT, and payment amount.' }, { status: 400 })
    }

    const debts = await getCollection<any>('debts')
    linkedDebt = await debts.findOne({ purchaseId: id, kind: 'supplier' })
    const laterPayments = Number(linkedDebt?.paidAmount ?? 0)
    if (paidAmount + laterPayments > total) {
      return NextResponse.json({ ok: false, error: 'Purchase total cannot be less than payments already recorded.' }, { status: 409 })
    }

    const oldItems: any[] = purchase.items ?? []
    const affectedIds = [...new Set([...oldItems.map((item) => Number(item.productId)), ...items.map((item) => item.productId)])]
    if (await hasLaterInventoryActivity(purchase, affectedIds)) {
      return NextResponse.json({ ok: false, error: 'This purchase has later sales or purchases using the same products; reverse those transactions first.' }, { status: 409 })
    }

    const products = await getCollection<any>('products')
    const itemSnapshots = new Map<number, { stock: number; buy: number }>()
    const oldByProduct = new Map(oldItems.map((item) => [Number(item.productId), item]))
    const newByProduct = new Map(items.map((item) => [item.productId, item]))
    const updatedItems: any[] = []

    for (const productId of affectedIds) {
      const product = await products.findOne({ id: productId })
      if (!product) throw new Error(`Product ${productId} no longer exists.`)

      const oldItem = oldByProduct.get(productId)
      const newItem = newByProduct.get(productId)
      const snapshot = oldItem ? validateSnapshot(product, oldItem) : { priorStock: Number(product.stock ?? 0), priorCost: Number(product.buy ?? 0) }
      itemSnapshots.set(productId, { stock: Number(product.stock ?? 0), buy: Number(product.buy ?? 0) })

      const stock = snapshot.priorStock + Number(newItem?.qty ?? 0)
      const buy = stock > 0 && newItem
        ? (snapshot.priorStock * snapshot.priorCost + newItem.qty * newItem.unitCost) / stock
        : stock > 0 ? snapshot.priorCost : 0

      const updated = await products.updateOne({ id: productId, stock: product.stock }, { $set: { stock, buy } })
      if (!updated.modifiedCount) throw new Error(`${product.name} changed while updating the purchase.`)

      applied.push({ productId, stock: itemSnapshots.get(productId)!.stock, buy: itemSnapshots.get(productId)!.buy })

      if (newItem) {
        updatedItems.push({
          productId,
          name: product.name,
          qty: newItem.qty,
          unit: product.unit,
          unitCost: newItem.unitCost,
          priorStock: snapshot.priorStock,
          priorCost: snapshot.priorCost,
        })
      }
    }

    const updatedPurchase = { ...purchase, date, supplier, items: updatedItems, subtotal, vatAmount, total, paidAmount, paymentMethod, updatedAt: new Date() }
    await purchases.updateOne({ _id: purchase._id }, { $set: updatedPurchase })
    purchaseUpdated = true

    const outstanding = total - paidAmount - laterPayments
    if (linkedDebt) {
      await debts.updateOne({ _id: linkedDebt._id }, { $set: {
        name: supplier,
        amount: outstanding,
        original: outstanding + laterPayments,
        status: outstanding === 0 ? 'paid' : 'unpaid',
        paidAt: outstanding === 0 ? new Date() : null,
        due: date,
        description: `Inventory purchase ${id}`,
      } })
    } else if (outstanding > 0) {
      const lastDebt = await debts.find({}).sort({ id: -1 }).limit(1).next()
      linkedDebt = {
        id: Number(lastDebt?.id ?? 0) + 1,
        name: supplier,
        phone: '',
        amount: outstanding,
        original: outstanding,
        paidAmount: 0,
        kind: 'supplier',
        due: date,
        status: 'unpaid',
        description: `Inventory purchase ${id}`,
        purchaseId: id,
        createdAt: new Date(),
      }
      await debts.insertOne(linkedDebt)
    }

    const movements = await getCollection<any>('cash_movements')
    const pettyCash = await getCollection<any>('petty_cash')
    if (paidAmount > 0 && paymentMethod === 'petty_cash') {
      await movements.deleteOne({ id: `PURCHASE-${id}` })
      await pettyCash.updateOne({ reference: id, type: 'inventory_purchase_payment' }, { $set: { amount: paidAmount, date, reason: `Inventory purchase ${id}` } }, { upsert: true })
    } else {
      await pettyCash.deleteOne({ reference: id, type: 'inventory_purchase_payment' })
      if (paidAmount > 0) {
        await movements.updateOne({ id: `PURCHASE-${id}` }, { $set: { date, account: paymentMethod, amount: -paidAmount, reference: id, type: 'inventory_purchase_payment' } }, { upsert: true })
      } else {
        await movements.deleteOne({ id: `PURCHASE-${id}` })
      }
    }

    return NextResponse.json({ ok: true, purchase: updatedPurchase })
  } catch (error) {
    for (const item of applied.reverse()) {
      await (await getCollection<any>('products')).updateOne({ id: item.productId }, { $set: { stock: item.stock, buy: item.buy } })
    }
    if (purchaseUpdated && purchase) {
      await (await getCollection<any>('inventory_purchases')).updateOne({ _id: purchase._id }, { $set: purchase })
    }
    if (linkedDebt?._id) {
      await (await getCollection<any>('debts')).updateOne({ _id: linkedDebt._id }, { $set: linkedDebt })
    }
    const message = error instanceof Error ? error.message : 'Unable to update inventory purchase.'
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('not found') ? 404 : 409 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const restoredProducts: { id: number; stock: number; buy: number }[] = []

  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const purchases = await getCollection<any>('inventory_purchases')
    const purchase = await purchases.findOne({ id })
    if (!purchase) return NextResponse.json({ ok: false, error: 'Inventory purchase not found.' }, { status: 404 })

    const items: any[] = purchase.items ?? []
    const productIds = items.map((item) => Number(item.productId))
    if (await hasLaterInventoryActivity(purchase, productIds)) {
      return NextResponse.json({ ok: false, error: 'This purchase has later sales or purchases using the same products; reverse those transactions first.' }, { status: 409 })
    }

    const debts = await getCollection<any>('debts')
    const debt = await debts.findOne({ purchaseId: id, kind: 'supplier' })
    if (debt && Number(debt.paidAmount ?? 0) > 0) {
      return NextResponse.json({ ok: false, error: 'Reverse supplier payments before deleting this purchase.' }, { status: 409 })
    }

    const products = await getCollection<any>('products')
    for (const item of items) {
      const product = await products.findOne({ id: Number(item.productId) })
      if (!product) continue
      const snapshot = validateSnapshot(product, item)
      restoredProducts.push({ id: Number(product.id), stock: Number(product.stock), buy: Number(product.buy) })
      await products.updateOne({ id: Number(product.id) }, { $set: { stock: snapshot.priorStock, buy: snapshot.priorCost } })
    }

    await purchases.deleteOne({ _id: purchase._id })
    if (debt) await debts.deleteOne({ _id: debt._id })
    await (await getCollection<any>('cash_movements')).deleteOne({ id: `PURCHASE-${id}` })
    await (await getCollection<any>('petty_cash')).deleteOne({ reference: id, type: 'inventory_purchase_payment' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    for (const product of restoredProducts) {
      await (await getCollection<any>('products')).updateOne({ id: product.id }, { $set: { stock: product.stock, buy: product.buy } })
    }
    const message = error instanceof Error ? error.message : 'Unable to delete inventory purchase.'
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('not found') ? 404 : 409 })
  }
}
