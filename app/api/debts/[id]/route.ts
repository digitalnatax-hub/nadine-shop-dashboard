import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let debtId: number | undefined
  let saleId: string | undefined
  try {
    await ensureDatabaseSchema()
    debtId = Number((await params).id)
    const debts = await getCollection<any>('debts')
    const sales = await getCollection<any>('sales')
    const debt = await debts.findOne({ id: debtId })
    if (!debt) return NextResponse.json({ ok: false, error: 'Debt record not found.' }, { status: 404 })
    if (debt.kind !== 'customer') return NextResponse.json({ ok: false, error: 'Only customer debts can be settled as sales.' }, { status: 400 })
    if (debt.status === 'paid') return NextResponse.json({ ok: false, error: 'This debt is already paid.' }, { status: 409 })

    const claimed = await debts.updateOne(
      { id: debtId, status: { $in: [null, 'unpaid'] } },
      { $set: { status: 'settling' } },
    )
    if (!claimed.modifiedCount) return NextResponse.json({ ok: false, error: 'This debt is already being settled.' }, { status: 409 })

    saleId = `CR-${debtId}-${Date.now()}`
    const items = (debt.items ?? []).map((item: any) => ({ ...item }))
    const profit = items.reduce((sum: number, item: any) => sum + (Number(item.price) - Number(item.buy)) * Number(item.qty), 0)
    const paidDate = new Date().toISOString().slice(0, 10)
    await sales.insertOne({
      id: saleId,
      date: paidDate,
      items,
      total: Number(debt.amount),
      profit,
      vat: Boolean(debt.vat),
      creditDebtId: debtId,
      createdAt: new Date(),
    })
    const settled = await debts.updateOne({ id: debtId, status: 'settling' }, { $set: { status: 'paid', paidAt: new Date(), paidAmount: Number(debt.amount), amount: 0, saleId } })
    if (!settled.modifiedCount) throw new Error('Debt status changed while payment was being recorded.')

    return NextResponse.json({ ok: true, sale: { id: saleId, date: paidDate, items, total: Number(debt.amount), profit, vat: Boolean(debt.vat) } })
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