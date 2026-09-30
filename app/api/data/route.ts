import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()

    const productsCol = await getCollection<any>('products')
    const salesCol = await getCollection<any>('sales')
    const debtsCol = await getCollection<any>('debts')
    const pettyCashCol = await getCollection<any>('petty_cash')
    const debtPaymentsCol = await getCollection<any>('debt_payments')
    const purchasesCol = await getCollection<any>('inventory_purchases')
    const cashMovementsCol = await getCollection<any>('cash_movements')
    const expensesCol = await getCollection<any>('business_expenses')

    const products = await productsCol.find({}).sort({ _id: -1 }).toArray()
    let debts = await debtsCol.find({}).sort({ _id: -1 }).toArray()
    for (const debt of debts) {
      if (debt.kind !== 'customer' || debt.saleId || !Array.isArray(debt.items) || !debt.items.length) continue
      const saleId = `CR-${debt.id}-LEGACY`
      const total = Number(debt.original ?? debt.amount ?? 0)
      const vat = Boolean(debt.vat)
      const subtotal = vat ? total / 1.18 : total
      const profit = debt.items.reduce((sum: number, item: any) => sum + (Number(item.price ?? 0) - Number(item.buy ?? 0)) * Number(item.qty ?? 0), 0)
      const createdAt = debt.createdAt ? new Date(debt.createdAt) : new Date()
      const date = createdAt.toISOString().slice(0, 10)
      await salesCol.updateOne({ id: saleId }, { $setOnInsert: {
        id: saleId,
        date,
        customer: debt.name,
        items: debt.items,
        subtotal,
        total,
        vatRate: vat ? 0.18 : 0,
        vatAmount: total - subtotal,
        profit,
        vat,
        creditDebtId: Number(debt.id),
        paymentStatus: Number(debt.amount ?? 0) <= 0 ? 'paid' : Number(debt.paidAmount ?? 0) > 0 ? 'partial' : 'unpaid',
        amountPaid: Number(debt.paidAmount ?? 0),
        customerBalance: Number(debt.amount ?? 0),
        createdAt,
      } }, { upsert: true })
      await debtsCol.updateOne({ _id: debt._id, saleId: { $exists: false } }, { $set: { saleId } })
    }
    debts = await debtsCol.find({}).sort({ _id: -1 }).toArray()
    const sales = await salesCol.find({}).sort({ _id: -1 }).toArray()
    for (const sale of sales) {
      if (sale.paymentAmount !== undefined) {
        await cashMovementsCol.updateOne({ id: `PAY-LEGACY-${sale.id}` }, { $setOnInsert: {
          id: `PAY-LEGACY-${sale.id}`,
          date: sale.date ?? sale.sale_date,
          account: 'cash',
          type: 'customer_receipt',
          amount: Number(sale.paymentAmount ?? sale.total ?? 0),
          reference: sale.id,
          createdAt: sale.createdAt ?? new Date(),
        } }, { upsert: true })
      } else if (sale.creditDebtId === undefined) {
        await cashMovementsCol.updateOne({ id: `SALE-${sale.id}` }, { $setOnInsert: {
          id: `SALE-${sale.id}`,
          date: sale.date ?? sale.sale_date,
          account: 'cash',
          type: 'sale_receipt',
          amount: Number(sale.total ?? 0),
          reference: sale.id,
          createdAt: sale.createdAt ?? new Date(),
        } }, { upsert: true })
      }
    }
    const pettyCash = await pettyCashCol.find({}).sort({ _id: -1 }).toArray()
    const debtPayments = await debtPaymentsCol.find({}).sort({ date: -1, _id: -1 }).toArray()
    const purchases = await purchasesCol.find({}).sort({ date: -1, _id: -1 }).toArray()
    const expenses = await expensesCol.find({}).sort({ date: -1, _id: -1 }).toArray()
    const cashMovements = await cashMovementsCol.find({}).sort({ date: -1, _id: -1 }).toArray()
    const accountBalances = { cash: 0, bank: 0, mobile_money: 0, other: 0 }
    for (const movement of cashMovements) {
      const account = movement.account as keyof typeof accountBalances
      if (account in accountBalances) accountBalances[account] += Number(movement.amount ?? 0)
    }
    const chronologicalPettyCash = [...pettyCash].sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left._id).localeCompare(String(right._id)))
    let pettyCashBalance = 0
    const pettyCashBalances = new Map<string, number>()
    for (const entry of chronologicalPettyCash) {
      const amount = Number(entry.amount ?? 0)
      pettyCashBalance += ['cash_in', 'owner_contribution', 'customer_payment', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type) ? amount : -amount
      pettyCashBalances.set(String(entry.id ?? entry._id), pettyCashBalance)
    }

    return NextResponse.json({
      ok: true,
      products: products.map((product) => ({
        id: Number(product.id),
        name: product.name,
        category: product.category,
        stock: Number(product.stock ?? 0),
        unit: product.unit,
        buy: Number(product.buy ?? product.buy_price ?? 0),
        sell: Number(product.sell ?? product.sell_price ?? 0),
        min: Number(product.min ?? product.min_stock ?? 5),
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        date: sale.date ?? sale.sale_date,
        items: Array.isArray(sale.items) ? sale.items : [],
        total: Number(sale.total ?? 0),
        profit: Number(sale.profit ?? 0),
        vat: Boolean(sale.vat),
        vatRate: Number(sale.vatRate ?? (sale.vat ? 0.18 : 0)),
        vatAmount: Number(sale.vatAmount ?? (sale.vat ? Number(sale.total ?? 0) - Number(sale.total ?? 0) / 1.18 : 0)),
        customer: sale.customer ?? '',
        paymentStatus: sale.paymentStatus ?? (sale.paymentAmount !== undefined ? 'payment' : sale.creditDebtId ? 'unpaid' : 'paid'),
        amountPaid: Number(sale.amountPaid ?? sale.paymentAmount ?? (sale.creditDebtId ? 0 : sale.total ?? 0)),
        customerBalance: Number(sale.customerBalance ?? (sale.paymentAmount !== undefined ? 0 : sale.creditDebtId ? sale.total : 0)),
        creditDebtId: sale.creditDebtId,
      })),
      debts: debts.map((debt) => ({
        id: Number(debt.id),
        name: debt.name,
        phone: debt.phone ?? '',
        amount: Number(debt.amount ?? 0),
        original: Number(debt.original ?? debt.original_amount ?? debt.amount ?? 0),
        paidAmount: Number(debt.paidAmount ?? 0),
        kind: debt.kind,
        status: debt.status ?? 'unpaid',
        description: debt.description ?? '',
        items: Array.isArray(debt.items) ? debt.items : [],
        vat: Boolean(debt.vat),
        due: debt.due ? new Date(debt.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date',
      })),
      pettyCash: pettyCash.map((entry) => ({
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
        runningBalance: pettyCashBalances.get(String(entry.id ?? entry._id)) ?? 0,
      })),
      debtPayments: debtPayments.map((payment) => ({
        id: payment.id,
        debtId: Number(payment.debtId),
        kind: payment.kind,
        amount: Number(payment.amount ?? 0),
        paymentMethod: payment.paymentMethod ?? 'cash',
        date: payment.date,
        reference: payment.reference ?? '',
      })),
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        date: purchase.date,
        supplier: purchase.supplier,
        total: Number(purchase.total ?? 0),
        paidAmount: Number(purchase.paidAmount ?? 0),
        vatAmount: Number(purchase.vatAmount ?? 0),
        paymentMethod: purchase.paymentMethod ?? 'cash',
        items: purchase.items ?? [],
      })),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        date: expense.date,
        category: expense.category,
        description: expense.description,
        supplier: expense.supplier ?? '',
        amountExclVat: Number(expense.amountExclVat ?? 0),
        vatAmount: Number(expense.vatAmount ?? 0),
        total: Number(expense.total ?? 0),
        paidAmount: Number(expense.paidAmount ?? 0),
        paymentStatus: expense.paymentStatus,
        paymentMethod: expense.paymentMethod,
      })),
      accountBalances,
      cashMovements: cashMovements.map((movement) => ({
        id: movement.id,
        date: movement.date,
        account: movement.account,
        type: movement.type,
        amount: Number(movement.amount ?? 0),
        reference: movement.reference ?? '',
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load shop data.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
