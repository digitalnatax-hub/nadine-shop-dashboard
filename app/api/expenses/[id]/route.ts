import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await request.json()
    const expenses = await getCollection<any>('business_expenses')
    const expense = await expenses.findOne({ id })
    if (!expense) return NextResponse.json({ ok: false, error: 'Business expense not found.' }, { status: 404 })

    const category = String(body.category ?? expense.category).trim()
    const description = String(body.description ?? expense.description).trim()
    const supplier = String(body.supplier ?? expense.supplier ?? '').trim()
    const date = String(body.date ?? expense.date)
    const amountExclVat = Number(body.amountExclVat ?? expense.amountExclVat)
    const vatAmount = Number(body.vatAmount ?? expense.vatAmount ?? 0)
    const total = amountExclVat + vatAmount
    const paidAmount = Number(expense.paidAmount ?? 0)
    if (!category || !description || !Number.isFinite(amountExclVat) || amountExclVat <= 0 || !Number.isFinite(vatAmount) || vatAmount < 0 || total < paidAmount) {
      return NextResponse.json({ ok: false, error: 'Expense amounts must be valid and the new total cannot be below amounts already paid.' }, { status: 400 })
    }

    const debts = await getCollection<any>('debts')
    const debt = await debts.findOne({ expenseId: id, kind: 'supplier' })
    const outstanding = total - paidAmount
    const updatedExpense = { ...expense, category, description, supplier, date, amountExclVat, vatAmount, total, paymentStatus: outstanding === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid', updatedAt: new Date() }
    await expenses.updateOne({ _id: expense._id }, { $set: updatedExpense })

    if (debt) {
      await debts.updateOne({ _id: debt._id }, { $set: {
        name: supplier || `${category} expense`,
        amount: outstanding,
        original: outstanding + Number(debt.paidAmount ?? 0),
        status: outstanding === 0 ? 'paid' : 'unpaid',
        due: date,
        description,
      } })
    } else if (outstanding > 0) {
      const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
      await debts.insertOne({
        id: Number(last?.id ?? 0) + 1,
        name: supplier || `${category} expense`,
        phone: '',
        amount: outstanding,
        original: outstanding,
        paidAmount: 0,
        kind: 'supplier',
        due: date,
        status: 'unpaid',
        description,
        expenseId: id,
        source: 'business_expense',
        createdAt: new Date(),
      })
    }

    const paymentMethod = String(expense.paymentMethod ?? 'cash')
    if (paymentMethod === 'petty_cash') {
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `EXPENSE-${id}` })
      if (paidAmount > 0) {
        await (await getCollection<any>('petty_cash')).updateOne({ reference: id, type: 'business_expense_payment' }, { $set: {
          date,
          amount: paidAmount,
          reason: description,
          category,
          vatAmount: Math.min(vatAmount, vatAmount * Math.min(1, paidAmount / Math.max(total, 1))),
        } }, { upsert: true })
      } else {
        await (await getCollection<any>('petty_cash')).deleteOne({ reference: id, type: 'business_expense_payment' })
      }
    } else if (paidAmount > 0) {
      await (await getCollection<any>('petty_cash')).deleteOne({ reference: id, type: 'business_expense_payment' })
      await (await getCollection<any>('cash_movements')).updateOne({ id: `EXPENSE-${id}` }, { $set: { date, account: paymentMethod, type: 'business_expense_payment', amount: -paidAmount, reference: id } }, { upsert: true })
    } else {
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `EXPENSE-${id}` })
      await (await getCollection<any>('petty_cash')).deleteOne({ reference: id, type: 'business_expense_payment' })
    }

    return NextResponse.json({ ok: true, expense: updatedExpense })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update business expense.'
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const expenses = await getCollection<any>('business_expenses')
    const expense = await expenses.findOne({ id })
    if (!expense) return NextResponse.json({ ok: false, error: 'Business expense not found.' }, { status: 404 })
    const debts = await getCollection<any>('debts')
    const debt = await debts.findOne({ expenseId: id, kind: 'supplier' })
    if (Number(debt?.paidAmount ?? 0) > 0) return NextResponse.json({ ok: false, error: 'Reverse supplier payments before deleting this expense.' }, { status: 409 })

    await expenses.deleteOne({ _id: expense._id })
    if (debt) await debts.deleteOne({ _id: debt._id })
    await (await getCollection<any>('cash_movements')).deleteOne({ id: `EXPENSE-${id}` })
    await (await getCollection<any>('petty_cash')).deleteOne({ reference: id, type: 'business_expense_payment' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete business expense.'
    return NextResponse.json({ ok: false, error: message }, { status: 409 })
  }
}