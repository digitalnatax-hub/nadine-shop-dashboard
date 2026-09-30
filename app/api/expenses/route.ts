import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function POST(request: Request) {
  let expenseId: string | undefined
  let debtId: number | undefined
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const category = String(body.category ?? '').trim()
    const description = String(body.description ?? '').trim()
    const supplier = String(body.supplier ?? '').trim()
    const date = String(body.date ?? new Date().toISOString().slice(0, 10))
    const amountExclVat = Number(body.amountExclVat ?? 0)
    const vatAmount = Number(body.vatAmount ?? 0)
    const total = amountExclVat + vatAmount
    const paymentStatus = body.paymentStatus === 'unpaid' ? 'unpaid' : 'paid'
    const paymentMethod = String(body.paymentMethod ?? 'cash')

    if (!category || !description || !Number.isFinite(amountExclVat) || amountExclVat <= 0 || !Number.isFinite(vatAmount) || vatAmount < 0) {
      return NextResponse.json({ ok: false, error: 'Category, description, and valid expense amounts are required.' }, { status: 400 })
    }
    if (!['cash', 'petty_cash', 'bank', 'mobile_money', 'other'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Select a valid payment method.' }, { status: 400 })
    }

    expenseId = `EX-${Date.now()}`
    const paidAmount = paymentStatus === 'paid' ? total : 0
    const expense = { id: expenseId, date, category, description, supplier, amountExclVat, vatAmount, total, paidAmount, paymentStatus, paymentMethod, user: String(body.user ?? 'unknown'), createdAt: new Date() }
    await (await getCollection<any>('business_expenses')).insertOne(expense)

    if (paymentStatus === 'unpaid') {
      const debts = await getCollection<any>('debts')
      const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
      debtId = Number(last?.id ?? 0) + 1
      await debts.insertOne({
        id: debtId,
        name: supplier || `${category} expense`,
        phone: '',
        amount: total,
        original: total,
        paidAmount: 0,
        kind: 'supplier',
        due: date,
        status: 'unpaid',
        description,
        expenseId,
        source: 'business_expense',
        createdAt: new Date(),
      })
    } else if (paymentMethod === 'petty_cash') {
      await (await getCollection<any>('petty_cash')).insertOne({
        id: `PC-${Date.now().toString().slice(-8)}`,
        date,
        amount: total,
        reason: description,
        type: 'business_expense_payment',
        category,
        vatAmount,
        paymentMethod,
        reference: expenseId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    } else {
      await (await getCollection<any>('cash_movements')).insertOne({
        id: `EXPENSE-${expenseId}`,
        date,
        account: paymentMethod,
        type: 'business_expense_payment',
        amount: -total,
        reference: expenseId,
        user: String(body.user ?? 'unknown'),
        createdAt: new Date(),
      })
    }

    return NextResponse.json({ ok: true, expense })
  } catch (error) {
    if (expenseId) {
      await (await getCollection<any>('business_expenses')).deleteOne({ id: expenseId })
      await (await getCollection<any>('cash_movements')).deleteOne({ id: `EXPENSE-${expenseId}` })
      await (await getCollection<any>('petty_cash')).deleteOne({ reference: expenseId })
    }
    if (debtId !== undefined) await (await getCollection<any>('debts')).deleteOne({ id: debtId })
    const message = error instanceof Error ? error.message : 'Unable to record business expense.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}