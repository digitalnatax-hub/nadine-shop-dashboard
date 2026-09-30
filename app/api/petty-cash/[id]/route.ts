import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

async function changeLinkedBalance(entry: any, nextAmount: number, nextDate = entry.date) {
  const oldAmount = Number(entry.amount ?? 0)
  const amountDelta = nextAmount - oldAmount
  const debts = await getCollection<any>('debts')

  if (entry.type === 'customer_payment' || entry.type === 'supplier_payment') {
    const payments = await getCollection<any>('debt_payments')
    const payment = await payments.findOne({ id: entry.reference })
    if (!payment) throw new Error('The linked customer/supplier payment was not found.')
    const debt = await debts.findOne({ id: Number(payment.debtId) })
    if (!debt) throw new Error('The linked receivable/payable was not found.')
    const balance = Number(debt.amount ?? 0) - amountDelta
    const paidAmount = Number(debt.paidAmount ?? 0) + amountDelta
    if (balance < 0 || paidAmount < 0 || paidAmount > Number(debt.original ?? debt.amount)) throw new Error('This change would exceed the linked outstanding balance.')
    await debts.updateOne({ _id: debt._id }, { $set: { amount: balance, paidAmount, status: balance === 0 ? 'paid' : 'unpaid', paidAt: balance === 0 ? new Date() : null } })
    await payments.updateOne({ _id: payment._id }, { $set: { amount: nextAmount, date: nextDate } })
    if (debt.kind === 'customer' && debt.saleId) {
      await (await getCollection<any>('sales')).updateOne({ id: debt.saleId }, { $set: { paymentStatus: balance === 0 ? 'paid' : 'partial', amountPaid: paidAmount, customerBalance: balance } })
    }
    if (debt.kind === 'supplier' && debt.purchaseId) {
      await (await getCollection<any>('inventory_purchases')).updateOne({ id: debt.purchaseId }, { $inc: { paidAmount: amountDelta } })
    }
    if (debt.kind === 'supplier' && debt.expenseId) {
      const expenses = await getCollection<any>('business_expenses')
      const expense = await expenses.findOne({ id: debt.expenseId })
      if (expense) {
        const paid = Number(expense.paidAmount ?? 0) + amountDelta
        await expenses.updateOne({ _id: expense._id }, { $set: { paidAmount: paid, paymentStatus: paid >= Number(expense.total) ? 'paid' : paid > 0 ? 'partial' : 'unpaid' } })
      }
    }
    if (nextAmount === 0) await payments.deleteOne({ _id: payment._id })
    return
  }

  if (entry.type === 'inventory_purchase_payment') {
    const purchases = await getCollection<any>('inventory_purchases')
    const purchase = await purchases.findOne({ id: entry.reference })
    if (!purchase) throw new Error('The linked inventory purchase was not found.')
    const paid = Number(purchase.paidAmount ?? 0) + amountDelta
    const debt = await debts.findOne({ purchaseId: purchase.id, kind: 'supplier' })
    const outstanding = Number(purchase.total) - paid - Number(debt?.paidAmount ?? 0)
    if (paid < 0 || outstanding < 0) throw new Error('The payment cannot exceed the purchase balance.')
    await purchases.updateOne({ _id: purchase._id }, { $set: { paidAmount: paid } })
    if (debt) await debts.updateOne({ _id: debt._id }, { $set: { amount: outstanding, original: outstanding + Number(debt.paidAmount ?? 0), status: outstanding === 0 ? 'paid' : 'unpaid' } })
    else if (outstanding > 0) {
      const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
      await debts.insertOne({ id: Number(last?.id ?? 0) + 1, name: purchase.supplier, phone: '', amount: outstanding, original: outstanding, paidAmount: 0, kind: 'supplier', due: purchase.date, status: 'unpaid', description: `Inventory purchase ${purchase.id}`, purchaseId: purchase.id, createdAt: new Date() })
    }
    return
  }

  if (entry.type === 'business_expense_payment') {
    const expenses = await getCollection<any>('business_expenses')
    const expense = await expenses.findOne({ id: entry.reference })
    if (!expense) throw new Error('The linked business expense was not found.')
    const paid = Number(expense.paidAmount ?? 0) + amountDelta
    const debt = await debts.findOne({ expenseId: expense.id, kind: 'supplier' })
    const outstanding = Number(expense.total) - paid - Number(debt?.paidAmount ?? 0)
    if (paid < 0 || outstanding < 0) throw new Error('The payment cannot exceed the expense balance.')
    await expenses.updateOne({ _id: expense._id }, { $set: { paidAmount: paid, paymentStatus: outstanding === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' } })
    if (debt) await debts.updateOne({ _id: debt._id }, { $set: { amount: outstanding, original: outstanding + Number(debt.paidAmount ?? 0), status: outstanding === 0 ? 'paid' : 'unpaid' } })
    else if (outstanding > 0) {
      const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
      await debts.insertOne({ id: Number(last?.id ?? 0) + 1, name: expense.supplier || `${expense.category} expense`, phone: '', amount: outstanding, original: outstanding, paidAmount: 0, kind: 'supplier', due: expense.date, status: 'unpaid', description: expense.description, expenseId: expense.id, source: 'business_expense', createdAt: new Date() })
    }
    return
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await request.json()
    const entries = await getCollection<any>('petty_cash')
    const entry = await entries.findOne({ id })
    if (!entry) return NextResponse.json({ ok: false, error: 'Petty-cash transaction not found.' }, { status: 404 })
    const amount = Number(body.amount ?? entry.amount)
    const reason = String(body.reason ?? entry.reason ?? '').trim()
    const date = String(body.date ?? entry.date)
    const vatAmount = Number(body.vatAmount ?? entry.vatAmount ?? 0)
    const category = String(body.category ?? entry.category ?? '').trim()
    if (!Number.isFinite(amount) || amount <= 0 || !reason || !Number.isFinite(vatAmount) || vatAmount < 0 || vatAmount > amount) {
      return NextResponse.json({ ok: false, error: 'Enter a positive amount, reason, and valid VAT amount.' }, { status: 400 })
    }

    if (entry.type === 'transfer' || entry.type === 'bank_transfer_in' || entry.type === 'cash_transfer_in') {
      const account = entry.type === 'bank_transfer_in' ? 'bank' : entry.type === 'cash_transfer_in' ? 'cash' : entry.paymentMethod ?? 'cash'
      const movementAmount = entry.type === 'transfer' ? amount : -amount
      await (await getCollection<any>('cash_movements')).updateOne({ id: `TRANSFER-${id}` }, { $set: { date, account, amount: movementAmount, reference: id } })
    }
    await changeLinkedBalance(entry, amount, date)
    await entries.updateOne({ _id: entry._id }, { $set: { amount, reason, date, category, vatAmount } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update petty-cash transaction.'
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const entries = await getCollection<any>('petty_cash')
    const entry = await entries.findOne({ id })
    if (!entry) return NextResponse.json({ ok: false, error: 'Petty-cash transaction not found.' }, { status: 404 })
    await changeLinkedBalance(entry, 0)
    if (entry.type === 'transfer' || entry.type === 'bank_transfer_in' || entry.type === 'cash_transfer_in') {
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `TRANSFER-${id}` })
    }
    await entries.deleteOne({ _id: entry._id })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete petty-cash transaction.'
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}