import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let movement: any
  let claimed = false
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const movements = await getCollection<any>('cash_movements')
    movement = await movements.findOne({ id })
    if (!movement) return NextResponse.json({ ok: false, error: 'Cash movement not found.' }, { status: 404 })
    if (movement.type === 'sale_receipt') {
      const linkedSale = await (await getCollection<any>('sales')).findOne({ id: movement.reference })
      if (!linkedSale) {
        const removedMovement = await movements.deleteOne({ _id: movement._id, type: 'sale_receipt' })
        if (!removedMovement.deletedCount) return NextResponse.json({ ok: false, error: 'The orphaned sale receipt changed before it could be deleted.' }, { status: 409 })
        return NextResponse.json({ ok: true, removedOrphanedReceipt: true })
      }
      return NextResponse.json({ ok: false, error: 'This receipt must be reversed from its linked sale.' }, { status: 409 })
    }

    const claim = await movements.updateOne({ _id: movement._id, status: { $ne: 'reversing' } }, { $set: { status: 'reversing' } })
    if (!claim.modifiedCount) return NextResponse.json({ ok: false, error: 'This transaction is already being reversed.' }, { status: 409 })
    claimed = true

    const amount = Math.abs(Number(movement.amount ?? 0))
    if (movement.type === 'supplier_payment' || movement.type === 'customer_receipt') {
      const debtPayments = await getCollection<any>('debt_payments')
      const payment = await debtPayments.findOne({ id: movement.reference })
      if (!payment) throw new Error('The linked payment record was not found.')
      const debts = await getCollection<any>('debts')
      const debt = await debts.findOne({ id: Number(payment.debtId) })
      if (!debt) throw new Error('The linked account balance was not found.')
      const restoredBalance = Number(debt.amount ?? 0) + amount
      const restoredPaid = Math.max(0, Number(debt.paidAmount ?? 0) - amount)
      await debts.updateOne({ _id: debt._id }, { $set: {
        amount: restoredBalance,
        paidAmount: restoredPaid,
        status: 'unpaid',
        paidAt: null,
      } })

      if (debt.kind === 'customer' && debt.saleId) {
        await (await getCollection<any>('sales')).updateOne({ id: debt.saleId }, { $set: {
          paymentStatus: restoredPaid > 0 ? 'partial' : 'unpaid',
          amountPaid: restoredPaid,
          customerBalance: restoredBalance,
        } })
      }
      if (debt.kind === 'supplier' && debt.purchaseId) {
        await (await getCollection<any>('inventory_purchases')).updateOne({ id: debt.purchaseId }, { $inc: { paidAmount: -amount } })
      }
      if (debt.kind === 'supplier' && debt.expenseId) {
        const expenses = await getCollection<any>('business_expenses')
        const expense = await expenses.findOne({ id: debt.expenseId })
        if (expense) {
          const paidAmount = Math.max(0, Number(expense.paidAmount ?? 0) - amount)
          await expenses.updateOne({ id: debt.expenseId }, { $set: {
            paidAmount,
            paymentStatus: paidAmount === 0 ? 'unpaid' : paidAmount < Number(expense.total) ? 'partial' : 'paid',
          } })
        }
      }
      await debtPayments.deleteOne({ _id: payment._id })
    } else if (movement.type === 'inventory_purchase_payment') {
      const purchases = await getCollection<any>('inventory_purchases')
      const purchase = await purchases.findOne({ id: movement.reference })
      if (!purchase) throw new Error('The linked inventory purchase was not found.')
      const paidAmount = Math.max(0, Number(purchase.paidAmount ?? 0) - amount)
      await purchases.updateOne({ _id: purchase._id }, { $set: { paidAmount } })
      const debts = await getCollection<any>('debts')
      const debt = await debts.findOne({ purchaseId: purchase.id, kind: 'supplier' })
      if (debt) {
        await debts.updateOne({ _id: debt._id }, { $inc: { amount, original: amount }, $set: { status: 'unpaid' } })
      } else {
        const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
        const newAmount = amount
        await debts.insertOne({
          id: Number(last?.id ?? 0) + 1,
          name: purchase.supplier,
          phone: '',
          amount: newAmount,
          original: newAmount,
          paidAmount: 0,
          kind: 'supplier',
          due: purchase.date,
          status: 'unpaid',
          description: `Inventory purchase ${purchase.id}`,
          purchaseId: purchase.id,
          createdAt: new Date(),
        })
      }
    } else if (movement.type === 'business_expense_payment') {
      const expenses = await getCollection<any>('business_expenses')
      const expense = await expenses.findOne({ id: movement.reference })
      if (!expense) throw new Error('The linked business expense was not found.')
      await expenses.updateOne({ _id: expense._id }, { $set: { paidAmount: 0, paymentStatus: 'unpaid' } })
      const debts = await getCollection<any>('debts')
      const existingDebt = await debts.findOne({ expenseId: expense.id, kind: 'supplier' })
      if (!existingDebt) {
        const last = await debts.find({}).sort({ id: -1 }).limit(1).next()
        await debts.insertOne({
          id: Number(last?.id ?? 0) + 1,
          name: expense.supplier || `${expense.category} expense`,
          phone: '',
          amount: Number(expense.total),
          original: Number(expense.total),
          paidAmount: 0,
          kind: 'supplier',
          due: expense.date,
          status: 'unpaid',
          description: expense.description,
          expenseId: expense.id,
          source: 'business_expense',
          createdAt: new Date(),
        })
      }
    } else if (movement.type === 'petty_cash_transfer') {
      const removed = await (await getCollection<any>('petty_cash')).deleteOne({ id: movement.reference, type: { $in: ['transfer', 'bank_transfer_in', 'cash_transfer_in'] } })
      if (!removed.deletedCount) throw new Error('The paired petty-cash transfer was not found.')
    } else {
      throw new Error('This movement type cannot be reversed from the activity ledger.')
    }

    await movements.deleteOne({ _id: movement._id, status: 'reversing' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (claimed && movement) {
      await (await getCollection<any>('cash_movements')).updateOne({ _id: movement._id }, { $unset: { status: '' } }).catch(() => undefined)
    }
    const message = error instanceof Error ? error.message : 'Unable to reverse cash movement.'
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('not found') ? 404 : 409 })
  }
}