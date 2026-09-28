import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let debtId: number | undefined
  let saleId: string | undefined
  try {
    await ensureDatabaseSchema()
    debtId = Number((await params).id)
    const body = await _request.json()
    const debts = await getCollection<any>('debts')
    const sales = await getCollection<any>('sales')
    const debt = await debts.findOne({ id: debtId })
    if (!debt) return NextResponse.json({ ok: false, error: 'Debt record not found.' }, { status: 404 })
    if (debt.kind !== 'customer') return NextResponse.json({ ok: false, error: 'Only customer debts can be settled as sales.' }, { status: 400 })
    const amountDue = Number(debt.amount ?? 0)
    const paymentAmount = Number(body.amount ?? amountDue)
    if (debt.status === 'paid' || amountDue <= 0) return NextResponse.json({ ok: false, error: 'This debt is already paid.' }, { status: 409 })
    if (!Number.isInteger(paymentAmount) || paymentAmount <= 0 || paymentAmount > amountDue) {
      return NextResponse.json({ ok: false, error: `Enter an amount greater than 0 and no more than ${amountDue}.` }, { status: 400 })
    }

    const claimed = await debts.updateOne(
      { id: debtId, status: { $in: [null, 'unpaid'] }, amount: amountDue },
      { $set: { status: 'settling' } },
    )
    if (!claimed.modifiedCount) return NextResponse.json({ ok: false, error: 'This debt is already being settled.' }, { status: 409 })

    saleId = `CR-${debtId}-${Date.now()}`
    const fractionPaid = paymentAmount / Number(debt.original || amountDue)
    const items = (debt.items ?? []).map((item: any) => ({ ...item, qty: Number((Number(item.qty) * fractionPaid).toFixed(4)) }))
    const totalProfit = (debt.items ?? []).reduce((sum: number, item: any) => sum + (Number(item.price) - Number(item.buy)) * Number(item.qty), 0)
    const profit = totalProfit * fractionPaid
    const paidDate = new Date().toISOString().slice(0, 10)
    await sales.insertOne({
      id: saleId,
      date: paidDate,
      items,
      total: paymentAmount,
      profit,
      vat: Boolean(debt.vat),
      creditDebtId: debtId,
      paymentAmount,
      createdAt: new Date(),
    })
    const paidAmount = Number(debt.paidAmount ?? 0) + paymentAmount
    const remaining = Math.max(0, amountDue - paymentAmount)
    const settled = await debts.updateOne({ id: debtId, status: 'settling' }, {
      $set: {
        status: remaining === 0 ? 'paid' : 'unpaid',
        paidAt: remaining === 0 ? new Date() : null,
        paidAmount,
        amount: remaining,
        lastPaymentSaleId: saleId,
      },
      $addToSet: { paymentSaleIds: saleId },
    })
    if (!settled.modifiedCount) throw new Error('Debt status changed while payment was being recorded.')

    return NextResponse.json({ ok: true, sale: { id: saleId, date: paidDate, items, total: paymentAmount, profit, vat: Boolean(debt.vat) }, debt: { id: debtId, amount: remaining, original: Number(debt.original || amountDue), paidAmount, status: remaining === 0 ? 'paid' : 'unpaid' } })
  } catch (error) {
    if (debtId !== undefined) {
      try {
        if (saleId) await (await getCollection<any>('sales')).deleteOne({ id: saleId })
        await (await getCollection<any>('debts')).updateOne({ id: debtId, status: 'settling' }, { $set: { status: 'unpaid' } })
      } catch {
        // Leave recovery to the next manual review if the database is unavailable.
      }
    }
    const message = error instanceof Error ? error.message : 'Unable to settle debt.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}