import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await request.json()
    const payments = await getCollection<any>('debt_payments')
    const payment = await payments.findOne({ id })
    if (!payment) return NextResponse.json({ ok: false, error: 'Debt payment not found.' }, { status: 404 })
    const debt = await (await getCollection<any>('debts')).findOne({ id: Number(payment.debtId) })
    if (!debt) return NextResponse.json({ ok: false, error: 'Linked customer/supplier balance not found.' }, { status: 404 })

    const amount = Number(body.amount ?? payment.amount)
    const paymentMethod = String(body.paymentMethod ?? payment.paymentMethod)
    const date = String(body.date ?? payment.date)
    const previousAmount = Number(payment.amount ?? 0)
    const balance = Number(debt.amount ?? 0) + previousAmount - amount
    const paidAmount = Number(debt.paidAmount ?? 0) - previousAmount + amount
    if (!Number.isFinite(amount) || amount <= 0 || balance < 0 || paidAmount < 0 || paidAmount > Number(debt.original ?? debt.amount) || !['cash', 'bank', 'mobile_money', 'other', 'petty_cash'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Payment amount or method is invalid for the linked outstanding balance.' }, { status: 400 })
    }

    const debts = await getCollection<any>('debts')
    await debts.updateOne({ _id: debt._id }, { $set: { amount: balance, paidAmount, status: balance === 0 ? 'paid' : 'unpaid', paidAt: balance === 0 ? new Date() : null } })
    await payments.updateOne({ _id: payment._id }, { $set: { amount, paymentMethod, date, updatedAt: new Date() } })

    if (debt.kind === 'customer' && debt.saleId) {
      await (await getCollection<any>('sales')).updateOne({ id: debt.saleId }, { $set: { paymentStatus: balance === 0 ? 'paid' : 'partial', amountPaid: paidAmount, customerBalance: balance } })
    }
    if (debt.kind === 'supplier' && debt.purchaseId) {
      await (await getCollection<any>('inventory_purchases')).updateOne({ id: debt.purchaseId }, { $inc: { paidAmount: amount - previousAmount } })
    }
    if (debt.kind === 'supplier' && debt.expenseId) {
      const expenses = await getCollection<any>('business_expenses')
      const expense = await expenses.findOne({ id: debt.expenseId })
      if (expense) {
        const updatedPaid = Number(expense.paidAmount ?? 0) + amount - previousAmount
        await expenses.updateOne({ _id: expense._id }, { $set: { paidAmount: updatedPaid, paymentStatus: updatedPaid >= Number(expense.total) ? 'paid' : updatedPaid > 0 ? 'partial' : 'unpaid' } })
      }
    }

    const pettyCash = await getCollection<any>('petty_cash')
    const cashMovements = await getCollection<any>('cash_movements')
    await pettyCash.deleteOne({ reference: id })
    await cashMovements.deleteOne({ id: `PAY-${id}` })
    if (paymentMethod === 'petty_cash') {
      await pettyCash.insertOne({
        id: `PC-${Date.now().toString().slice(-8)}`,
        date,
        amount,
        reason: `${debt.kind === 'customer' ? 'Customer payment' : 'Supplier payment'}: ${debt.name}`,
        type: debt.kind === 'customer' ? 'customer_payment' : 'supplier_payment',
        category: debt.kind === 'customer' ? 'Customer receivable settlement' : 'Supplier payable settlement',
        paymentMethod,
        reference: id,
        user: String(body.user ?? payment.user ?? 'unknown'),
        createdAt: new Date(),
      })
    } else {
      await cashMovements.insertOne({
        id: `PAY-${id}`,
        date,
        account: paymentMethod,
        type: debt.kind === 'customer' ? 'customer_receipt' : 'supplier_payment',
        amount: debt.kind === 'customer' ? amount : -amount,
        reference: id,
        user: String(body.user ?? payment.user ?? 'unknown'),
        createdAt: new Date(),
      })
    }

    return NextResponse.json({ ok: true, payment: { ...payment, amount, paymentMethod, date }, debt: { id: debt.id, amount: balance, paidAmount } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update debt payment.'
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}