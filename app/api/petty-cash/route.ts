import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const entries = await (await getCollection<any>('petty_cash')).find({}).sort({ date: 1, _id: 1 }).toArray()
    let balance = 0
    const withBalances = entries.map((entry) => {
      const amount = Number(entry.amount ?? 0)
      balance += ['cash_in', 'owner_contribution', 'customer_payment', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type) ? amount : -amount
      return { ...entry, runningBalance: balance }
    })
    return NextResponse.json({ ok: true, pettyCash: withBalances.reverse().map((entry) => ({
      id: entry.id ?? entry._id?.toString?.(),
      date: entry.date,
      amount: Number(entry.amount ?? 0),
      reason: entry.reason,
      type: entry.type ?? 'transfer',
      category: entry.category ?? '',
      vatAmount: Number(entry.vatAmount ?? 0),
      paymentMethod: entry.paymentMethod ?? 'petty_cash',
      reference: entry.reference ?? '',
      user: entry.user ?? 'unknown',
      runningBalance: Number(entry.runningBalance ?? 0),
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch petty cash records.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const amount = Number(body.amount ?? 0)
    const reason = String(body.reason ?? '').trim()
    const date = String(body.date ?? new Date().toISOString().slice(0, 10))
    const type = ['expense', 'other_expense', 'other_income', 'transfer', 'owner_drawing', 'owner_contribution', 'bank_transfer_in', 'cash_transfer_in'].includes(body.type) ? body.type : null
    const vatAmount = Number(body.vatAmount ?? 0)
    const category = String(body.category ?? (type === 'owner_drawing' ? 'Personal withdrawal' : type === 'owner_contribution' ? 'Owner capital contribution' : 'Operating expense')).trim()
    const paymentMethod = String(body.paymentMethod ?? 'cash')

    if (!Number.isFinite(amount) || amount <= 0 || !reason || !type || !Number.isFinite(vatAmount) || vatAmount < 0 || vatAmount > amount || !['expense', 'other_expense'].includes(type) && vatAmount > 0) {
      return NextResponse.json({ ok: false, error: 'A positive amount, reason, and valid transaction type are required.' }, { status: 400 })
    }
    if (type === 'transfer' && !['cash', 'bank', 'mobile_money', 'other'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Select a valid destination account for the transfer.' }, { status: 400 })
    }

    const entry = { id: `PC-${Date.now().toString().slice(-8)}`, date, amount, reason, type, category, vatAmount, paymentMethod: type === 'transfer' ? paymentMethod : 'petty_cash', reference: String(body.reference ?? '').trim(), user: String(body.user ?? 'unknown'), createdAt: new Date() }
    await (await getCollection<any>('petty_cash')).insertOne(entry)
    if (['transfer', 'bank_transfer_in', 'cash_transfer_in'].includes(type)) {
      try {
        const account = type === 'bank_transfer_in' ? 'bank' : type === 'cash_transfer_in' ? 'cash' : paymentMethod
        const transferAmount = type === 'transfer' ? amount : -amount
        await (await getCollection<any>('cash_movements')).insertOne({ id: `TRANSFER-${entry.id}`, date, account, type: 'petty_cash_transfer', amount: transferAmount, reference: entry.id, user: String(body.user ?? 'unknown'), createdAt: new Date() })
      } catch (error) {
        await (await getCollection<any>('petty_cash')).deleteOne({ id: entry.id })
        throw error
      }
    }
    return NextResponse.json({ ok: true, pettyCash: entry })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save petty cash record.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}