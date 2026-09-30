import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const debtId = Number((await params).id)
    const debts = await getCollection<any>('debts')
    const result = await debts.deleteOne({
      id: debtId,
      kind: 'customer',
      $or: [{ status: 'paid' }, { amount: { $lte: 0 } }],
    })
    if (!result.deletedCount) {
      return NextResponse.json({ ok: false, error: 'Only fully paid customer debts can be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete debt record.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let debtId: number | undefined
  let claimedDebt: any
  let paymentId: string | undefined
  let cashMovementId: string | undefined
  let linkedExpense: any
  let linkedPurchase: any
  try {
    await ensureDatabaseSchema()
    debtId = Number((await params).id)
    const body = await _request.json()
    const debts = await getCollection<any>('debts')
    const debt = await debts.findOne({ id: debtId })
    if (!debt) return NextResponse.json({ ok: false, error: 'Debt record not found.' }, { status: 404 })
    const amountDue = Number(debt.amount ?? 0)
    const paymentAmount = Number(body.amount ?? amountDue)
    const paymentMethod = String(body.paymentMethod ?? 'cash')
    const allowedMethods = ['cash', 'petty_cash', 'bank', 'mobile_money', 'other']
    if (!['customer', 'supplier'].includes(debt.kind)) return NextResponse.json({ ok: false, error: 'Unsupported debt type.' }, { status: 400 })
    if (debt.status === 'paid' || amountDue <= 0) return NextResponse.json({ ok: false, error: 'This debt is already paid.' }, { status: 409 })
    if (!Number.isInteger(paymentAmount) || paymentAmount <= 0 || paymentAmount > amountDue) {
      return NextResponse.json({ ok: false, error: `Enter an amount greater than 0 and no more than ${amountDue}.` }, { status: 400 })
    }
    if (!allowedMethods.includes(paymentMethod)) return NextResponse.json({ ok: false, error: 'Select a valid payment method.' }, { status: 400 })

    const claimed = await debts.updateOne(
      { id: debtId, status: { $in: [null, 'unpaid'] }, amount: amountDue },
      { $set: { status: 'settling' } },
    )
    if (!claimed.modifiedCount) return NextResponse.json({ ok: false, error: 'This debt is already being settled.' }, { status: 409 })

    claimedDebt = debt
    const paidAmount = Number(debt.paidAmount ?? 0) + paymentAmount
    const remaining = Math.max(0, amountDue - paymentAmount)
    const paidDate = new Date().toISOString().slice(0, 10)
    const updated = await debts.updateOne({ id: debtId, status: 'settling' }, {
      $set: {
        status: remaining === 0 ? 'paid' : 'unpaid',
        paidAt: remaining === 0 ? new Date() : null,
        paidAmount,
        amount: remaining,
        lastPaymentDate: paidDate,
      },
    })
    if (!updated.modifiedCount) throw new Error('Debt status changed while payment was being recorded.')

    paymentId = `DP-${debtId}-${Date.now()}`
    const payment = {
      id: paymentId,
      debtId,
      kind: debt.kind,
      amount: paymentAmount,
      paymentMethod,
      date: paidDate,
      reference: String(body.reference ?? '').trim(),
      user: String(body.user ?? 'unknown'),
      createdAt: new Date(),
    }
    await (await getCollection<any>('debt_payments')).insertOne(payment)
    if (paymentMethod === 'petty_cash') {
      await (await getCollection<any>('petty_cash')).insertOne({
        id: `PC-${Date.now().toString().slice(-8)}`,
        date: paidDate,
        amount: paymentAmount,
        reason: `${debt.kind === 'customer' ? 'Customer payment' : 'Supplier payment'}: ${debt.name}`,
        type: debt.kind === 'customer' ? 'customer_payment' : 'supplier_payment',
        category: debt.kind === 'customer' ? 'Customer receivable settlement' : 'Supplier payable settlement',
        paymentMethod,
        reference: paymentId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    } else {
      cashMovementId = `PAY-${paymentId}`
      await (await getCollection<any>('cash_movements')).insertOne({
        id: cashMovementId,
        date: paidDate,
        account: paymentMethod,
        type: debt.kind === 'customer' ? 'customer_receipt' : 'supplier_payment',
        amount: debt.kind === 'customer' ? paymentAmount : -paymentAmount,
        reference: paymentId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    }
    if (debt.kind === 'customer' && debt.saleId) {
      await (await getCollection<any>('sales')).updateOne({ id: debt.saleId }, { $set: {
        paymentStatus: remaining === 0 ? 'paid' : 'partial',
        amountPaid: paidAmount,
        customerBalance: remaining,
      } })
    }
    if (debt.kind === 'supplier' && debt.expenseId) {
      const expenses = await getCollection<any>('business_expenses')
      linkedExpense = await expenses.findOne({ id: debt.expenseId })
      if (linkedExpense) {
        await expenses.updateOne({ id: debt.expenseId }, { $set: {
          paidAmount: Number(linkedExpense.paidAmount ?? 0) + paymentAmount,
          paymentStatus: remaining === 0 ? 'paid' : 'partial',
        } })
      }
    }
    if (debt.kind === 'supplier' && debt.purchaseId) {
      const purchases = await getCollection<any>('inventory_purchases')
      linkedPurchase = await purchases.findOne({ id: debt.purchaseId })
      if (linkedPurchase) {
        await purchases.updateOne({ id: debt.purchaseId }, { $set: { paidAmount: Number(linkedPurchase.paidAmount ?? 0) + paymentAmount } })
      }
    }

    return NextResponse.json({ ok: true, payment, debt: { id: debtId, kind: debt.kind, amount: remaining, original: Number(debt.original || amountDue), paidAmount, status: remaining === 0 ? 'paid' : 'unpaid' } })
  } catch (error) {
    if (debtId !== undefined && claimedDebt) {
      try {
        if (paymentId) await (await getCollection<any>('debt_payments')).deleteOne({ id: paymentId })
        if (cashMovementId) await (await getCollection<any>('cash_movements')).deleteOne({ id: cashMovementId })
        if (paymentId) await (await getCollection<any>('petty_cash')).deleteOne({ reference: paymentId })
        if (linkedExpense) await (await getCollection<any>('business_expenses')).updateOne({ id: linkedExpense.id }, { $set: { paidAmount: linkedExpense.paidAmount, paymentStatus: linkedExpense.paymentStatus } })
        if (linkedPurchase) await (await getCollection<any>('inventory_purchases')).updateOne({ id: linkedPurchase.id }, { $set: { paidAmount: linkedPurchase.paidAmount } })
        await (await getCollection<any>('debts')).updateOne({ id: debtId }, { $set: {
          status: claimedDebt.status ?? 'unpaid',
          amount: claimedDebt.amount,
          paidAmount: claimedDebt.paidAmount ?? 0,
          paidAt: claimedDebt.paidAt ?? null,
        } })
      } catch {
        // Leave recovery to the next manual review if the database is unavailable.
      }
    }
    const message = error instanceof Error ? error.message : 'Unable to settle debt.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}