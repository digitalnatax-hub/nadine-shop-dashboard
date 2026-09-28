import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

type SaleItem = { productId?: number; name: string; qty: number; unit: string; price: number; buy: number }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await request.json()
    const sales = await getCollection<any>('sales')
    const products = await getCollection<any>('products')
    const sale = await sales.findOne({ id })
    if (!sale) return NextResponse.json({ ok: false, error: 'Sale not found.' }, { status: 404 })
    if (sale.creditDebtId !== undefined) return NextResponse.json({ ok: false, error: 'Settled credit sales cannot be edited. Reverse the payment first.' }, { status: 400 })

    const requested = Array.isArray(body.items) ? body.items : []
    if (!requested.length) return NextResponse.json({ ok: false, error: 'A sale must contain at least one item.' }, { status: 400 })

    const oldItems: SaleItem[] = sale.items ?? []
    const newItems: SaleItem[] = []
    for (const item of requested) {
      const qty = Number(item.qty)
      const price = Number(item.price)
      const productId = Number(item.productId)
      if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(productId) || !Number.isFinite(price) || price < 0) {
        return NextResponse.json({ ok: false, error: 'Sale item quantities and products must be valid.' }, { status: 400 })
      }
      if (qty === 0) continue
      const product = await products.findOne({ id: productId })
      const previous = oldItems.find((entry) => Number(entry.productId) === productId || entry.name === String(item.name ?? ''))
      if (!product && !previous) return NextResponse.json({ ok: false, error: 'A selected product no longer exists.' }, { status: 400 })
      newItems.push({
        productId,
        name: previous?.name ?? product.name,
        qty,
        unit: previous?.unit ?? product.unit,
        price,
        buy: previous?.buy ?? Number(product.buy ?? product.buy_price ?? 0),
      })
    }
    if (!newItems.length) return NextResponse.json({ ok: false, error: 'A sale must contain at least one item.' }, { status: 400 })

    const stockChanges = new Map<number, number>()
    for (const item of oldItems) {
      const product = item.productId ? { id: item.productId } : await products.findOne({ name: item.name })
      if (product) stockChanges.set(Number(product.id), (stockChanges.get(Number(product.id)) ?? 0) + item.qty)
    }
    for (const item of newItems) {
      stockChanges.set(item.productId!, (stockChanges.get(item.productId!) ?? 0) - item.qty)
    }

    const applied: { id: number; delta: number }[] = []
    try {
      for (const [productId, delta] of stockChanges) {
        if (delta === 0) continue
        const filter = delta < 0 ? { id: productId, stock: { $gte: -delta } } : { id: productId }
        const result = await products.updateOne(filter, { $inc: { stock: delta } })
        if (!result.modifiedCount) throw new Error('The updated quantities exceed available stock.')
        applied.push({ id: productId, delta })
      }

      const subtotal = newItems.reduce((sum, item) => sum + item.price * item.qty, 0)
      const profit = newItems.reduce((sum, item) => sum + (item.price - item.buy) * item.qty, 0)
      const vat = Boolean(body.vat)
      const updatedSale = { ...sale, date: String(body.date ?? sale.date), items: newItems, vat, total: subtotal * (vat ? 1.18 : 1), profit, updatedAt: new Date() }
      await sales.updateOne({ _id: sale._id }, { $set: updatedSale })
      return NextResponse.json({ ok: true, sale: { id, date: updatedSale.date, items: newItems, vat, total: updatedSale.total, profit } })
    } catch (error) {
      for (const change of applied.reverse()) await products.updateOne({ id: change.id }, { $inc: { stock: -change.delta } })
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update sale.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const sales = await getCollection<any>('sales')
    const products = await getCollection<any>('products')
    const sale = await sales.findOne({ id })
    if (!sale) return NextResponse.json({ ok: false, error: 'Sale not found.' }, { status: 404 })

    if (sale.creditDebtId !== undefined) {
      const debts = await getCollection<any>('debts')
      const debt = await debts.findOne({
        id: Number(sale.creditDebtId),
        $or: [{ paymentSaleIds: id }, { saleId: id }],
      })
      if (!debt) return NextResponse.json({ ok: false, error: 'The settled debt record was not found.' }, { status: 409 })
      const paymentAmount = Number(sale.paymentAmount ?? sale.total ?? 0)
      const oldPaidAmount = Number(debt.paidAmount ?? debt.original ?? 0)
      const oldBalance = Number(debt.amount ?? 0)
      const nextPaidAmount = Math.max(0, oldPaidAmount - paymentAmount)
      const nextBalance = oldBalance + paymentAmount
      const reopened = await debts.updateOne(
        { id: debt.id, $or: [{ paymentSaleIds: id }, { saleId: id }] },
        { $set: { status: 'unpaid', amount: nextBalance, paidAmount: nextPaidAmount, paidAt: null } },
      )
      if (!reopened.modifiedCount) return NextResponse.json({ ok: false, error: 'Debt balance could not be restored.' }, { status: 409 })
      const deletedSettlement = await sales.deleteOne({ _id: sale._id })
      if (!deletedSettlement.deletedCount) {
        await debts.updateOne({ id: debt.id }, { $set: { status: debt.status, amount: oldBalance, paidAmount: oldPaidAmount, paidAt: debt.paidAt } })
        return NextResponse.json({ ok: false, error: 'The payment sale could not be reversed.' }, { status: 409 })
      }
      return NextResponse.json({ ok: true, reversedSettlement: true })
    }

    const restored = new Map<number, number>()
    for (const item of sale.items ?? []) {
      const product = item.productId
        ? await products.findOne({ id: Number(item.productId) })
        : await products.findOne({ name: item.name })
      if (!product) continue
      await products.updateOne({ id: Number(product.id) }, { $inc: { stock: Number(item.qty) } })
      restored.set(Number(product.id), (restored.get(Number(product.id)) ?? 0) + Number(item.qty))
    }

    const deleted = await sales.deleteOne({ _id: sale._id })
    if (!deleted.deletedCount) {
      for (const [productId, qty] of restored) await products.updateOne({ id: productId }, { $inc: { stock: -qty } })
      return NextResponse.json({ ok: false, error: 'Sale changed before it could be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete sale.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}